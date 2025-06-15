import { pipeline } from '@xenova/transformers';
import { EmbeddingProvider } from './types.js';

/**
 * Embedding provider using Transformers.js for local embeddings
 */
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  private pipeline: any = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(
    private modelName: string = 'Xenova/all-MiniLM-L6-v2'
  ) {}

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
      console.log(`Initializing embedding model: ${this.modelName}`);
      this.pipeline = await pipeline('feature-extraction', this.modelName);
      this.isInitialized = true;
      console.log('Embedding model initialized successfully');
    } catch (error) {
      console.error('Failed to initialize embedding model:', error);
      throw new Error(`Failed to initialize embedding model: ${error}`);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
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
      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  isAvailable(): boolean {
    return this.isInitialized && this.pipeline !== null;
  }
}

/**
 * Simple embedding provider that uses basic text hashing
 * Used as fallback when transformers.js is not available
 */
export class SimpleEmbeddingProvider implements EmbeddingProvider {
  private readonly dimension = 384; // Same as all-MiniLM-L6-v2

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
}

/**
 * Factory function to create the best available embedding provider
 */
export async function createEmbeddingProvider(): Promise<EmbeddingProvider> {
  try {
    const provider = new TransformersEmbeddingProvider();
    // Test if transformers.js works
    await provider.generateEmbedding('test');
    return provider;
  } catch (error) {
    console.warn('Transformers.js not available, falling back to simple embeddings:', error);
    return new SimpleEmbeddingProvider();
  }
}
