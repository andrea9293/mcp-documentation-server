import { FastMCP } from "fastmcp";
import { z } from "zod";
import { existsSync, mkdirSync } from "fs";
import { writeFile, readFile } from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { pipeline } from '@xenova/transformers';
import { createLazyEmbeddingProvider } from './embedding-provider.js';

// Types
interface DocumentChunk {
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
    embeddings: number[];
    start_position: number;
    end_position: number;
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

// Embedding Provider Interface
interface EmbeddingProvider {
    generateEmbedding(text: string): Promise<number[]>;
    isAvailable(): boolean;
    getModelName(): string;
}

// Transformers embedding provider using @xenova/transformers
class TransformersEmbeddingProvider implements EmbeddingProvider {
    private pipeline: any = null;
    private isInitialized = false;
    private initPromise: Promise<void> | null = null;

    constructor(private modelName: string = 'Xenova/all-MiniLM-L6-v2') { }

    private async initialize(): Promise<void> {
        if (this.isInitialized) return;

        if (this.initPromise) {
            await this.initPromise;
            return;
        }

        this.initPromise = this.doInitialize();
        await this.initPromise;
    }

    private async doInitialize(): Promise<void> {
        try {
            console.error(`Initializing embedding model: ${this.modelName}`);
            this.pipeline = await pipeline('feature-extraction', this.modelName);
            this.isInitialized = true;
            console.error('Embedding model initialized successfully');
        } catch (error) {
            console.error('Failed to initialize embedding model:', error);
            throw new Error(`Failed to initialize embedding model: ${error}`);
        }
    }

    async generateEmbedding(text: string): Promise<number[]> {
        await this.initialize();

        if (!this.pipeline) {
            throw new Error('Embedding pipeline not initialized');
        }

        try {
            const output = await this.pipeline(text, {
                pooling: 'mean',
                normalize: true,
            });

            return Array.from(output.data as Float32Array);
        } catch (error) {
            console.error('Error generating embedding:', error);
            throw new Error(`Failed to generate embedding: ${error}`);
        }
    }

    isAvailable(): boolean {
        return this.isInitialized && this.pipeline !== null;
    }

    getModelName(): string {
        return this.modelName;
    }
}

// Simple embedding provider (hash-based fallback)
class SimpleEmbeddingProvider implements EmbeddingProvider {
    async generateEmbedding(text: string): Promise<number[]> {
        // Simple hash-based embedding as fallback
        const hash = this.simpleHash(text);
        const embedding = new Array(384).fill(0);

        // Use hash to seed the embedding
        for (let i = 0; i < 384; i++) {
            embedding[i] = Math.sin(hash * (i + 1)) * 0.1;
        }

        return embedding;
    } private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    isAvailable(): boolean {
        return true;
    }

    getModelName(): string {
        return 'Simple Hash-based Embeddings';
    }
}

// Document Manager
class DocumentManager {
    private dataDir: string;
    private uploadsDir: string;
    private embeddingProvider: EmbeddingProvider;

    constructor(dataDir = "./data", uploadsDir = "./uploads", embeddingProvider?: EmbeddingProvider) {
        this.dataDir = dataDir;
        this.uploadsDir = uploadsDir;
        this.embeddingProvider = embeddingProvider || new SimpleEmbeddingProvider();
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
        }    } getUploadsPath(): string {
        return path.resolve(this.uploadsDir);
    }

    private getDocumentPath(id: string): string {
        return path.join(this.dataDir, `${id}.json`);
    }

    async addDocument(title: string, content: string, metadata: Record<string, any> = {}): Promise<Document> {
        const id = this.generateId();
        const now = new Date().toISOString();

        // Create chunks from the content
        const chunks = await this.createChunks(id, content);

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
    private async createChunks(documentId: string, content: string): Promise<DocumentChunk[]> {
        const chunkSize = 700; // characters per chunk
        const chunks: DocumentChunk[] = [];

        // Split content into sentences/paragraphs for better chunking
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);

        let currentChunk = "";
        let chunkIndex = 0;
        let startPosition = 0;

        for (const sentence of sentences) {
            const trimmedSentence = sentence.trim();
            if (!trimmedSentence) continue;

            // If adding this sentence would exceed chunk size, save current chunk
            if (currentChunk.length + trimmedSentence.length > chunkSize && currentChunk.length > 0) {
                const embeddings = await this.embeddingProvider.generateEmbedding(currentChunk);
                const endPosition = startPosition + currentChunk.length;

                chunks.push({
                    id: `${documentId}_chunk_${chunkIndex}`,
                    document_id: documentId,
                    chunk_index: chunkIndex,
                    content: currentChunk.trim(),
                    embeddings,
                    start_position: startPosition,
                    end_position: endPosition,
                });

                startPosition = endPosition;
                currentChunk = trimmedSentence + ".";
                chunkIndex++;
            } else {
                currentChunk += (currentChunk ? " " : "") + trimmedSentence + ".";
            }
        }

        // Add the last chunk if it has content
        if (currentChunk.trim()) {
            const embeddings = await this.embeddingProvider.generateEmbedding(currentChunk);
            const endPosition = startPosition + currentChunk.length;

            chunks.push({
                id: `${documentId}_chunk_${chunkIndex}`,
                document_id: documentId,
                chunk_index: chunkIndex,
                content: currentChunk.trim(),
                embeddings,
                start_position: startPosition,
                end_position: endPosition,
            });
        }

        return chunks;
    }
    async getDocument(id: string): Promise<Document | null> {
        try {
            const data = await readFile(this.getDocumentPath(id), 'utf-8');
            return JSON.parse(data);
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
            .map(chunk => ({
                chunk,
                score: this.cosineSimilarity(queryEmbedding, chunk.embeddings)
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

    async processUploadsFolder(): Promise<{ processed: number; errors: string[] }> {
        const supportedExtensions = ['.txt', '.md'];
        const errors: string[] = [];
        let processed = 0;

        try {
            // Get all supported files from uploads directory
            const pattern = this.uploadsDir.replace(/\\/g, '/') + "/*{.txt,.md}";
            const files = await glob(pattern);

            for (const filePath of files) {
                try {
                    const fileName = path.basename(filePath);
                    const fileExtension = path.extname(fileName).toLowerCase();

                    if (!supportedExtensions.includes(fileExtension)) {
                        continue;
                    }

                    // Read file content
                    const content = await readFile(filePath, 'utf-8');

                    if (!content.trim()) {
                        errors.push(`File ${fileName} is empty`);
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
        const supportedExtensions = ['.txt', '.md'];
        const files: { name: string; size: number; modified: string; supported: boolean }[] = [];

        try {
            const pattern = this.uploadsDir.replace(/\\/g, '/') + "/*";
            const filePaths = await glob(pattern);

            for (const filePath of filePaths) {
                try {
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
                } catch (error) {
                    // Skip files that can't be accessed
                }
            }

            return files.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            throw new Error(`Failed to list uploads files: ${error instanceof Error ? error.message : String(error)}`);
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
        documentManager = new DocumentManager("./data", "./uploads", embeddingProvider);
        console.error(`Document manager initialized with: ${embeddingProvider.getModelName()} (lazy loading)`);
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
    description: "Search for chunks within a specific document using semantic similarity",
    parameters: z.object({
        document_id: z.string().describe("The ID of the document to search within"),
        query: z.string().describe("The search query"),
        limit: z.number().optional().default(10).describe("Maximum number of chunk results to return"),
    }), execute: async (args) => {
        try {
            const manager = await initializeDocumentManager();
            const results = await manager.searchDocuments(args.document_id, args.query, args.limit);

            if (results.length === 0) {
                return "No chunks found matching your query in the specified document.";
            }

            const searchResults = results.map(result => ({
                chunk_id: result.chunk.id,
                document_id: result.chunk.document_id,
                chunk_index: result.chunk.chunk_index,
                score: result.score,
                content: result.chunk.content,
                start_position: result.chunk.start_position,
                end_position: result.chunk.end_position,
            }));
            return JSON.stringify(searchResults, null, 2);
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
            const document = await manager.getDocument(args.id);

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
                content_preview: doc.content.substring(0, 100) + "...",
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
