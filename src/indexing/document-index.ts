import { createHash } from 'crypto';
import fse from 'fs-extra';
import { promises as fsp } from 'fs';
import * as path from 'path';

/**
 * In-memory indexing system for O(1) document and chunk lookups
 * Replaces linear searches with hash-based maps for scalability
 */
export class DocumentIndex {
    private documentMap = new Map<string, string>(); // id -> filePath
    private chunkMap = new Map<string, {docId: string, chunkIndex: number}>(); // chunkId -> document info
    private contentHash = new Map<string, string>(); // contentHash -> docId (deduplication)
    private keywordIndex = new Map<string, Set<string>>(); // keyword -> docIds
    private initialized = false;
    private indexFilePath: string;

    constructor(dataDir: string) {
        this.indexFilePath = path.join(dataDir, 'document-index.json');
    }

    /**
     * Initialize the index by loading from disk or building from existing documents
     */
    async initialize(dataDir: string): Promise<void> {
        if (this.initialized) return;

        try {
            // Try to load existing index
            await this.loadIndex();
        } catch (error) {
            console.error('[DocumentIndex] Failed to load existing index, rebuilding:', error);
            // Rebuild index from existing documents
            await this.rebuildIndex(dataDir);
        }

        this.initialized = true;
        console.error(`[DocumentIndex] Initialized with ${this.documentMap.size} documents`);
    }

    /**
     * Add a document to the index
     */
    addDocument(id: string, filePath: string, content: string, chunks?: any[]): void {
        // Add to document map
        this.documentMap.set(id, filePath);

        // Add content hash for deduplication
        const contentHashValue = this.hashContent(content);
        this.contentHash.set(contentHashValue, id);

        // Add chunks to chunk map
        if (chunks) {
            chunks.forEach((chunk, index) => {
                this.chunkMap.set(chunk.id, { docId: id, chunkIndex: index });
            });
        }

        // Extract and index keywords
        this.indexKeywords(id, content);

        // Persist index
        this.saveIndex().catch(error => 
            console.warn('[DocumentIndex] Failed to save index:', error)
        );
    }

    /**
     * Remove a document from the index
     */
    removeDocument(id: string): void {
        const filePath = this.documentMap.get(id);
        if (!filePath) return;

        // Remove from document map
        this.documentMap.delete(id);

        // Remove from content hash
        for (const [hash, docId] of this.contentHash.entries()) {
            if (docId === id) {
                this.contentHash.delete(hash);
                break;
            }
        }

        // Remove chunks
        for (const [chunkId, chunkInfo] of this.chunkMap.entries()) {
            if (chunkInfo.docId === id) {
                this.chunkMap.delete(chunkId);
            }
        }

        // Remove from keyword index
        for (const [keyword, docIds] of this.keywordIndex.entries()) {
            docIds.delete(id);
            if (docIds.size === 0) {
                this.keywordIndex.delete(keyword);
            }
        }

        // Persist index
        this.saveIndex().catch(error => 
            console.warn('[DocumentIndex] Failed to save index:', error)
        );
    }

    /**
     * Find document file path by ID - O(1) lookup
     */
    findDocument(id: string): string | undefined {
        return this.documentMap.get(id);
    }

    /**
     * Find chunk information by chunk ID - O(1) lookup  
     */
    findChunk(chunkId: string): {docId: string, chunkIndex: number} | undefined {
        return this.chunkMap.get(chunkId);
    }

    /**
     * Find duplicate content by hash - O(1) lookup
     */
    findDuplicateContent(content: string): string | undefined {
        const contentHashValue = this.hashContent(content);
        return this.contentHash.get(contentHashValue);
    }

    /**
     * Search documents by keywords - much faster than full text search
     */
    searchByKeywords(keywords: string[]): Set<string> {
        if (keywords.length === 0) return new Set();

        let result = this.keywordIndex.get(keywords[0].toLowerCase()) || new Set();
        
        for (let i = 1; i < keywords.length; i++) {
            const keywordDocs = this.keywordIndex.get(keywords[i].toLowerCase()) || new Set();
            result = new Set([...result].filter(docId => keywordDocs.has(docId)));
        }

        return result;
    }

    /**
     * Get all document IDs - O(1) size, O(n) iteration
     */
    getAllDocumentIds(): string[] {
        return Array.from(this.documentMap.keys());
    }

    /**
     * Get index statistics
     */
    getStats(): {documents: number, chunks: number, keywords: number} {
        return {
            documents: this.documentMap.size,
            chunks: this.chunkMap.size,
            keywords: this.keywordIndex.size
        };
    }

    /**
     * Hash content for deduplication
     */
    private hashContent(content: string): string {
        return createHash('sha256').update(content.trim()).digest('hex').substring(0, 16);
    }

    /**
     * Extract and index keywords from content
     */
    private indexKeywords(docId: string, content: string): void {
        const keywords = this.extractKeywords(content);
        for (const keyword of keywords) {
            const keywordLower = keyword.toLowerCase();
            if (!this.keywordIndex.has(keywordLower)) {
                this.keywordIndex.set(keywordLower, new Set());
            }
            this.keywordIndex.get(keywordLower)!.add(docId);
        }
    }

    /**
     * Extract keywords from text (simple word extraction)
     */
    private extractKeywords(content: string): string[] {
        const words = content
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && word.length < 20)
            .filter(word => !this.isStopWord(word));

        // Return unique words
        return Array.from(new Set(words));
    }

    /**
     * Check if word is a stop word (basic list)
     */
    private isStopWord(word: string): boolean {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
            'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does',
            'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that',
            'these', 'those', 'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again',
            'further', 'then', 'once'
        ]);
        return stopWords.has(word);
    }

    /**
     * Save index to disk
     */
    private async saveIndex(): Promise<void> {
        const indexData = {
            version: '1.0',
            documentMap: Object.fromEntries(this.documentMap),
            chunkMap: Object.fromEntries(this.chunkMap),
            contentHash: Object.fromEntries(this.contentHash),
            keywordIndex: Object.fromEntries(
                Array.from(this.keywordIndex.entries()).map(([key, value]) => [key, Array.from(value)])
            ),
            lastUpdated: new Date().toISOString()
        };

    await fse.writeJSON(this.indexFilePath, indexData, { spaces: 2 });
    }

    /**
     * Load index from disk
     */
    private async loadIndex(): Promise<void> {
        if (!await fse.pathExists(this.indexFilePath)) {
            throw new Error('Index file does not exist');
        }

        const indexData = await fse.readJSON(this.indexFilePath);
        
        this.documentMap = new Map(Object.entries(indexData.documentMap || {}));
        this.chunkMap = new Map(Object.entries(indexData.chunkMap || {}));
        this.contentHash = new Map(Object.entries(indexData.contentHash || {}));
        this.keywordIndex = new Map(
            Object.entries(indexData.keywordIndex || {}).map(([key, value]) => [key, new Set(value as string[])])
        );
    }

    /**
     * Rebuild index from existing documents in data directory
     */
    private async rebuildIndex(dataDir: string): Promise<void> {
        console.error('[DocumentIndex] Rebuilding index from existing documents...');
        
        this.documentMap.clear();
        this.chunkMap.clear();
        this.contentHash.clear();
        this.keywordIndex.clear();

        try {
            const files = await fsp.readdir(dataDir);
            const documentFiles = files.filter(file => file.endsWith('.json') && file !== 'document-index.json');

            for (const file of documentFiles) {
                try {
                    const filePath = path.join(dataDir, file);
                    const document = await fse.readJSON(filePath);
                    
                    if (document.id && document.content) {
                        this.addDocument(document.id, filePath, document.content, document.chunks);
                    }
                } catch (error) {
                    console.warn(`[DocumentIndex] Failed to index document ${file}:`, error);
                }
            }

            await this.saveIndex();
            console.error(`[DocumentIndex] Rebuilt index with ${this.documentMap.size} documents`);
        } catch (error) {
            console.error('[DocumentIndex] Failed to rebuild index:', error);
        }
    }
}