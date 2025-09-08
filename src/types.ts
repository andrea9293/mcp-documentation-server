// Types for the MCP Documentation Server

export interface DocumentChunk {
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
    embeddings?: number[];
    start_position: number;
    end_position: number;
    metadata?: Record<string, any>;
}

export interface Document {
    id: string;
    title: string;
    content: string;
    metadata: Record<string, any>;
    chunks: DocumentChunk[];
    created_at: string;
    updated_at: string;
}

export interface SearchResult {
    chunk: DocumentChunk;
    score: number;
}

// Legacy interfaces for backward compatibility
export interface DocumentMetadata {
    id: string;
    title: string;
    author?: string;
    tags?: string[];
    createdAt: Date;
    updatedAt: Date;
    size: number;
    contentType: string;
    description?: string;
}

export interface LegacyDocument extends DocumentMetadata {
    content: string;
    embedding?: number[];
}

export interface LegacySearchResult {
    document: LegacyDocument;
    score: number;
    relevance: number;
}

export interface SearchOptions {
    limit?: number;
    threshold?: number;
    includeContent?: boolean;
    filters?: {
        tags?: string[];
        author?: string;
        contentType?: string;
    };
}

export interface AddDocumentRequest {
    title: string;
    content: string;
    metadata?: {
        author?: string;
        tags?: string[];
        description?: string;
        contentType?: string;
    };
}

export interface SearchRequest {
    query: string;
    options?: SearchOptions;
}

export interface EmbeddingProvider {
    generateEmbedding(text: string): Promise<number[]>;
    isAvailable(): boolean;
    getModelName(): string;
    getDimensions(): number;
    getCacheStats?(): any; // Optional method for cache statistics
}

export interface DocumentStorage {
    save(document: Document): Promise<void>;
    load(id: string): Promise<Document | null>;
    list(): Promise<DocumentMetadata[]>;
    delete(id: string): Promise<boolean>;
    search(embedding: number[], options?: SearchOptions): Promise<SearchResult[]>;
}

export interface ServerConfig {
    dataDir?: string;
    embeddingProvider?: EmbeddingProvider;
    maxDocumentSize?: number;
    defaultSearchLimit?: number;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
