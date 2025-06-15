#!/usr/bin/env node

import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import * as path from 'path';
import { DocumentManager, FileDocumentStorage } from './document-manager.js';
import { SearchEngine } from './search-engine.js';
import { createLazyEmbeddingProvider } from './embedding-provider.js';
import { getDefaultDataDir, formatFileSize, formatSimilarityScore, extractExcerpt, inferContentType, normalizeText } from './utils.js';
import { AddDocumentRequest, SearchRequest } from './types.js';

// Configuration
const DATA_DIR = process.env.MCP_DATA_DIR || getDefaultDataDir();
const EMBEDDING_MODEL = process.env.MCP_EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
const MAX_DOCUMENT_SIZE = parseInt(process.env.MCP_MAX_DOCUMENT_SIZE || '1048576'); // 1MB default
const DEFAULT_SEARCH_LIMIT = parseInt(process.env.MCP_SEARCH_LIMIT || '10');

// Initialize components
let searchEngine: SearchEngine;
let documentManager: DocumentManager;
let isInitialized = false;

async function initializeServer() {
    if (isInitialized) return;

    try {
        console.error('Initializing MCP Documentation Server...');
        console.error(`Using embedding model: ${EMBEDDING_MODEL}`);

        // Create embedding provider with configured model
        const embeddingProvider = createLazyEmbeddingProvider(EMBEDDING_MODEL);
        console.error(`Embedding provider: ${embeddingProvider.constructor.name} (${embeddingProvider.getModelName()})`);

        // Create storage and document manager
        const storage = new FileDocumentStorage(DATA_DIR);
        documentManager = new DocumentManager(storage);

        // Create search engine
        searchEngine = new SearchEngine(documentManager, embeddingProvider);

        console.error(`Data directory: ${DATA_DIR}`);
        console.error('MCP Documentation Server initialized successfully');
        console.error('Note: Embedding model will be loaded on first use');
        isInitialized = true;
    } catch (error) {
        console.error('Failed to initialize server:', error);
        throw error;
    }
}

// Create FastMCP server
const server = new FastMCP({
    name: 'mcp-documentation-server',
    version: '1.0.0', instructions: `
This server provides document management and semantic search capabilities.

Available tools:
- add_document: Add a new document with metadata
- search_documents: Search documents using semantic similarity
- get_document: Retrieve a specific document by ID
- list_documents: List all available documents
- delete_document: Remove a document from the collection
- get_uploads_path: Get the path to the uploads folder
- list_upload_files: List files in the uploads folder
- process_upload_files: Process and add all .txt/.md files from uploads

The server uses embeddings for semantic search, allowing you to find relevant documents even when they don't contain exact keyword matches.
Configure the embedding model using the MCP_EMBEDDING_MODEL environment variable (defaults to 'Xenova/all-MiniLM-L6-v2').
  `.trim(),
});

// Add document tool
server.addTool({
    name: 'add_document',
    description: 'Add a new document to the collection',
    parameters: z.object({
        title: z.string().min(1).max(200).describe('Document title'),
        content: z.string().min(1).describe('Document content'),
        author: z.string().optional().describe('Document author'),
        tags: z.array(z.string()).optional().describe('Document tags'),
        description: z.string().optional().describe('Document description'),
        contentType: z.string().optional().describe('Content type (e.g., text/markdown)')
    }),
    execute: async (args, { log }) => {
        await initializeServer();

        if (!searchEngine.isReady()) {
            throw new Error('Search engine is not ready. Please try again.');
        }

        const { title, content, author, tags, description, contentType } = args;

        // Validate content size
        if (content.length > MAX_DOCUMENT_SIZE) {
            throw new Error(`Document too large. Maximum size: ${formatFileSize(MAX_DOCUMENT_SIZE)}`);
        }

        log.info('Adding document', { title, contentLength: content.length });

        try {
            // Normalize content
            const normalizedContent = normalizeText(content);
            const inferredContentType = contentType || inferContentType(title, normalizedContent);

            // Add document
            const document = await searchEngine.addDocument(title, normalizedContent, {
                author,
                tags,
                description,
                contentType: inferredContentType
            });

            log.info('Document added successfully', { id: document.id });

            return {
                content: [
                    {
                        type: 'text',
                        text: `Document added successfully!
            
ID: ${document.id}
Title: ${document.title}
Size: ${formatFileSize(document.size)}
Content Type: ${document.contentType}
Created: ${document.createdAt.toISOString()}
${document.tags && document.tags.length > 0 ? `Tags: ${document.tags.join(', ')}` : ''}
${document.author ? `Author: ${document.author}` : ''}
${document.description ? `Description: ${document.description}` : ''}`
                    }
                ]
            };
        } catch (error) {
            log.error('Failed to add document', { error: String(error) });
            throw new Error(`Failed to add document: ${error}`);
        }
    }
});

// Search documents tool
server.addTool({
    name: 'search_documents',
    description: 'Search documents using semantic similarity',
    parameters: z.object({
        query: z.string().min(1).describe('Search query'),
        limit: z.number().min(1).max(50).optional().describe('Maximum number of results (default: 10)'),
        threshold: z.number().min(0).max(1).optional().describe('Similarity threshold (0.0-1.0, default: 0.0)'),
        includeContent: z.boolean().optional().describe('Include full content in results (default: false)'),
        tags: z.array(z.string()).optional().describe('Filter by tags'),
        author: z.string().optional().describe('Filter by author'),
        contentType: z.string().optional().describe('Filter by content type')
    }),
    execute: async (args, { log }) => {
        await initializeServer();

        if (!searchEngine.isReady()) {
            throw new Error('Search engine is not ready. Please try again.');
        }

        const { query, limit = DEFAULT_SEARCH_LIMIT, threshold = 0.0, includeContent = false, tags, author, contentType } = args;

        log.info('Searching documents', { query, limit, threshold });

        try {
            const results = await searchEngine.search(query, {
                limit,
                threshold,
                includeContent,
                filters: {
                    tags,
                    author,
                    contentType
                }
            });

            if (results.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `No documents found matching your query: "${query}"`
                        }
                    ]
                };
            }

            log.info('Search completed', { resultCount: results.length });

            const searchTerms = query.toLowerCase().split(/\s+/);
            const resultText = results.map((result, index) => {
                const doc = result.document;
                const excerpt = includeContent ? doc.content : extractExcerpt(doc.content, searchTerms);

                return `${index + 1}. **${doc.title}** (${formatSimilarityScore(result.score)})
ID: ${doc.id}
${doc.author ? `Author: ${doc.author}` : ''}
${doc.tags && doc.tags.length > 0 ? `Tags: ${doc.tags.join(', ')}` : ''}
Size: ${formatFileSize(doc.size)}
Created: ${doc.createdAt.toLocaleDateString()}
${doc.description ? `Description: ${doc.description}` : ''}

${includeContent ? '**Content:**' : '**Excerpt:**'}
${excerpt}
`;
            }).join('\n---\n');

            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${results.length} document(s) matching "${query}":\n\n${resultText}`
                    }
                ]
            };
        } catch (error) {
            log.error('Search failed', { error: String(error) });
            throw new Error(`Search failed: ${error}`);
        }
    }
});

// Get document tool
server.addTool({
    name: 'get_document',
    description: 'Retrieve a specific document by ID',
    parameters: z.object({
        id: z.string().describe('Document ID'),
        includeContent: z.boolean().optional().describe('Include full content (default: true)')
    }),
    execute: async (args, { log }) => {
        await initializeServer();

        const { id, includeContent = true } = args;

        log.info('Retrieving document', { id });

        try {
            const document = await searchEngine.getDocument(id);

            if (!document) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Document not found: ${id}`
                        }
                    ]
                };
            }

            log.info('Document retrieved', { id, title: document.title });

            const content = includeContent ? document.content : extractExcerpt(document.content, []);

            return {
                content: [
                    {
                        type: 'text',
                        text: `**${document.title}**

ID: ${document.id}
${document.author ? `Author: ${document.author}` : ''}
${document.tags && document.tags.length > 0 ? `Tags: ${document.tags.join(', ')}` : ''}
Content Type: ${document.contentType}
Size: ${formatFileSize(document.size)}
Created: ${document.createdAt.toISOString()}
Updated: ${document.updatedAt.toISOString()}
${document.description ? `Description: ${document.description}` : ''}

${includeContent ? '**Content:**' : '**Excerpt:**'}
${content}`
                    }
                ]
            };
        } catch (error) {
            log.error('Failed to retrieve document', { error: String(error) });
            throw new Error(`Failed to retrieve document: ${error}`);
        }
    }
});

// List documents tool
server.addTool({
    name: 'list_documents',
    description: 'List all available documents',
    parameters: z.object({
        tags: z.array(z.string()).optional().describe('Filter by tags'),
        author: z.string().optional().describe('Filter by author'),
        contentType: z.string().optional().describe('Filter by content type')
    }),
    execute: async (args, { log }) => {
        await initializeServer();

        const { tags, author, contentType } = args;

        log.info('Listing documents', { filters: { tags, author, contentType } });

        try {
            let documents = await searchEngine.listDocuments();

            // Apply filters
            if (tags && tags.length > 0) {
                documents = documents.filter(doc =>
                    doc.tags && tags.some(tag => doc.tags!.includes(tag))
                );
            }

            if (author) {
                documents = documents.filter(doc => doc.author === author);
            }

            if (contentType) {
                documents = documents.filter(doc => doc.contentType === contentType);
            }

            if (documents.length === 0) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'No documents found matching the specified filters.'
                        }
                    ]
                };
            }

            log.info('Documents listed', { count: documents.length });

            // Sort by creation date (newest first)
            documents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            const documentList = documents.map((doc, index) => {
                return `${index + 1}. **${doc.title}**
ID: ${doc.id}
${doc.author ? `Author: ${doc.author}` : ''}
${doc.tags && doc.tags.length > 0 ? `Tags: ${doc.tags.join(', ')}` : ''}
Content Type: ${doc.contentType}
Size: ${formatFileSize(doc.size)}
Created: ${doc.createdAt.toLocaleDateString()}
${doc.description ? `Description: ${doc.description}` : ''}`;
            }).join('\n\n');

            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${documents.length} document(s):\n\n${documentList}`
                    }
                ]
            };
        } catch (error) {
            log.error('Failed to list documents', { error: String(error) });
            throw new Error(`Failed to list documents: ${error}`);
        }
    }
});

// Delete document tool
server.addTool({
    name: 'delete_document',
    description: 'Delete a document from the collection',
    parameters: z.object({
        id: z.string().describe('Document ID to delete')
    }),
    execute: async (args, { log }) => {
        await initializeServer();

        const { id } = args;

        log.info('Deleting document', { id });

        try {
            // Check if document exists
            const document = await searchEngine.getDocument(id);
            if (!document) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Document not found: ${id}`
                        }
                    ]
                };
            }

            // Delete the document
            const success = await searchEngine.deleteDocument(id);

            if (success) {
                log.info('Document deleted successfully', { id, title: document.title });
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Document "${document.title}" (${id}) has been deleted successfully.`
                        }
                    ]
                };
            } else {
                throw new Error('Failed to delete document');
            }
        } catch (error) {
            log.error('Failed to delete document', { error: String(error) });
            throw new Error(`Failed to delete document: ${error}`);
        }
    }
});

// Add resources for documents
server.addResourceTemplate({
    uriTemplate: 'document://{id}',
    name: 'Document Content',
    mimeType: 'text/plain',
    arguments: [
        {
            name: 'id',
            description: 'Document ID',
            required: true
        }
    ],
    async load({ id }) {
        await initializeServer();

        const document = await searchEngine.getDocument(id);
        if (!document) {
            throw new Error(`Document not found: ${id}`);
        }

        return {
            text: document.content
        };
    }
});

// Start the server
async function main() {
    try {
        // Initialize server components
        await initializeServer();

        // Start the FastMCP server
        await server.start({
            transportType: 'stdio'
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.error('Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.error('Shutting down gracefully...');
    process.exit(0);
});

// Run the server
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
