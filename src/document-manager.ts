import * as fs from 'fs-extra';
import * as path from 'path';
import { createHash } from 'crypto';
import { Document, DocumentMetadata, DocumentStorage, SearchResult, SearchOptions } from './types.js';

/**
 * File-based document storage with JSON metadata and content files
 */
export class FileDocumentStorage implements DocumentStorage {
    private documentsDir: string;
    private metadataFile: string;
    private metadata: Map<string, DocumentMetadata> = new Map();

    constructor(dataDir: string) {
        this.documentsDir = path.join(dataDir, 'documents');
        this.metadataFile = path.join(dataDir, 'metadata.json');
        this.ensureDirectories();
        this.loadMetadata();
    }

    private ensureDirectories(): void {
        fs.ensureDirSync(this.documentsDir);
    }

    private loadMetadata(): void {
        try {
            if (fs.existsSync(this.metadataFile)) {
                const data = fs.readJsonSync(this.metadataFile);
                this.metadata = new Map(Object.entries(data).map(([id, meta]: [string, any]) => [
                    id,
                    {
                        ...meta,
                        createdAt: new Date(meta.createdAt),
                        updatedAt: new Date(meta.updatedAt),
                    }
                ]));
            }
        } catch (error) {
            console.error('Failed to load metadata:', error);
            this.metadata = new Map();
        }
    }

    private saveMetadata(): void {
        try {
            const data = Object.fromEntries(this.metadata);
            fs.writeJsonSync(this.metadataFile, data, { spaces: 2 });
        } catch (error) {
            console.error('Failed to save metadata:', error);
            throw error;
        }
    }

    private getDocumentPath(id: string): string {
        return path.join(this.documentsDir, `${id}.json`);
    }

    private getEmbeddingPath(id: string): string {
        return path.join(this.documentsDir, `${id}.embedding.json`);
    }

    async save(document: Document): Promise<void> {
        try {
            // Save content and metadata
            const documentPath = this.getDocumentPath(document.id);
            const docData = {
                ...document,
                embedding: undefined, // Don't save embedding with content
            };
            await fs.writeJson(documentPath, docData, { spaces: 2 });

            // Save embedding separately if it exists
            if (document.embedding) {
                const embeddingPath = this.getEmbeddingPath(document.id);
                await fs.writeJson(embeddingPath, { embedding: document.embedding });
            }

            // Update metadata
            this.metadata.set(document.id, {
                id: document.id,
                title: document.title,
                author: document.author,
                tags: document.tags,
                createdAt: document.createdAt,
                updatedAt: document.updatedAt,
                size: document.size,
                contentType: document.contentType,
                description: document.description,
            });

            this.saveMetadata();
        } catch (error) {
            console.error(`Failed to save document ${document.id}:`, error);
            throw error;
        }
    }

    async load(id: string): Promise<Document | null> {
        try {
            const documentPath = this.getDocumentPath(id);
            if (!await fs.pathExists(documentPath)) {
                return null;
            }

            const document = await fs.readJson(documentPath);

            // Load embedding if it exists
            const embeddingPath = this.getEmbeddingPath(id);
            if (await fs.pathExists(embeddingPath)) {
                const embeddingData = await fs.readJson(embeddingPath);
                document.embedding = embeddingData.embedding;
            }

            // Convert date strings back to Date objects
            document.createdAt = new Date(document.createdAt);
            document.updatedAt = new Date(document.updatedAt);

            return document;
        } catch (error) {
            console.error(`Failed to load document ${id}:`, error);
            return null;
        }
    }

    async list(): Promise<DocumentMetadata[]> {
        return Array.from(this.metadata.values());
    }

    async delete(id: string): Promise<boolean> {
        try {
            const documentPath = this.getDocumentPath(id);
            const embeddingPath = this.getEmbeddingPath(id);

            // Remove files
            await fs.remove(documentPath);
            if (await fs.pathExists(embeddingPath)) {
                await fs.remove(embeddingPath);
            }

            // Remove from metadata
            this.metadata.delete(id);
            this.saveMetadata();

            return true;
        } catch (error) {
            console.error(`Failed to delete document ${id}:`, error);
            return false;
        }
    }

    async search(queryEmbedding: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
        const {
            limit = 10,
            threshold = 0.0,
            includeContent = false,
            filters = {}
        } = options;

        const results: SearchResult[] = [];

        for (const metadata of this.metadata.values()) {
            // Apply filters
            if (filters.tags && filters.tags.length > 0) {
                if (!metadata.tags || !filters.tags.some(tag => metadata.tags!.includes(tag))) {
                    continue;
                }
            }

            if (filters.author && metadata.author !== filters.author) {
                continue;
            }

            if (filters.contentType && metadata.contentType !== filters.contentType) {
                continue;
            }

            // Load document to get embedding
            const document = await this.load(metadata.id);
            if (!document || !document.embedding) {
                continue;
            }

            // Calculate cosine similarity
            const similarity = this.cosineSimilarity(queryEmbedding, document.embedding);

            if (similarity >= threshold) {
                results.push({
                    document: includeContent ? document : { ...document, content: '' },
                    score: similarity,
                    relevance: similarity,
                });
            }
        }

        // Sort by similarity score and limit results
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, limit);
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have the same length');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (normA * normB);
    }
}

/**
 * Document manager that handles document operations and embeddings
 */
export class DocumentManager {
    private storage: DocumentStorage;

    constructor(storage: DocumentStorage) {
        this.storage = storage;
    }

    generateId(content: string): string {
        return createHash('sha256')
            .update(content)
            .digest('hex')
            .substring(0, 16);
    }

    async addDocument(
        title: string,
        content: string,
        embedding: number[],
        metadata: {
            author?: string;
            tags?: string[];
            description?: string;
            contentType?: string;
        } = {}
    ): Promise<Document> {
        const now = new Date();
        const id = this.generateId(content);

        const document: Document = {
            id,
            title,
            content,
            embedding,
            author: metadata.author,
            tags: metadata.tags || [],
            createdAt: now,
            updatedAt: now,
            size: content.length,
            contentType: metadata.contentType || 'text/plain',
            description: metadata.description,
        };

        await this.storage.save(document);
        return document;
    }

    async getDocument(id: string): Promise<Document | null> {
        return this.storage.load(id);
    }

    async listDocuments(): Promise<DocumentMetadata[]> {
        return this.storage.list();
    }

    async deleteDocument(id: string): Promise<boolean> {
        return this.storage.delete(id);
    }

    async searchDocuments(
        queryEmbedding: number[],
        options?: SearchOptions
    ): Promise<SearchResult[]> {
        return this.storage.search(queryEmbedding, options);
    }
}
