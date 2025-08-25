import { createHash } from 'crypto';

/**
 * LRU Cache for embeddings to avoid recomputation of identical texts
 * Provides significant performance improvement for repeated queries
 */
export class EmbeddingCache {
    private cache: Map<string, {embedding: number[], timestamp: number, accessCount: number}>;
    private accessOrder: string[] = []; // Track access order for LRU eviction
    private maxSize: number;
    private hits = 0;
    private misses = 0;

    constructor(maxSize?: number) {
        this.maxSize = maxSize || parseInt(process.env.MCP_CACHE_SIZE || '1000');
        this.cache = new Map();
        console.error(`[EmbeddingCache] Initialized with size: ${this.maxSize}`);
    }

    /**
     * Get embedding from cache if exists
     */
    async getEmbedding(text: string): Promise<number[] | null> {
        const hash = this.hash(text);
        const cached = this.cache.get(hash);
        
        if (cached) {
            // Update access info
            cached.timestamp = Date.now();
            cached.accessCount++;
            
            // Move to end of access order (most recently used)
            this.updateAccessOrder(hash);
            
            this.hits++;
            return cached.embedding;
        }
        
        this.misses++;
        return null;
    }

    /**
     * Store embedding in cache
     */
    async setEmbedding(text: string, embedding: number[]): Promise<void> {
        const hash = this.hash(text);
        
        // Check if we need to evict before adding
        if (this.cache.size >= this.maxSize && !this.cache.has(hash)) {
            this.evictLRU();
        }
        
        // Store the embedding
        this.cache.set(hash, {
            embedding: [...embedding], // Create a copy to avoid reference issues
            timestamp: Date.now(),
            accessCount: 1
        });
        
        // Update access order
        this.updateAccessOrder(hash);
    }

    /**
     * Update access order for LRU tracking
     */
    private updateAccessOrder(hash: string): void {
        // Remove from current position
        const currentIndex = this.accessOrder.indexOf(hash);
        if (currentIndex !== -1) {
            this.accessOrder.splice(currentIndex, 1);
        }
        
        // Add to end (most recently used)
        this.accessOrder.push(hash);
    }

    /**
     * Evict least recently used item
     */
    private evictLRU(): void {
        if (this.accessOrder.length === 0) return;
        
        const lruHash = this.accessOrder.shift()!;
        this.cache.delete(lruHash);
    }

    /**
     * Create hash of text for cache key
     */
    private hash(text: string): string {
        return createHash('sha256')
            .update(text.trim().toLowerCase())
            .digest('hex')
            .substring(0, 16);
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): {
        size: number;
        maxSize: number;
        hitRate: number;
        hits: number;
        misses: number;
        totalRequests: number;
    } {
        const totalRequests = this.hits + this.misses;
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
            hits: this.hits,
            misses: this.misses,
            totalRequests
        };
    }

    /**
     * Clear the cache
     */
    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Resize cache (useful for dynamic memory management)
     */
    resize(newSize: number): void {
        this.maxSize = newSize;
        
        // Evict items if cache is now too large
        while (this.cache.size > this.maxSize) {
            this.evictLRU();
        }
    }

    /**
     * Get memory usage estimate in bytes
     */
    getMemoryUsage(): number {
        let totalSize = 0;
        
        for (const cached of this.cache.values()) {
            // Estimate: each number is 8 bytes, plus overhead
            totalSize += cached.embedding.length * 8 + 100; // 100 bytes overhead per entry
        }
        
        return totalSize;
    }

    /**
     * Preload embeddings for common queries (useful for warming cache)
     */
    async preload(textEmbeddingPairs: Array<{text: string, embedding: number[]}>): Promise<void> {
        console.error(`[EmbeddingCache] Preloading ${textEmbeddingPairs.length} embeddings...`);
        
        for (const pair of textEmbeddingPairs) {
            await this.setEmbedding(pair.text, pair.embedding);
        }
        
        console.error(`[EmbeddingCache] Preloaded cache, current size: ${this.cache.size}`);
    }

    /**
     * Export cache data for persistence (optional feature)
     */
    exportCache(): any {
        const entries: Array<{hash: string, text: string, embedding: number[], timestamp: number, accessCount: number}> = [];
        
        for (const [hash, data] of this.cache.entries()) {
            entries.push({
                hash,
                text: '', // We don't store original text for privacy
                embedding: data.embedding,
                timestamp: data.timestamp,
                accessCount: data.accessCount
            });
        }
        
        return {
            version: '1.0',
            maxSize: this.maxSize,
            entries,
            stats: this.getCacheStats(),
            exportedAt: new Date().toISOString()
        };
    }

    /**
     * Import cache data from persistence (optional feature)
     */
    importCache(cacheData: any): void {
        if (cacheData.version !== '1.0') {
            console.warn('[EmbeddingCache] Unsupported cache version, skipping import');
            return;
        }
        
        this.clear();
        this.maxSize = cacheData.maxSize || this.maxSize;
        
        for (const entry of cacheData.entries || []) {
            this.cache.set(entry.hash, {
                embedding: entry.embedding,
                timestamp: entry.timestamp,
                accessCount: entry.accessCount
            });
            this.accessOrder.push(entry.hash);
        }
        
        console.error(`[EmbeddingCache] Imported ${this.cache.size} cached embeddings`);
    }
}