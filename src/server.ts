#!/usr/bin/env node

import 'dotenv/config';
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { existsSync, mkdirSync } from "fs";
import { writeFile, readFile } from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { createLazyEmbeddingProvider, SimpleEmbeddingProvider } from './embedding-provider.js';
import { EmbeddingProvider } from './types.js';
import { IntelligentChunker } from './intelligent-chunker.js';
import { pdfToText } from 'pdf-ts';
import { getDefaultDataDir } from './utils.js';

// Types
interface DocumentChunk {
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
    embeddings?: number[];
    start_position: number;
    end_position: number;
    metadata?: Record<string, any>;
}

interface Document {
    id: string;
    title: string;
    content: string;
    metadata: Record<string, any>;
    chunks: DocumentChunk[];
    created_at: string;
    updated_at: string;
}

interface SearchResult {
    chunk: DocumentChunk;
    score: number;
}

// Document Manager
class DocumentManager {
    private dataDir: string;
    private uploadsDir: string;
    private embeddingProvider: EmbeddingProvider;
    private intelligentChunker: IntelligentChunker;
    
    constructor(embeddingProvider?: EmbeddingProvider) {
        // Always use default paths
        const baseDir = getDefaultDataDir();
        this.dataDir = path.join(baseDir, 'data');
        this.uploadsDir = path.join(baseDir, 'uploads');
        
        this.embeddingProvider = embeddingProvider || new SimpleEmbeddingProvider();
        this.intelligentChunker = new IntelligentChunker(this.embeddingProvider);
        this.ensureDataDir();
        this.ensureUploadsDir();
    }

    private ensureDataDir(): void {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
    }

    private ensureUploadsDir(): void {
        if (!existsSync(this.uploadsDir)) {
            mkdirSync(this.uploadsDir, { recursive: true });
        }
    }

    // Getter methods for directory paths
    getDataDir(): string {
        return path.resolve(this.dataDir);
    }

    getUploadsDir(): string {
        return path.resolve(this.uploadsDir);
    }

    getUploadsPath(): string {
        return path.resolve(this.uploadsDir);
    }

    private getDocumentPath(id: string): string {
        return path.join(this.dataDir, `${id}.json`);
    }

    async addDocument(title: string, content: string, metadata: Record<string, any> = {}): Promise<Document> {
        const id = this.generateId();
        const now = new Date().toISOString();

        // Create chunks using intelligent chunker
        const chunks = await this.intelligentChunker.createChunks(id, content, {
            maxSize: 500,
            overlap: 75,
            adaptiveSize: true,
            addContext: true
        });

        const document: Document = {
            id,
            title,
            content,
            metadata,
            chunks,
            created_at: now,
            updated_at: now,
        };

        await writeFile(this.getDocumentPath(id), JSON.stringify(document, null, 2));
        return document;
    }

    async getDocument(id: string): Promise<Document | null> {
        try {
            const data = await readFile(this.getDocumentPath(id), 'utf-8');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }
    
    async getOnlyContentDocument(id: string): Promise<Document | null> {
        try {
            const data = await readFile(this.getDocumentPath(id), 'utf-8');
            return JSON.parse(data).content;
        } catch {
            return null;
        }
    }
    async getAllDocuments(): Promise<Document[]> {
        // Use forward slashes for glob pattern to work on all platforms
        const globPattern = this.dataDir.replace(/\\/g, '/') + "/*.json";
        const files = await glob(globPattern);
        const documents: Document[] = [];

        for (const file of files) {
            try {
                const data = await readFile(file, 'utf-8');
                documents.push(JSON.parse(data));
            } catch {
                // Skip invalid files
            }
        }

        return documents;
    }

    async searchDocuments(documentId: string, query: string, limit = 10): Promise<SearchResult[]> {
        const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
        const document = await this.getDocument(documentId);

        if (!document) {
            return [];
        }

        const results: SearchResult[] = document.chunks
            .filter(chunk => chunk.embeddings && chunk.embeddings.length > 0)
            .map(chunk => ({
                chunk,
                score: this.cosineSimilarity(queryEmbedding, chunk.embeddings!)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        return results;
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    private generateId(): string {
        return Math.random().toString(36).substr(2, 9);
    }    
    
    /**
     * Extract text content from a PDF file
     * @param filePath Path to the PDF file
     * @returns Extracted text content
     */
    private async extractTextFromPdf(filePath: string): Promise<string> {
        try {
            const dataBuffer = await readFile(filePath);
            const text = await pdfToText(dataBuffer);
            
            if (!text || text.trim().length === 0) {
                throw new Error('No text found in PDF or PDF might be image-based');
            }
            
            return text;
        } catch (error) {
            throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async processUploadsFolder(): Promise<{ processed: number; errors: string[] }> {
        const supportedExtensions = ['.txt', '.md', '.pdf'];
        const errors: string[] = [];
        let processed = 0;

        try {
            // Get all supported files from uploads directory
            const pattern = this.uploadsDir.replace(/\\/g, '/') + "/*{.txt,.md,.pdf}";
            const files = await glob(pattern);

            for (const filePath of files) {
                try {
                    const fileName = path.basename(filePath);
                    const fileExtension = path.extname(fileName).toLowerCase();

                    if (!supportedExtensions.includes(fileExtension)) {
                        continue;
                    }

                    let content: string;

                    // Extract content based on file type
                    if (fileExtension === '.pdf') {
                        content = await this.extractTextFromPdf(filePath);
                    } else {
                        // For .txt and .md files
                        content = await readFile(filePath, 'utf-8');
                    }

                    if (!content.trim()) {
                        errors.push(`File ${fileName} is empty or contains no extractable text`);
                        continue;
                    }

                    // Create document title from filename (without extension)
                    const title = path.basename(fileName, fileExtension);

                    // Check if document with this filename already exists and remove it
                    const existingDoc = await this.findDocumentByTitle(title);
                    if (existingDoc) {
                        await this.removeDocument(existingDoc.id);
                    }

                    // Create new document with embeddings
                    await this.addDocument(title, content, {
                        source: 'upload',
                        originalFilename: fileName,
                        fileExtension: fileExtension,
                        processedAt: new Date().toISOString()
                    });

                    processed++;
                } catch (error) {
                    errors.push(`Error processing ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            return { processed, errors };
        } catch (error) {
            throw new Error(`Failed to process uploads folder: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async findDocumentByTitle(title: string): Promise<Document | null> {
        const documents = await this.getAllDocuments();
        return documents.find(doc => doc.title === title) || null;
    }

    private async removeDocument(documentId: string): Promise<void> {
        try {
            const documentPath = this.getDocumentPath(documentId);
            if (existsSync(documentPath)) {
                await import('fs/promises').then(fs => fs.unlink(documentPath));
            }
        } catch (error) {
            // Ignore errors when removing non-existent files
        }
    }

    async listUploadsFiles(): Promise<{ name: string; size: number; modified: string; supported: boolean }[]> {
        const supportedExtensions = ['.txt', '.md', '.pdf'];
        const files: { name: string; size: number; modified: string; supported: boolean }[] = [];

        try {
            const pattern = this.uploadsDir.replace(/\\/g, '/') + "/*";
            const filePaths = await glob(pattern);

            for (const filePath of filePaths) {
                const stats = await import('fs/promises').then(fs => fs.stat(filePath));
                if (stats.isFile()) {
                    const fileName = path.basename(filePath);
                    const fileExtension = path.extname(fileName).toLowerCase();
                    
                    files.push({
                        name: fileName,
                        size: stats.size,
                        modified: stats.mtime.toISOString(),
                        supported: supportedExtensions.includes(fileExtension)
                    });
                }
            }

            return files.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            throw new Error(`Failed to list uploads files: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async deleteDocument(documentId: string): Promise<boolean> {
        try {
            const documentPath = this.getDocumentPath(documentId);
            if (existsSync(documentPath)) {
                await import('fs/promises').then(fs => fs.unlink(documentPath));
                return true;
            }
            return false;
        } catch (error) {
            throw new Error(`Failed to delete document: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

// Initialize server
const server = new FastMCP({
    name: "Documentation Server",
    version: "1.0.0",
});

// Initialize with default embedding provider
let documentManager: DocumentManager;

async function initializeDocumentManager() {
    if (!documentManager) {
        // Get embedding model from environment variable
        const embeddingModel = process.env.MCP_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
        const embeddingProvider = createLazyEmbeddingProvider(embeddingModel);
          // Constructor will use default paths automatically
        documentManager = new DocumentManager(embeddingProvider);
        console.error(`Document manager initialized with: ${embeddingProvider.getModelName()} (lazy loading)`);
        console.error(`Data directory: ${documentManager.getDataDir()}`);
        console.error(`Uploads directory: ${documentManager.getUploadsDir()}`);
    }
    return documentManager;
}

// Add document tool
server.addTool({
    name: "add_document",
    description: "Add a new document to the knowledge base",
    parameters: z.object({
        title: z.string().describe("The title of the document"),
        content: z.string().describe("The content of the document"),
        metadata: z.record(z.any()).optional().describe("Optional metadata for the document"),
    }), execute: async (args) => {
        try {
            const manager = await initializeDocumentManager();
            const document = await manager.addDocument(
                args.title,
                args.content,
                args.metadata || {}
            );
            return `Document added successfully with ID: ${document.id}`;
        } catch (error) {
            throw new Error(`Failed to add document: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// Search documents tool
server.addTool({
    name: "search_documents",
    description: "Search for chunks within a specific document using semantic similarity. Always tell the user if result is truncated because of length. for example if you recive a message like this in the response: 'Tool response was too long and was truncated'",
    parameters: z.object({
        document_id: z.string().describe("The ID of the document to search within"),
        query: z.string().describe("The search query"),
        limit: z.number().optional().default(10).describe("Maximum number of chunk results to return"),
    }), execute: async (args) => {
        try {
            const manager = await initializeDocumentManager();
            // Controllo se il documento esiste prima di cercare
            const document = await manager.getDocument(args.document_id);
            if (!document) {
                throw new Error(`Document with ID '${args.document_id}' Not found. Use 'list_documents' to get all id of documents.`);
            }
            const results = await manager.searchDocuments(args.document_id, args.query, args.limit);

            if (results.length === 0) {
                return "No chunks found matching your query in the specified document.";
            }

            const searchResults = results.map(result => ({
                // chunk_id: result.chunk.id,
                document_id: result.chunk.document_id,
                chunk_index: result.chunk.chunk_index,
                score: result.score,
                content: result.chunk.content,
                // start_position: result.chunk.start_position,
                // end_position: result.chunk.end_position,
            }));
            const res = {
                hint_for_llm: "After identifying the relevant chunks, use the get_context_window tool to retrieve additional context around each chunk of interest. You can call get_context_window multiple times until you have gathered enough context to answer the question.",
                results: searchResults,
            }
            return JSON.stringify(res, null, 2);
        } catch (error) {
            throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// Get document tool
server.addTool({
    name: "get_document",
    description: "Retrieve a specific document by ID",
    parameters: z.object({
        id: z.string().describe("The document ID"),
    }), execute: async (args) => {
        try {
            const manager = await initializeDocumentManager();
            const document = await manager.getOnlyContentDocument(args.id);

            if (!document) {
                return `Document with ID ${args.id} not found.`;
            }

            return JSON.stringify(document, null, 2);
        } catch (error) {
            throw new Error(`Failed to retrieve document: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// List documents tool
server.addTool({
    name: "list_documents",
    description: "List all documents in the knowledge base",
    parameters: z.object({}), execute: async () => {
        try {
            const manager = await initializeDocumentManager();
            const documents = await manager.getAllDocuments();

            const documentList = documents.map(doc => ({
                id: doc.id,
                title: doc.title,
                created_at: doc.created_at,
                updated_at: doc.updated_at,
                metadata: doc.metadata,
                content_preview: doc.content.substring(0, 700) + "...",
                chunks_count: doc.chunks.length,
            }));

            return JSON.stringify(documentList, null, 2);
        } catch (error) {
            throw new Error(`Failed to list documents: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// Get uploads folder path tool
server.addTool({
    name: "get_uploads_path",
    description: "Get the absolute path to the uploads folder where you can manually place .txt and .md files",
    parameters: z.object({}),
    execute: async () => {
        try {
            const manager = await initializeDocumentManager();
            const uploadsPath = manager.getUploadsPath();
            return `Uploads folder path: ${uploadsPath}\n\nYou can place .txt and .md files in this folder, then use the 'process_uploads' tool to create embeddings for them.`;
        } catch (error) {
            throw new Error(`Failed to get uploads path: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// Process uploads folder tool
server.addTool({
    name: "process_uploads",
    description: "Process all .txt and .md files in the uploads folder and create embeddings for them",
    parameters: z.object({}), execute: async () => {
        try {
            const manager = await initializeDocumentManager();
            const result = await manager.processUploadsFolder();

            let message = `Processing completed!\n`;
            message += `- Files processed: ${result.processed}\n`;

            if (result.errors.length > 0) {
                message += `- Errors encountered: ${result.errors.length}\n`;
                message += `\nErrors:\n${result.errors.map(err => `  • ${err}`).join('\n')}`;
            }

            return message;
        } catch (error) {
            throw new Error(`Failed to process uploads: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// List uploads files tool
server.addTool({
    name: "list_uploads_files",
    description: "List all files in the uploads folder with their details",
    parameters: z.object({}), execute: async () => {
        try {
            const manager = await initializeDocumentManager();
            const files = await manager.listUploadsFiles();

            if (files.length === 0) {
                return "No files found in the uploads folder.";
            }

            const fileList = files.map(file => ({
                name: file.name,
                size_bytes: file.size,
                modified: file.modified,
                supported: file.supported,
                status: file.supported ? "Can be processed" : "Unsupported format"
            }));

            return JSON.stringify(fileList, null, 2);
        } catch (error) {
            throw new Error(`Failed to list uploads files: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// Delete document tool
server.addTool({
    name: "delete_document",
    description: "Delete a document from the collection",
    parameters: z.object({
        id: z.string().describe("Document ID to delete")
    }),
    execute: async ({ id }) => {
        try {
            const manager = await initializeDocumentManager();
            
            // Check if document exists first
            const document = await manager.getDocument(id);
            if (!document) {
                return `Document not found: ${id}`;
            }

            // Delete the document
            const success = await manager.deleteDocument(id);
            
            if (success) {
                return `Document "${document.title}" (${id}) has been deleted successfully.`;
            } else {
                return `Document not found or already deleted: ${id}`;
            }
        } catch (error) {
            throw new Error(`Failed to delete document: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});


// MCP tool: get_context_window
server.addTool({
    name: "get_context_window",
    description: "Returns a window of chunks around a central chunk given document_id, chunk_index, before, after. Always tell the user if result is truncated because of length. for example if you recive a message like this in the response: 'Tool response was too long and was truncated'",
    parameters: z.object({
        document_id: z.string().describe("The document ID"),
        chunk_index: z.number().describe("The index of the central chunk"),
        before: z.number().default(1).describe("Number of previous chunks to include"),
        after: z.number().default(1).describe("Number of next chunks to include")
    }),
    async execute({ document_id, chunk_index, before, after }) {
        const manager = await initializeDocumentManager();
        const document = await manager.getDocument(document_id);
        if (!document || !document.chunks || !Array.isArray(document.chunks)) {
            throw new Error("Document or chunk not found");
        }
        const total = document.chunks.length;
        let windowChunks;
        let range;
        
        const start = Math.max(0, chunk_index - before);
        const end = Math.min(total, chunk_index + after + 1);
        windowChunks = document.chunks.slice(start, end).map(chunk => ({
            chunk_index: chunk.chunk_index,
            content: chunk.content,
            // start_position: chunk.start_position,
            // end_position: chunk.end_position,
            // type: chunk.metadata?.type || null
        }));
        range = [start, end - 1];
        
        return JSON.stringify({
            window: windowChunks,
            center: chunk_index,
            // range,
            total_chunks: total
        }, null, 2);
    }
});

// Add resource for document access
server.addResource({
    name: "Documents Database",
    uri: "file://./data",
    mimeType: "application/json", async load() {
        const manager = await initializeDocumentManager();
        const documents = await manager.getAllDocuments();
        return {
            text: JSON.stringify(documents, null, 2),
        };
    },
});

// Start the server
server.start({
    transportType: "stdio",
});
