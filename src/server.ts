#!/usr/bin/env node

import 'dotenv/config';
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { createLazyEmbeddingProvider } from './embedding-provider.js';
import { DocumentManager } from './document-manager.js';
import { GeminiSearchService } from './gemini-search-service.js';
import { startWebServer } from './web-server.js';
import { parseFilters } from './metadata-utils.js';
import { deduplicateSearchResults, formatAgentSearchResponse, formatDocumentList } from './search-utils.js';

// Initialize server
const server = new FastMCP({
    name: "Documentation Server",
    version: "2.0.0",
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

// Update document metadata tool
server.addTool({
    name: "update_document_metadata",
    description: "Update a document's metadata (tags, folder, ticket, version, ...) keeping its id. Provided keys are merged; a null value removes the key. Chunks are re-embedded because tags are part of the indexed text.",
    parameters: z.object({
        id: z.string().describe("Document ID"),
        tags: z.array(z.string()).optional().describe("Replace the tags list"),
        folder: z.string().optional().describe("Folder, e.g. 'finutive/front'"),
        ticket: z.array(z.string()).optional().describe("Related ticket ids"),
        metadata: z.object({}).passthrough().optional().describe("Any other metadata keys to merge (null removes a key)"),
    }),
    execute: async ({ id, tags, folder, ticket, metadata }) => {
        try {
            const manager = await initializeDocumentManager();
            const patch: Record<string, any> = { ...(metadata || {}) };
            if (tags !== undefined) patch.tags = tags.map(t => t.toLowerCase());
            if (folder !== undefined) patch.folder = folder;
            if (ticket !== undefined) patch.ticket = ticket;
            const doc = await manager.updateDocumentMetadata(id, patch);
            if (!doc) return `Document not found: ${id}`;
            return JSON.stringify({ id: doc.id, title: doc.title, metadata: doc.metadata }, null, 2);
        } catch (error) {
            throw new Error(`Failed to update metadata: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// Update document content tool
server.addTool({
    name: "update_document",
    description: "Replace a document's content (and optionally title/metadata) keeping the same id. Chunks are rebuilt. A YAML front matter in content (tags, folder, ticket) is parsed into metadata.",
    parameters: z.object({
        id: z.string().describe("Document ID to update"),
        content: z.string().describe("The new full content"),
        title: z.string().optional().describe("New title (default: keep current)"),
        metadata: z.object({}).passthrough().optional().describe("Metadata to merge"),
    }),
    execute: async ({ id, content, title, metadata }) => {
        try {
            const manager = await initializeDocumentManager();
            const doc = await manager.updateDocument(id, content, title, metadata);
            if (!doc) return `Document not found: ${id}`;
            return `Document ${doc.id} updated ("${doc.title}", ${doc.chunks.length} chunks).`;
        } catch (error) {
            throw new Error(`Failed to update document: ${error instanceof Error ? error.message : String(error)}`);
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

// Search documents tool
server.addTool({
    name: "search_documents",
    description: "Search for chunks within a specific document using semantic similarity. Always tell the user if result is truncated because of length. for example if you recive a message like this in the response: 'Tool response was too long and was truncated'",
    parameters: z.object({
        document_id: z.string().describe("The ID of the document to search within"),
        query: z.string().describe("The search query"),
        limit: z.number().optional().default(10).describe("Maximum number of chunk results to return"),
        max_chars: z.number().optional().default(1200).describe("Maximum characters of each returned snippet"),
        tags: z.array(z.string()).optional().describe("Optional: only documents having ALL these tags"),
        folder: z.string().optional().describe("Optional: only documents in this folder (prefix match, e.g. 'finutive/front')"),
        ticket: z.string().optional().describe("Optional: only documents linked to this ticket id (e.g. '2447')"),
    }), execute: async (args) => {
        try {
            const manager = await initializeDocumentManager();
            // Controllo se il documento esiste prima di cercare
            const document = await manager.getDocument(args.document_id);
            if (!document) {
                throw new Error(`Document with ID '${args.document_id}' Not found. Use 'list_documents' to get all id of documents.`);
            }
            const results = await manager.searchDocuments(args.document_id, args.query, args.limit, parseFilters(args));

            const searchResults = await deduplicateSearchResults(results, manager);
            const res = await formatAgentSearchResponse(searchResults, manager, { maxChars: args.max_chars, limit: args.limit });
            return JSON.stringify(res, null, 2);
        } catch (error) {
            throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// Get document tool
server.addTool({
    name: "get_document",
    description: "Use this tool only when user explicitly requests it. Retrieve a specific document by ID. Always tell the user if result is truncated because of length. for example if you recive a message like this in the response: 'Tool response was too long and was truncated'",
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

            const documentList = formatDocumentList(documents);

            return JSON.stringify(documentList, null, 2);
        } catch (error) {
            throw new Error(`Failed to list documents: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// Search across all documents tool
server.addTool({
    name: "search_all_documents",
    description: "Search for relevant chunks across ALL documents in the knowledge base using semantic similarity (hybrid: full-text + vector). Useful for cross-document search when you don't know which document contains the answer.",
    parameters: z.object({
        query: z.string().describe("The search query"),
        limit: z.number().optional().default(10).describe("Maximum number of chunk results to return"),
        max_chars: z.number().optional().default(1200).describe("Maximum characters of each returned snippet"),
        tags: z.array(z.string()).optional().describe("Optional: only documents having ALL these tags"),
        folder: z.string().optional().describe("Optional: only documents in this folder (prefix match, e.g. 'finutive/front')"),
        ticket: z.string().optional().describe("Optional: only documents linked to this ticket id (e.g. '2447')"),
    }), execute: async (args) => {
        try {
            const manager = await initializeDocumentManager();
            const results = await manager.searchAllDocuments(args.query, args.limit, parseFilters(args));

            const searchResults = await deduplicateSearchResults(results, manager);
            const res = await formatAgentSearchResponse(searchResults, manager, { maxChars: args.max_chars, limit: args.limit });
            return JSON.stringify(res, null, 2);
        } catch (error) {
            throw new Error(`Cross-document search failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// MCP tool: get_context_window
server.addTool({
    name: "get_context_window",
    description: "Returns a window of parent content sections around a central parent_index. Use parent_index values from search results. Always tell the user if result is truncated because of length.",
    parameters: z.object({
        document_id: z.string().describe("The document ID"),
        parent_index: z.number().describe("The parent_index of the central section (from search results)"),
        before: z.number().default(1).describe("Number of previous parent sections to include"),
        after: z.number().default(1).describe("Number of next parent sections to include")
    }),
    async execute({ document_id, parent_index, before, after }) {
        const manager = await initializeDocumentManager();
        const result = await manager.getParentWindow(document_id, parent_index, before, after);
        if (!result) {
            throw new Error("Document not found or no parent sections available");
        }
        return JSON.stringify(result, null, 2);
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
// Optionally start web UI alongside MCP server, sharing the same DocumentManager
if (process.env.START_WEB_UI !== 'false') {
    initializeDocumentManager().then(manager => {
        return startWebServer(undefined, manager);
    }).then(() => {
        console.error('[Server] Web UI started (port=' + (process.env.WEB_PORT || '3080') + ')');
    }).catch(err => {
        console.error('[Server] Failed to start Web UI:', err instanceof Error ? err.message : String(err));
    });

    server.addTool({
        name: "get_ui_url",
        description: "Get the URL of the web UI. use this tool when user ask you to access the web interface, when the user ask you to upload a file or when the user ask you the uploads folder path. All these function are available in the web UI.",
        parameters: z.object({}),
        execute: async () => {
            try {
                
                let PORT = process.env.WEB_PORT || '3080';                
                return `Web UI URL: http://localhost:${PORT}\n\nYou can access the web interface using this URL.`;
            } catch (error) {
                throw new Error(`Failed to get web UI URL: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
    });
}


// if (process.env.START_WEB_UI !== undefined && process.env.START_WEB_UI !== 'true') {

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
    
// }


server.start({
    transportType: "stdio",
});
