#!/usr/bin/env node

import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { createLazyEmbeddingProvider } from './embedding-provider.js';
import { DocumentManager } from './document-manager.js';
import { GeminiSearchService } from './gemini-search-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/**
 * Start the web UI server. Returns the http.Server instance.
 * Call with `START_WEB_UI=false` to disable automatic start.
 */
export async function startWebServer(portArg?: number) {
    const PORT = parseInt(String(portArg || process.env.WEB_PORT || '3080'));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from public directory
const publicDir = path.join(__dirname, '..', 'src', 'public');
const distPublicDir = path.join(__dirname, 'public');
// Try dist/public first (production), fall back to src/public (dev)

const staticDir = existsSync(distPublicDir) ? distPublicDir : publicDir;
app.use(express.static(staticDir));

// Lazy document manager initialization
let documentManager: DocumentManager;

async function getManager(): Promise<DocumentManager> {
    if (!documentManager) {
        const embeddingModel = process.env.MCP_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
        const embeddingProvider = createLazyEmbeddingProvider(embeddingModel);
        documentManager = new DocumentManager(embeddingProvider);
        console.error(`[WebServer] Document manager initialized with: ${embeddingProvider.getModelName()}`);
    }
    return documentManager;
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
        const manager = await getManager();
        cb(null, manager.getUploadsDir());
    },
    filename: (_req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage });

// ============ REST API ROUTES ============

// GET /api/documents — list all documents
app.get('/api/documents', async (_req, res) => {
    try {
        const manager = await getManager();
        const documents = await manager.getAllDocuments();
        const documentList = documents.map(doc => ({
            id: doc.id,
            title: doc.title,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
            metadata: doc.metadata,
            content_preview: doc.content.substring(0, 700),
            chunks_count: doc.chunks.length,
        }));
        res.json(documentList);
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// GET /api/documents/:id — get a single document
app.get('/api/documents/:id', async (req, res): Promise<void> => {
    try {
        const manager = await getManager();
        const document = await manager.getDocument(req.params.id);
        if (!document) {
            res.status(404).json({ error: `Document not found: ${req.params.id}` });
            return;
        }
        res.json(document);
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// POST /api/documents — add a new document
app.post('/api/documents', async (req, res): Promise<void> => {
    try {
        const { title, content, metadata } = req.body;
        if (!title || !content) {
            res.status(400).json({ error: 'Title and content are required' });
            return;
        }
        const manager = await getManager();
        const document = await manager.addDocument(title, content, metadata || {});
        res.json({ id: document.id, title: document.title, message: 'Document added successfully' });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// DELETE /api/documents/:id — delete a document
app.delete('/api/documents/:id', async (req, res): Promise<void> => {
    try {
        const manager = await getManager();
        const document = await manager.getDocument(req.params.id);
        if (!document) {
            res.status(404).json({ error: `Document not found: ${req.params.id}` });
            return;
        }
        const success = await manager.deleteDocument(req.params.id);
        res.json({ success, message: success ? `Document "${document.title}" deleted` : 'Delete failed' });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// POST /api/search — search within a specific document
app.post('/api/search', async (req, res): Promise<void> => {
    try {
        const { document_id, query, limit } = req.body;
        if (!document_id || !query) {
            res.status(400).json({ error: 'document_id and query are required' });
            return;
        }
        const manager = await getManager();
        const document = await manager.getDocument(document_id);
        if (!document) {
            res.status(404).json({ error: `Document not found: ${document_id}` });
            return;
        }
        const results = await manager.searchDocuments(document_id, query, limit || 10);
        res.json(results.map(r => ({
            document_id: r.chunk.document_id,
            chunk_index: r.chunk.chunk_index,
            score: r.score,
            content: r.chunk.content,
        })));
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// POST /api/search-all — search across all documents
app.post('/api/search-all', async (req, res): Promise<void> => {
    try {
        const { query, limit } = req.body;
        if (!query) {
            res.status(400).json({ error: 'query is required' });
            return;
        }
        const manager = await getManager();
        const results = await manager.searchAllDocuments(query, limit || 10);
        res.json(results.map(r => ({
            document_id: r.chunk.document_id,
            chunk_index: r.chunk.chunk_index,
            score: r.score,
            content: r.chunk.content,
        })));
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// POST /api/context-window — get context window around a chunk
app.post('/api/context-window', async (req, res): Promise<void> => {
    try {
        const { document_id, chunk_index, before, after } = req.body;
        if (!document_id || chunk_index === undefined) {
            res.status(400).json({ error: 'document_id and chunk_index are required' });
            return;
        }
        const manager = await getManager();
        const document = await manager.getDocument(document_id);
        if (!document || !document.chunks) {
            res.status(404).json({ error: 'Document or chunks not found' });
            return;
        }
        const total = document.chunks.length;
        const start = Math.max(0, chunk_index - (before || 1));
        const end = Math.min(total, chunk_index + (after || 1) + 1);
        const windowChunks = document.chunks.slice(start, end).map(chunk => ({
            chunk_index: chunk.chunk_index,
            content: chunk.content,
        }));
        res.json({ window: windowChunks, center: chunk_index, total_chunks: total });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// GET /api/uploads — list files in uploads folder
app.get('/api/uploads', async (_req, res) => {
    try {
        const manager = await getManager();
        const files = await manager.listUploadsFiles();
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// GET /api/uploads/path — get uploads path
app.get('/api/uploads/path', async (_req, res) => {
    try {
        const manager = await getManager();
        res.json({ path: manager.getUploadsPath() });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// POST /api/uploads/process — process uploads folder
app.post('/api/uploads/process', async (_req, res) => {
    try {
        const manager = await getManager();
        const result = await manager.processUploadsFolder();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// POST /api/uploads/upload — upload files to the uploads folder
app.post('/api/uploads/upload', upload.array('files', 20), async (req, res): Promise<void> => {
    try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            res.status(400).json({ error: 'No files uploaded' });
            return;
        }
        res.json({
            uploaded: files.length,
            files: files.map(f => ({ name: f.originalname, size: f.size })),
        });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// POST /api/search-ai — AI-powered search (Gemini)
app.post('/api/search-ai', async (req, res): Promise<void> => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            res.status(400).json({ error: 'GEMINI_API_KEY is not set. AI search is not available.' });
            return;
        }
        const { document_id, query } = req.body;
        if (!document_id || !query) {
            res.status(400).json({ error: 'document_id and query are required' });
            return;
        }
        const manager = await getManager();
        const document = await manager.getDocument(document_id);
        if (!document) {
            res.status(404).json({ error: `Document not found: ${document_id}` });
            return;
        }
        const dataDir = manager.getDataDir();
        const fs = await import('fs/promises');
        const files = await fs.readdir(dataDir);
        const originalFile = files.find(file =>
            file.startsWith(document_id) && !file.endsWith('.json') && !file.endsWith('.msp')
        );
        if (!originalFile) {
            res.status(404).json({ error: 'Original file for this document not found.' });
            return;
        }
        const result = await GeminiSearchService.searchDocumentWithGemini(
            document_id, query, dataDir, process.env.GEMINI_API_KEY
        );
        res.json({
            document_id,
            document_title: document.title,
            search_query: query,
            ai_analysis: JSON.parse(result),
        });
    } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
});

// GET /api/config — server config info
app.get('/api/config', (_req, res) => {
    res.json({
        gemini_available: !!process.env.GEMINI_API_KEY,
        embedding_model: process.env.MCP_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
    });
});

// Catch-all: serve index.html for SPA routing
app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
});

    // Start server
    const server = app.listen(PORT, () => {
        console.log(`\n  🌐 MCP Documentation Server - Web UI`);
        console.log(`  ────────────────────────────────────`);
        console.log(`  Local:   http://localhost:${PORT}`);
        console.log(`  Network: http://0.0.0.0:${PORT}\n`);
    });

    return server;
}

// If run directly, start the web server
if (process.argv[1] === __filename) {
    startWebServer().catch(err => console.error('[WebServer] Failed to start', err));
}
