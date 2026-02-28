import { existsSync, mkdirSync } from "fs";
import { writeFile, readFile, copyFile, readdir, unlink } from "fs/promises";
import * as path from "path";
import { createHash } from 'crypto';
import { Document, DocumentChunk, SearchResult, EmbeddingProvider } from './types.js';
import { SimpleEmbeddingProvider } from './embedding-provider.js';
import { IntelligentChunker } from './intelligent-chunker.js';
import { extractText } from 'unpdf';
import { getDefaultDataDir } from './utils.js';
import { OramaStore } from './orama-store.js';
import { GeminiFileMappingService } from './gemini-file-mapping-service.js';

/**
 * Document manager that handles document operations with chunking and Orama vector DB
 */
export class DocumentManager {
    private dataDir: string;
    private uploadsDir: string;
    private embeddingProvider: EmbeddingProvider;
    private intelligentChunker: IntelligentChunker;
    private oramaStore: OramaStore;
    private useStreaming: boolean;
    private oramaInitialized = false;
    
    constructor(embeddingProvider?: EmbeddingProvider) {
        // Always use default paths
        const baseDir = getDefaultDataDir();
        this.dataDir = path.join(baseDir, 'data');
        this.uploadsDir = path.join(baseDir, 'uploads');
        
        this.embeddingProvider = embeddingProvider || new SimpleEmbeddingProvider();
        this.intelligentChunker = new IntelligentChunker(this.embeddingProvider);
        
        // Feature flags with fallback
        this.useStreaming = process.env.MCP_STREAMING_ENABLED !== 'false';

        // Create OramaStore with embedding dimensions
        this.oramaStore = new OramaStore(this.embeddingProvider.getDimensions());
        console.error(`[DocumentManager] Constructed with embeddingModel=${this.embeddingProvider.getModelName()} vectorDimensions=${this.embeddingProvider.getDimensions()}`);
        
        this.ensureDataDir();
        this.ensureUploadsDir();
        
        // Initialize Gemini file mapping service
        GeminiFileMappingService.initialize(this.dataDir);
    }

    /**
     * Ensure OramaStore is initialized (lazy init)
     */
    private async ensureOramaInitialized(): Promise<void> {
        if (!this.oramaInitialized) {
            console.error('[DocumentManager] Initializing OramaStore...');
            await this.oramaStore.initialize();
            this.oramaInitialized = true;
            console.error('[DocumentManager] OramaStore initialized');
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

    private getDocumentMdPath(id: string): string {
        return path.join(this.dataDir, `${id}.md`);
    }

    async addDocument(title: string, content: string, metadata: Record<string, any> = {}): Promise<Document> {
        await this.ensureOramaInitialized();

        const id = this.generateId(content);
        const now = new Date().toISOString();

        console.error(`[DocumentManager] Adding document id=${id} title=${title}`);

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

        // Store in Orama
        await this.oramaStore.addDocument(document);
        console.error(`[DocumentManager] Stored document in Orama: ${id}`);

        // Create markdown file with the document content
        const mdFilePath = this.getDocumentMdPath(id);
        const mdContent = `# ${title}\n\n${content}`;
        await writeFile(mdFilePath, mdContent, 'utf-8');

        return document;
    }

    async getDocument(id: string): Promise<Document | null> {
        await this.ensureOramaInitialized();
        console.error(`[DocumentManager] getDocument id=${id}`);
        return this.oramaStore.getDocument(id);
    }
    
    async getOnlyContentDocument(id: string): Promise<string | null> {
        const document = await this.getDocument(id);
        return document ? document.content : null;
    }

    async getAllDocuments(): Promise<Document[]> {
        await this.ensureOramaInitialized();
        console.error('[DocumentManager] getAllDocuments');
        return this.oramaStore.getAllDocuments();
    }

    async searchDocuments(documentId: string, query: string, limit = 10): Promise<SearchResult[]> {
        await this.ensureOramaInitialized();
        console.error(`[DocumentManager] searchDocuments documentId=${documentId} query="${query}" limit=${limit}`);
        const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
        return this.oramaStore.searchChunks(queryEmbedding, limit, documentId);
    }

    /**
     * Search across all documents (cross-document semantic search)
     */
    async searchAllDocuments(query: string, limit = 10): Promise<SearchResult[]> {
        await this.ensureOramaInitialized();
        console.error(`[DocumentManager] searchAllDocuments query="${query}" limit=${limit}`);
        const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
        return this.oramaStore.searchAllDocuments(queryEmbedding, limit, query);
    }

    private generateId(content: string): string {
        return createHash('sha256')
            .update(content)
            .digest('hex')
            .substring(0, 16);
    }   
    
    /**
     * Extract text content from a PDF file with streaming support for large files
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
            const allFiles = await readdir(this.uploadsDir);
            console.error(`[DocumentManager] processUploadsFolder found ${allFiles.length} files in uploads`);
            const files = allFiles
                .filter(f => supportedExtensions.includes(path.extname(f).toLowerCase()))
                .map(f => path.join(this.uploadsDir, f));

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
                        await this.deleteDocument(existingDoc.id);
                    }

                    // Create new document with embeddings
                    const document = await this.addDocument(title, content, {
                        source: 'upload',
                        originalFilename: fileName,
                        fileExtension: fileExtension,
                        processedAt: new Date().toISOString()
                    });

                    // Copy original file to data directory with same name as document ID
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

    async listUploadsFiles(): Promise<{ name: string; size: number; modified: string; supported: boolean }[]> {
        const supportedExtensions = ['.txt', '.md', '.pdf'];
        const files: { name: string; size: number; modified: string; supported: boolean }[] = [];

        try {
            const allFiles = await readdir(this.uploadsDir);
            const fsp = await import('fs/promises');

            for (const fileName of allFiles) {
                const filePath = path.join(this.uploadsDir, fileName);
                const stats = await fsp.stat(filePath);
                if (stats.isFile()) {
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
        await this.ensureOramaInitialized();

        try {
            console.error(`[DocumentManager] deleteDocument id=${documentId}`);
            // Delete from Orama
            const deleted = await this.oramaStore.deleteDocument(documentId);

            // Delete associated markdown file
            const mdPath = this.getDocumentMdPath(documentId);
            if (existsSync(mdPath)) {
                await unlink(mdPath);
                console.error(`[DocumentManager] Deleted markdown file: ${documentId}.md`);
            }

            // Delete associated original files (any extension)
            try {
                const files = await readdir(this.dataDir);
                for (const file of files) {
                    if (file.startsWith(documentId) && !file.endsWith('.json') && !file.endsWith('.msp')) {
                        const filePath = path.join(this.dataDir, file);
                        await unlink(filePath);
                        console.error(`[DocumentManager] Deleted associated file: ${file}`);
                    }
                }
            } catch (fileError) {
                console.error(`[DocumentManager] Warning: Could not delete associated files for ${documentId}: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
            }

            // Remove Gemini file mapping if exists
            await GeminiFileMappingService.removeMapping(documentId);

            console.error(`[DocumentManager] deleteDocument completed id=${documentId} deleted=${deleted}`);
            return deleted;
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
                streaming: this.useStreaming,
                storage: 'orama'
            }
        };

        if (this.embeddingProvider && typeof this.embeddingProvider.getCacheStats === 'function') {
            stats.embedding_cache = this.embeddingProvider.getCacheStats();
        }

        return stats;
    }
}
