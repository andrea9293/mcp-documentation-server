import { DocumentManager } from './document-manager.js';
import { EmbeddingProvider, SearchResult } from './types.js';

/**
 * Search engine that provides semantic search capabilities across all documents
 */
export class SearchEngine {
    private documentManager: DocumentManager;
    private embeddingProvider: EmbeddingProvider;

    constructor(documentManager: DocumentManager, embeddingProvider: EmbeddingProvider) {
        this.documentManager = documentManager;
        this.embeddingProvider = embeddingProvider;
    }

    /**
     * Perform semantic search across all documents
     */
    // async searchAllDocuments(query: string, limit = 10): Promise<SearchResult[]> {
    //     try {
    //         const allDocuments = await this.documentManager.getAllDocuments();
    //         const allResults: SearchResult[] = [];

    //         for (const document of allDocuments) {
    //             const results = await this.documentManager.searchDocuments(document.id, query, limit);
    //             allResults.push(...results);
    //         }

    //         // Sort all results by score and limit
    //         allResults.sort((a, b) => b.score - a.score);
    //         return allResults.slice(0, limit);
    //     } catch (error) {
    //         console.error('Search failed:', error);
    //         throw new Error(`Search failed: ${error}`);
    //     }
    // }

    /**
     * Search within a specific document
     */
    async searchDocument(documentId: string, query: string, limit = 10): Promise<SearchResult[]> {
        return this.documentManager.searchDocuments(documentId, query, limit);
    }

    /**
     * Add a document with automatic embedding generation
     */
    async addDocument(
        title: string,
        content: string,
        metadata: Record<string, any> = {}
    ) {
        try {
            // Use the DocumentManager's addDocument method which handles chunking and embeddings
            return await this.documentManager.addDocument(title, content, metadata);
        } catch (error) {
            console.error('Failed to add document:', error);
            throw new Error(`Failed to add document: ${error}`);
        }
    }

    /**
     * Get document by ID
     */
    async getDocument(id: string) {
        return this.documentManager.getDocument(id);
    }

    /**
     * List all documents
     */
    async listDocuments() {
        return this.documentManager.getAllDocuments();
    }

    /**
     * Delete a document
     */
    async deleteDocument(id: string) {
        return this.documentManager.deleteDocument(id);
    }

    /**
     * Check if the search engine is ready
     */
    isReady(): boolean {
        return this.embeddingProvider.isAvailable();
    }
}
