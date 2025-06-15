import { FastMCP } from "fastmcp";
import { z } from "zod";
import { existsSync, mkdirSync } from "fs";
import { writeFile, readFile } from "fs/promises";
import * as path from "path";
import { glob } from "glob";

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

// Simple embedding provider (hash-based fallback)
class SimpleEmbeddingProvider {
    async generateEmbedding(text: string): Promise<number[]> {
        // Simple hash-based embedding as fallback
        const hash = this.simpleHash(text);
        const embedding = new Array(384).fill(0);

        // Use hash to seed the embedding
        for (let i = 0; i < 384; i++) {
            embedding[i] = Math.sin(hash * (i + 1)) * 0.1;
        }

        return embedding;
    }

    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
}

// Document Manager
class DocumentManager {
    private dataDir: string;
    private embeddingProvider: SimpleEmbeddingProvider;

    constructor(dataDir = "./data") {
        this.dataDir = dataDir;
        this.embeddingProvider = new SimpleEmbeddingProvider();
        this.ensureDataDir();
    }
    private ensureDataDir(): void {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
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
    const chunkSize = 200; // characters per chunk
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
}

// Initialize server
const server = new FastMCP({
    name: "Documentation Server",
    version: "1.0.0",
});

const documentManager = new DocumentManager();

// Add document tool
server.addTool({
    name: "add_document",
    description: "Add a new document to the knowledge base",
    parameters: z.object({
        title: z.string().describe("The title of the document"),
        content: z.string().describe("The content of the document"),
        metadata: z.record(z.any()).optional().describe("Optional metadata for the document"),
    }),
    execute: async (args) => {
        try {
            const document = await documentManager.addDocument(
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
  }),
  execute: async (args) => {
    try {
      const results = await documentManager.searchDocuments(args.document_id, args.query, args.limit);
      
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
            const document = await documentManager.getDocument(args.id);

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
    parameters: z.object({}),  execute: async () => {
    try {
      const documents = await documentManager.getAllDocuments();
      
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

// Add resource for document access
server.addResource({
    name: "Documents Database",
    uri: "file://./data",
    mimeType: "application/json",
    async load() {
        const documents = await documentManager.getAllDocuments();
        return {
            text: JSON.stringify(documents, null, 2),
        };
    },
});

// Start the server
server.start({
    transportType: "stdio",
});
