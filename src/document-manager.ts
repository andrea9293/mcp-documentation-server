import { existsSync, mkdirSync } from "fs";
import { writeFile, readFile, copyFile, readdir, unlink } from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { createHash } from 'crypto';
import { Document, DocumentChunk, SearchResult, EmbeddingProvider } from './types.js';
import { SimpleEmbeddingProvider } from './embedding-provider.js';
import { IntelligentChunker } from './intelligent-chunker.js';
import { extractText } from 'unpdf';
import { getDefaultDataDir } from './utils.js';
import { DocumentIndex } from './indexing/document-index.js';
import { GeminiFileMappingService } from './gemini-file-mapping-service.js';

/**
 * Document manager that handles document operations with chunking, indexing, and embeddings
 */
export class DocumentManager {
    private dataDir: string;
    private uploadsDir: string;
    private embeddingProvider: EmbeddingProvider;
    private intelligentChunker: IntelligentChunker;
    private documentIndex: DocumentIndex | null = null;
    private useIndexing: boolean;
    private useParallelProcessing: boolean;
    private useStreaming: boolean;
    
    constructor(embeddingProvider?: EmbeddingProvider) {
        // Always use default paths
        const baseDir = getDefaultDataDir();
        this.dataDir = path.join(baseDir, 'data');
        this.uploadsDir = path.join(baseDir, 'uploads');
        
        this.embeddingProvider = embeddingProvider || new SimpleEmbeddingProvider();
        this.intelligentChunker = new IntelligentChunker(this.embeddingProvider);
        
        // Feature flags with fallback
        this.useIndexing = process.env.MCP_INDEXING_ENABLED !== 'false';
        this.useParallelProcessing = process.env.MCP_PARALLEL_ENABLED !== 'false';
        this.useStreaming = process.env.MCP_STREAMING_ENABLED !== 'false';
        
        this.ensureDataDir();
        this.ensureUploadsDir();
        
        // Initialize Gemini file mapping service
        GeminiFileMappingService.initialize(this.dataDir);
        
        // Initialize indexing with error handling
        if (this.useIndexing) {
            try {
                this.documentIndex = new DocumentIndex(this.dataDir);
                console.error('[DocumentManager] Indexing enabled');
            } catch (error) {
                console.warn('[DocumentManager] Indexing disabled due to error:', error);
                this.useIndexing = false;
            }
        }
    }

    /**
     * Initialize the document index (lazy initialization)
     */
    private async ensureIndexInitialized(): Promise<void> {
        if (this.documentIndex && this.useIndexing) {
            await this.documentIndex.initialize(this.dataDir);
        }
    }

    private ensureDataDir(): void {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
    }

    private ensureUploadsDir(): void {
        if (!existsSync(this.uploadsDir)) {
            mkdirSync(this.uploadsDir, { recursive: true });
        }
    }

    // Getter methods for directory paths
    getDataDir(): string {
        return path.resolve(this.dataDir);
    }

    getUploadsDir(): string {
        return path.resolve(this.uploadsDir);
    }

    getUploadsPath(): string {
        return path.resolve(this.uploadsDir);
    }

    private getDocumentPath(id: string): string {
        return path.join(this.dataDir, `${id}.json`);
    }

    private getDocumentMdPath(id: string): string {
        return path.join(this.dataDir, `${id}.md`);
    }

    async addDocument(title: string, content: string, metadata: Record<string, any> = {}): Promise<Document> {
        // Check for duplicate content if indexing is enabled
        if (this.useIndexing && this.documentIndex) {
            await this.ensureIndexInitialized();
            const duplicateId = this.documentIndex.findDuplicateContent(content);
            if (duplicateId) {
                console.warn(`[DocumentManager] Duplicate content detected, existing document: ${duplicateId}`);
                // Optionally, you might want to return the existing document or throw an error
                // For now, we'll continue with creating a new document
            }
        }

        const id = this.generateId(content);
        const now = new Date().toISOString();

        // Create chunks using intelligent chunker
        const chunks = await this.intelligentChunker.createChunks(id, content, {
            maxSize: 500,
            overlap: 75,
            adaptiveSize: true,
            addContext: true
        });

        const document: Document = {
            id,
            title,
            content,
            metadata,
            chunks,
            created_at: now,
            updated_at: now,
        };

        const filePath = this.getDocumentPath(id);
        await writeFile(filePath, JSON.stringify(document, null, 2));

        // Create markdown file with the document content
        const mdFilePath = this.getDocumentMdPath(id);
        const mdContent = `# ${title}\n\n${content}`;
        await writeFile(mdFilePath, mdContent, 'utf-8');

        // Add to index if enabled
        if (this.useIndexing && this.documentIndex) {
            this.documentIndex.addDocument(id, filePath, content, chunks);
        }

        return document;
    }

    async getDocument(id: string): Promise<Document | null> {
        if (this.useIndexing && this.documentIndex) {
            await this.ensureIndexInitialized();
            
            // Use index for O(1) lookup
            const filePath = this.documentIndex.findDocument(id);
            if (!filePath) {
                return null;
            }
            
            try {
                const data = await readFile(filePath, 'utf-8');
                return JSON.parse(data);
            } catch {
                // File might have been deleted, remove from index
                this.documentIndex.removeDocument(id);
                return null;
            }
        }
        
        // Fallback to original method
        try {
            const data = await readFile(this.getDocumentPath(id), 'utf-8');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }
    
    async getOnlyContentDocument(id: string): Promise<string | null> {
        const document = await this.getDocument(id);
        return document ? document.content : null;
    }

    async getAllDocuments(): Promise<Document[]> {
        if (this.useIndexing && this.documentIndex) {
            await this.ensureIndexInitialized();
            
            // Use index for faster lookup
            const documentIds = this.documentIndex.getAllDocumentIds();
            const documents: Document[] = [];
            
            for (const id of documentIds) {
                const document = await this.getDocument(id);
                if (document) {
                    documents.push(document);
                }
            }
            
            return documents;
        }
        
        // Fallback to original method
        // Use forward slashes for glob pattern to work on all platforms
        const globPattern = this.dataDir.replace(/\\/g, '/') + "/*.json";
        const files = await glob(globPattern);
        const documents: Document[] = [];

        for (const file of files) {
            try {
                const data = await readFile(file, 'utf-8');
                const document = JSON.parse(data);
                if (document.id) { // Only include valid documents
                    documents.push(document);
                }
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
            .filter(chunk => chunk.embeddings && chunk.embeddings.length > 0)
            .map(chunk => ({
                chunk,
                score: this.cosineSimilarity(queryEmbedding, chunk.embeddings!)
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

    private generateId(content: string): string {
        return createHash('sha256')
            .update(content)
            .digest('hex')
            .substring(0, 16);
    }   
    
    /**
     * Extract text content from a PDF file with streaming support for large files
     * @param filePath Path to the PDF file
     * @returns Extracted text content
     */
    private async extractTextFromPdf(filePath: string): Promise<string> {
        try {
            const stats = await import('fs/promises').then(fs => fs.stat(filePath));
            const fileSizeLimit = parseInt(process.env.MCP_STREAM_FILE_SIZE_LIMIT || '10485760'); // 10MB
            
            let dataBuffer: Buffer;
            
            if (this.useStreaming && stats.size > fileSizeLimit) {
                console.error(`[DocumentManager] Using streaming for large PDF: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
                dataBuffer = await this.readFileStreaming(filePath);
            } else {
                dataBuffer = await readFile(filePath);
            }
            
            // Convert Buffer to Uint8Array as required by unpdf
            const uint8Array = new Uint8Array(dataBuffer);
            const result = await extractText(uint8Array);
            
            // unpdf returns { totalPages: number, text: string[] }
            const text = result.text.join('\n');
            
            if (!text || text.trim().length === 0) {
                throw new Error('No text found in PDF or PDF might be image-based');
            }
            
            return text;
        } catch (error) {
            throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Read file using streaming for large files
     */
    private async readFileStreaming(filePath: string): Promise<Buffer> {
        const fs = await import('fs');
        const chunkSize = parseInt(process.env.MCP_STREAM_CHUNK_SIZE || '65536'); // 64KB chunks
        
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            const readStream = fs.createReadStream(filePath, { highWaterMark: chunkSize });
            
            readStream.on('data', (chunk) => {
                chunks.push(chunk as Buffer);
            });
            
            readStream.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
            
            readStream.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Read text file with streaming support for large files
     */
    private async readTextFile(filePath: string): Promise<string> {
        try {
            const stats = await import('fs/promises').then(fs => fs.stat(filePath));
            const fileSizeLimit = parseInt(process.env.MCP_STREAM_FILE_SIZE_LIMIT || '10485760'); // 10MB
            
            if (this.useStreaming && stats.size > fileSizeLimit) {
                console.error(`[DocumentManager] Using streaming for large text file: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
                const buffer = await this.readFileStreaming(filePath);
                return buffer.toString('utf-8');
            } else {
                return await readFile(filePath, 'utf-8');
            }
        } catch (error) {
            throw new Error(`Failed to read text file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async processUploadsFolder(): Promise<{ processed: number; errors: string[] }> {
        const supportedExtensions = ['.txt', '.md', '.pdf'];
        const errors: string[] = [];
        let processed = 0;

        try {
            // Get all supported files from uploads directory
            const pattern = this.uploadsDir.replace(/\\/g, '/') + "/*{.txt,.md,.pdf}";
            const files = await glob(pattern);

            for (const filePath of files) {
                try {
                    const fileName = path.basename(filePath);
                    const fileExtension = path.extname(fileName).toLowerCase();

                    if (!supportedExtensions.includes(fileExtension)) {
                        continue;
                    }

                    let content: string;

                    // Extract content based on file type
                    if (fileExtension === '.pdf') {
                        content = await this.extractTextFromPdf(filePath);
                    } else {
                        // For .txt and .md files, use streaming if enabled
                        content = await this.readTextFile(filePath);
                    }

                    if (!content.trim()) {
                        errors.push(`File ${fileName} is empty or contains no extractable text`);
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
                    const document = await this.addDocument(title, content, {
                        source: 'upload',
                        originalFilename: fileName,
                        fileExtension: fileExtension,
                        processedAt: new Date().toISOString()
                    });

                    // Copy original file to data directory with same name as JSON file (keep backup in uploads)
                    const documentId = document.id;
                    const destinationFileName = `${documentId}${fileExtension}`;
                    const destinationPath = path.join(this.dataDir, destinationFileName);
                    
                    try {
                        await copyFile(filePath, destinationPath);
                        console.error(`[DocumentManager] Copied ${fileName} to ${destinationFileName} (keeping backup in uploads)`);
                    } catch (copyError) {
                        errors.push(`Warning: Could not copy file ${fileName} to data directory: ${copyError instanceof Error ? copyError.message : String(copyError)}`);
                    }

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
        const supportedExtensions = ['.txt', '.md', '.pdf'];
        const files: { name: string; size: number; modified: string; supported: boolean }[] = [];

        try {
            const pattern = this.uploadsDir.replace(/\\/g, '/') + "/*";
            const filePaths = await glob(pattern);

            for (const filePath of filePaths) {
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
            }

            return files.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            throw new Error(`Failed to list uploads files: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async deleteDocument(documentId: string): Promise<boolean> {
        try {
            const documentPath = this.getDocumentPath(documentId);
            let deletedMainFile = false;

            // Delete main JSON file
            if (existsSync(documentPath)) {
                await unlink(documentPath);
                deletedMainFile = true;
                console.error(`[DocumentManager] Deleted JSON file: ${documentId}.json`);
            }

            // Delete associated markdown file
            const mdPath = this.getDocumentMdPath(documentId);
            if (existsSync(mdPath)) {
                await unlink(mdPath);
                console.error(`[DocumentManager] Deleted markdown file: ${documentId}.md`);
            }

            // Delete associated original files (any extension except .json)
            try {
                const files = await readdir(this.dataDir);
                for (const file of files) {
                    if (file.startsWith(documentId) && !file.endsWith('.json')) {
                        const filePath = path.join(this.dataDir, file);
                        await unlink(filePath);
                        console.error(`[DocumentManager] Deleted associated file: ${file}`);
                    }
                }
            } catch (fileError) {
                console.error(`[DocumentManager] Warning: Could not delete associated files for ${documentId}: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
            }

            // Remove from index if enabled
            if (this.useIndexing && this.documentIndex) {
                this.documentIndex.removeDocument(documentId);
            }

            // Remove Gemini file mapping if exists
            await GeminiFileMappingService.removeMapping(documentId);

            return deletedMainFile;
        } catch (error) {
            throw new Error(`Failed to delete document: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get performance and cache statistics
     */
    getStats(): any {
        const stats: any = {
            features: {
                indexing: this.useIndexing,
                parallelProcessing: this.useParallelProcessing,
                streaming: this.useStreaming
            }
        };

        if (this.useIndexing && this.documentIndex) {
            stats.indexing = this.documentIndex.getStats();
        }

        if (this.embeddingProvider && typeof this.embeddingProvider.getCacheStats === 'function') {
            stats.embedding_cache = this.embeddingProvider.getCacheStats();
        }

        return stats;
    }
}
