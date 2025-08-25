import { pipeline } from '@xenova/transformers';
import { EmbeddingProvider } from './types.js';
import { EmbeddingCache } from './embeddings/embedding-cache.js';

/**
 * Get the embedding dimensions for a specific model
 */
function getModelDimensions(modelName: string): number {
    const modelDimensions: Record<string, number> = {
        'Xenova/all-MiniLM-L6-v2': 384,
        'Xenova/paraphrase-multilingual-mpnet-base-v2': 768,
        // Add new models here as needed
    };
    
    // Default to 384 for unknown models (safer fallback)
    return modelDimensions[modelName] || 384;
}

/**
 * Embedding provider using Transformers.js for local embeddings
 */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
    private pipeline: any = null;
    private isInitialized = false;
    private initPromise: Promise<void> | null = null;
    private dimensions: number;
    private cache: EmbeddingCache | null = null;

    constructor(
        private modelName: string = 'Xenova/all-MiniLM-L6-v2'
    ) { 
        this.dimensions = getModelDimensions(modelName);
        
        // Initialize cache if enabled
        if (process.env.MCP_CACHE_ENABLED !== 'false') {
            try {
                this.cache = new EmbeddingCache();
            } catch (error) {
                console.warn('[TransformersEmbeddingProvider] Failed to initialize cache:', error);
            }
        }
    }

    private async initialize(): Promise<void> {
        if (this.isInitialized) return;

        if (this.initPromise) {
            await this.initPromise;
            return;
        }

        this.initPromise = this.doInitialize();
        await this.initPromise;
    } 
    
    private async doInitialize(): Promise<void> {
        try {
            console.error(`Initializing embedding model: ${this.modelName}`);
            console.error('This may take a few minutes for larger models...');

            // Create a timeout promise
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error('Model initialization timed out after 5 minutes'));
                }, 5 * 60 * 1000); // 5 minutes timeout
            });

            // Race between model loading and timeout
            this.pipeline = await Promise.race([
                pipeline('feature-extraction', this.modelName),
                timeoutPromise
            ]);

            this.isInitialized = true;
            console.error('Embedding model initialized successfully');
        } catch (error) {
            console.error('Failed to initialize embedding model:', error);
            throw new Error(`Failed to initialize embedding model: ${error}`);
        }
    }

    /**
     * Pre-initialize the model in background without waiting
     * This helps avoid timeouts on first use
     */
    async preInitialize(): Promise<void> {
        if (this.isInitialized || this.initPromise) return;

        console.error(`Pre-initializing embedding model: ${this.modelName}`);
        console.error('This will happen in background to avoid timeouts...');

        // Start initialization but don't wait for it
        this.initialize().catch(error => {
            console.error('Pre-initialization failed, will retry on first use:', error);
            this.initPromise = null; // Reset to allow retry
        });
    }

    async generateEmbedding(text: string): Promise<number[]> {
        // Check cache first if available
        if (this.cache) {
            const cachedEmbedding = await this.cache.getEmbedding(text);
            if (cachedEmbedding) {
                return cachedEmbedding;
            }
        }

        await this.initialize();

        if (!this.pipeline) {
            throw new Error('Embedding pipeline not initialized');
        }

        try {
            // Generate embeddings
            const output = await this.pipeline(text, {
                pooling: 'mean',
                normalize: true,
            });

            // Convert to regular array
            const embedding = Array.from(output.data as Float32Array);
            
            // Cache the result if cache is available
            if (this.cache) {
                await this.cache.setEmbedding(text, embedding);
            }
            
            return embedding;
        } catch (error) {
            console.error('Error generating embedding:', error);
            throw new Error(`Failed to generate embedding: ${error}`);
        }
    }
    isAvailable(): boolean {
        return this.isInitialized && this.pipeline !== null;
    }

    getModelName(): string {
        return this.modelName;
    }

    getDimensions(): number {
        return this.dimensions;
    }

    /**
     * Get cache statistics if cache is enabled
     */
    getCacheStats(): any {
        return this.cache ? this.cache.getCacheStats() : null;
    }
}

/**
 * Simple embedding provider that uses basic text hashing
 * Used as fallback when transformers.js is not available
 */
export class SimpleEmbeddingProvider implements EmbeddingProvider {
    private readonly dimension: number;

    constructor(dimension: number = 384) { // Default to smaller, safer dimension
        this.dimension = dimension;
    }

    async generateEmbedding(text: string): Promise<number[]> {
        // Create a simple hash-based embedding
        // This is very basic and not suitable for production semantic search
        const words = text.toLowerCase().split(/\s+/);
        const embedding = new Array(this.dimension).fill(0);

        words.forEach((word, index) => {
            const hash = this.simpleHash(word);
            const position = Math.abs(hash) % this.dimension;
            embedding[position] += 1;
        });

        // Normalize the vector
        const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
    }

    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }
    isAvailable(): boolean {
        return true;
    }

    getModelName(): string {
        return 'Simple Hash-based Embeddings';
    }

    getDimensions(): number {
        return this.dimension;
    }

    getCacheStats(): any {
        return { enabled: false, provider: 'SimpleEmbeddingProvider' };
    }
}

/**
 * Factory function to create the best available embedding provider
 */
export async function createEmbeddingProvider(modelName?: string): Promise<EmbeddingProvider> {
    const defaultModel = 'Xenova/all-MiniLM-L6-v2';
    const fallbackModel = 'Xenova/paraphrase-multilingual-mpnet-base-v2';

    // For faster initialization, try the smaller model first if no specific model is requested
    const modelsToTry = modelName
        ? [modelName, fallbackModel]
        : [fallbackModel, defaultModel]; // Try smaller model first for faster startup

    for (const model of modelsToTry) {
        try {
            console.error(`Attempting to load embedding model: ${model}`);

            const provider = new TransformersEmbeddingProvider(model);

            // Create a shorter timeout for testing if model loads
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error('Model test timed out'));
                }, modelName ? 3 * 60 * 1000 : 60 * 1000); // 3 min for specific model, 1 min for auto-selection
            });

            // Test if the model works with a timeout
            await Promise.race([
                provider.generateEmbedding('test'),
                timeoutPromise
            ]);

            console.error(`Successfully loaded embedding model: ${model}`);
            return provider;
        } catch (error) {
            console.error(`Failed to load model ${model}:`, error);

            // If this was the last model to try, continue to simple embeddings
            if (model === modelsToTry[modelsToTry.length - 1]) {
                break;
            }
        }
    }

    // Final fallback to simple embeddings with correct dimensions
    const lastTriedModel = modelsToTry[modelsToTry.length - 1];
    const fallbackDimensions = getModelDimensions(lastTriedModel);
    
    console.error(`All transformer models failed, falling back to simple embeddings with ${fallbackDimensions} dimensions`);
    return new SimpleEmbeddingProvider(fallbackDimensions);
}

/**
 * Create embedding provider with specific model
 */
export async function createEmbeddingProviderWithModel(modelName: string): Promise<EmbeddingProvider> {
    return createEmbeddingProvider(modelName);
}

/**
 * Create embedding provider with lazy initialization (no immediate test)
 */
export function createLazyEmbeddingProvider(modelName?: string): EmbeddingProvider {
    const defaultModel = 'Xenova/all-MiniLM-L6-v2'; // Use smaller model as default for faster startup
    return new TransformersEmbeddingProvider(modelName || defaultModel);
}
