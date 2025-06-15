import { DocumentManager } from './document-manager.js';
import { EmbeddingProvider } from './types.js';
import { SearchResult, SearchOptions } from './types.js';

/**
 * Search engine that provides semantic search capabilities
 */
export class SearchEngine {
  private documentManager: DocumentManager;
  private embeddingProvider: EmbeddingProvider;

  constructor(documentManager: DocumentManager, embeddingProvider: EmbeddingProvider) {
    this.documentManager = documentManager;
    this.embeddingProvider = embeddingProvider;
  }

  /**
   * Perform semantic search across documents
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    try {
      // Generate embedding for the search query
      const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);

      // Search documents using the query embedding
      const results = await this.documentManager.searchDocuments(queryEmbedding, options);

      return results;
    } catch (error) {
      console.error('Search failed:', error);
      throw new Error(`Search failed: ${error}`);
    }
  }

  /**
   * Add a document with automatic embedding generation
   */
  async addDocument(
    title: string,
    content: string,
    metadata: {
      author?: string;
      tags?: string[];
      description?: string;
      contentType?: string;
    } = {}
  ) {
    try {
      // Generate embedding for the document content
      const textToEmbed = `${title}\n\n${content}`;
      const embedding = await this.embeddingProvider.generateEmbedding(textToEmbed);

      // Add document with embedding
      return await this.documentManager.addDocument(title, content, embedding, metadata);
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
    return this.documentManager.listDocuments();
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
