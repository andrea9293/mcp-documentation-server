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

// Orama DB schema types
export interface OramaChunkDocument {
    id: string;
    document_id: string;
    document_title: string;
    chunk_index: number;
    content: string;
    embedding: number[];
    start_position: number;
    end_position: number;
    metadata: string; // stringified JSON
}

export interface OramaDocDocument {
    id: string;
    title: string;
    content: string;
    created_at: string;
    updated_at: string;
    metadata: string; // stringified JSON
}

// Parent chunk stored in its own Orama DB (parent-child chunking pattern)
export interface OramaParentDocument {
    id: string;
    document_id: string;
    parent_index: number;
    content: string;
    heading: string;
    start_position: number;
    end_position: number;
}

// Data returned by IntelligentChunker for each parent
export interface ParentChunkData {
    index: number;
    content: string;
    startPosition: number;
    endPosition: number;
    heading?: string;
    contentType: string;
}

// Result of chunking: children (for embedding) + parents (for context)
export interface ChunkingResult {
    children: DocumentChunk[];
    parents: ParentChunkData[];
}

export interface ServerConfig {
    dataDir?: string;
    embeddingProvider?: EmbeddingProvider;
    maxDocumentSize?: number;
    defaultSearchLimit?: number;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
