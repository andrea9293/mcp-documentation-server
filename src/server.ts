#!/usr/bin/env node

import 'dotenv/config';
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { createLazyEmbeddingProvider } from './embedding-provider.js';
import { DocumentManager } from './document-manager.js';
import { GeminiSearchService } from './gemini-search-service.js';

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
        metadata: z.object({}).passthrough().optional().describe("Optional metadata for the document"),
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
    description: "Retrieve a specific document by ID. Always tell the user if result is truncated because of length. for example if you recive a message like this in the response: 'Tool response was too long and was truncated'",
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

// Add Gemini AI search tool (only if GEMINI_API_KEY is available)
if (process.env.GEMINI_API_KEY) {
    server.addTool({
        name: "search_documents_with_ai",
        description: "Search within a document using Gemini AI for advanced semantic analysis and content extraction.",
        parameters: z.object({
            document_id: z.string().describe("The ID of the document to search within"),
            query: z.string().describe("The search query for semantic analysis"),
        }),
        execute: async (args) => {
            try {
                const manager = await initializeDocumentManager();

                // Check if document exists
                const document = await manager.getDocument(args.document_id);
                if (!document) {
                    throw new Error(`Document with ID '${args.document_id}' not found. Use 'list_documents' to get available document IDs.`);
                }

                // Check if original file exists
                const dataDir = manager.getDataDir();
                const fs = await import('fs/promises');
                const files = await fs.readdir(dataDir);
                const originalFile = files.find(file =>
                    file.startsWith(args.document_id) && !file.endsWith('.json')
                );

                if (!originalFile) {
                    throw new Error(`Original file for document '${args.document_id}' not found. The document may have been processed without keeping the original file.`);
                }

                console.error(`[GeminiSearch] Starting AI-powered search for document ${args.document_id}`);

                // Perform AI search
                const result = await GeminiSearchService.searchDocumentWithGemini(
                    args.document_id,
                    args.query,
                    dataDir,
                    process.env.GEMINI_API_KEY
                );

                return JSON.stringify({
                    document_id: args.document_id,
                    document_title: document.title,
                    search_query: args.query,
                    ai_analysis: JSON.parse(result),
                    note: "This search was performed using Gemini AI for advanced semantic analysis of the original document file. Always verify the results for accuracy."
                }, null, 2);

            } catch (error) {
                throw new Error(`AI search failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
    });
    console.error('[Server] Gemini AI search tool enabled (GEMINI_API_KEY found)');
} else {
    console.error('[Server] Gemini AI search tool disabled (GEMINI_API_KEY not set)');
}

// Performance and Statistics tool
// server.addTool({
//     name: "get_performance_stats",
//     description: "Get performance statistics for indexing, caching, and scalability features",
//     parameters: z.object({}),
//     execute: async () => {
//         try {
//             const manager = await initializeDocumentManager();
//             const stats = manager.getStats();
            
//             return JSON.stringify({
//                 phase_1_scalability: {
//                     indexing: stats.indexing || { enabled: false },
//                     embedding_cache: stats.embedding_cache || { enabled: false },
//                     parallel_processing: { enabled: stats.features.parallelProcessing },
//                     streaming: { enabled: stats.features.streaming }
//                 },
//                 environment_variables: {
//                     MCP_INDEXING_ENABLED: process.env.MCP_INDEXING_ENABLED || 'true',
//                     MCP_CACHE_SIZE: process.env.MCP_CACHE_SIZE || '1000',
//                     MCP_PARALLEL_ENABLED: process.env.MCP_PARALLEL_ENABLED || 'true',
//                     MCP_MAX_WORKERS: process.env.MCP_MAX_WORKERS || '4',
//                     MCP_STREAMING_ENABLED: process.env.MCP_STREAMING_ENABLED || 'true',
//                     MCP_STREAM_CHUNK_SIZE: process.env.MCP_STREAM_CHUNK_SIZE || '65536',
//                     MCP_STREAM_FILE_SIZE_LIMIT: process.env.MCP_STREAM_FILE_SIZE_LIMIT || '10485760'
//                 },
//                 description: 'Phase 1 scalability improvements: O(1) indexing, LRU caching, parallel processing, and streaming'
//             }, null, 2);
//         } catch (error) {
//             throw new Error(`Failed to get performance stats: ${error instanceof Error ? error.message : String(error)}`);
//         }
//     },
// });

// Add resource for document access
// server.addResource({
//     name: "Documents Database",
//     uri: "file://./data",
//     mimeType: "application/json", async load() {
//         const manager = await initializeDocumentManager();
//         const documents = await manager.getAllDocuments();
//         return {
//             text: JSON.stringify(documents, null, 2),
//         };
//     },
// });

// Start the server
server.start({
    transportType: "stdio",
});
