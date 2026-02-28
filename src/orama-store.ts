import { create, insert, remove, search, save, load, count, getByID } from '@orama/orama';
import type { AnyOrama, Results } from '@orama/orama';
import { persistToFile, restoreFromFile } from '@orama/plugin-data-persistence/server';
import { existsSync, mkdirSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import * as path from 'path';
import { Document, DocumentChunk, SearchResult, OramaChunkDocument, OramaDocDocument } from './types.js';
import { getDefaultDataDir } from './utils.js';

/**
 * OramaStore: manages two Orama DB instances (chunks + documents) with persistence to disk.
 */
export class OramaStore {
    private chunksDb: AnyOrama | null = null;
    private docsDb: AnyOrama | null = null;
    private dataDir: string;
    private chunksDbPath: string;
    private docsDbPath: string;
    private migrationFlagPath: string;
    private vectorDimensions: number;
    private initialized = false;

    constructor(vectorDimensions: number) {
        const baseDir = getDefaultDataDir();
        this.dataDir = path.join(baseDir, 'data');
        this.chunksDbPath = path.join(this.dataDir, 'orama-chunks.msp');
        this.docsDbPath = path.join(this.dataDir, 'orama-docs.msp');
        this.migrationFlagPath = path.join(this.dataDir, 'migration-complete.flag');
        this.vectorDimensions = vectorDimensions;

        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
        console.error(`[OramaStore] Constructed (vectorDimensions=${this.vectorDimensions}) dataDir=${this.dataDir}`);
    }

    /**
     * Initialize both Orama DB instances.
     * Attempts to restore from disk; if not found, creates empty DBs.
     * Then runs automatic migration from legacy JSON files if needed.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        let restoredChunks = false;
        let restoredDocs = false;

        // Try restoring chunks DB
        if (existsSync(this.chunksDbPath)) {
            try {
                this.chunksDb = await restoreFromFile('binary', this.chunksDbPath, 'node');
                restoredChunks = true;
                console.error('[OramaStore] Restored chunks DB from disk');
            } catch (error) {
                console.error('[OramaStore] Failed to restore chunks DB, creating new:', error);
            }
        }

        // Try restoring docs DB
        if (existsSync(this.docsDbPath)) {
            try {
                this.docsDb = await restoreFromFile('binary', this.docsDbPath, 'node');
                restoredDocs = true;
                console.error('[OramaStore] Restored docs DB from disk');
            } catch (error) {
                console.error('[OramaStore] Failed to restore docs DB, creating new:', error);
            }
        }

        // Create fresh DBs if restoration failed or files don't exist
        if (!restoredChunks) {
            this.chunksDb = this.createChunksDb();
            console.error('[OramaStore] Created new chunks DB');
        }

        if (!restoredDocs) {
            this.docsDb = this.createDocsDb();
            console.error('[OramaStore] Created new docs DB');
        }

        this.initialized = true;

        console.error(`[OramaStore] Initialization finished. chunksDbPath=${this.chunksDbPath} docsDbPath=${this.docsDbPath} vectorDimensions=${this.vectorDimensions}`);
        // Run migration from legacy JSON files if not already done
        if (!restoredChunks && !restoredDocs && !existsSync(this.migrationFlagPath)) {
            await this.migrateFromJson();
        }
    }

    /**
     * Create a new chunks Orama DB with the vector schema
     */
    private createChunksDb(): AnyOrama {
        return create({
            schema: {
                document_id: 'string',
                document_title: 'string',
                chunk_index: 'number',
                content: 'string',
                embedding: `vector[${this.vectorDimensions}]` as `vector[${number}]`,
                start_position: 'number',
                end_position: 'number',
                metadata: 'string',
            },
        });
    }

    /**
     * Create a new documents Orama DB
     */
    private createDocsDb(): AnyOrama {
        return create({
            schema: {
                title: 'string',
                content: 'string',
                created_at: 'string',
                updated_at: 'string',
                metadata: 'string',
            },
        });
    }

    /**
     * Persist both DBs to disk
     */
    private async persistToDisk(): Promise<void> {
        try {
            if (this.chunksDb) {
                await persistToFile(this.chunksDb, 'binary', this.chunksDbPath, 'node');
            }
            if (this.docsDb) {
                await persistToFile(this.docsDb, 'binary', this.docsDbPath, 'node');
            }
            console.error('[OramaStore] Persisted DBs to disk');
        } catch (error) {
            console.error('[OramaStore] Failed to persist DBs to disk:', error);
        }
    }

    /**
     * Migrate legacy JSON documents into Orama.
     * Scans the data directory for *.json files and imports them.
     */
    private async migrateFromJson(): Promise<void> {
        try {
            const files = await readdir(this.dataDir);
            const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'document-index.json' && f !== 'gemini_file_mappings.json');

            if (jsonFiles.length === 0) {
                console.error('[OramaStore] No legacy JSON files found for migration');
                return;
            }

            console.error(`[OramaStore] Migrating ${jsonFiles.length} legacy JSON documents...`);
            let migrated = 0;

            for (const file of jsonFiles) {
                try {
                    const filePath = path.join(this.dataDir, file);
                    const data = await readFile(filePath, 'utf-8');
                    const doc: Document = JSON.parse(data);

                    if (!doc.id || !doc.title || !doc.content) {
                        console.error(`[OramaStore] Skipping invalid JSON file: ${file}`);
                        continue;
                    }

                    await this.addDocumentInternal(doc);
                    migrated++;
                } catch (error) {
                    console.error(`[OramaStore] Failed to migrate ${file}:`, error);
                }
            }

            // Persist after migration
            await this.persistToDisk();

            // Write migration flag
            const { writeFile } = await import('fs/promises');
            await writeFile(this.migrationFlagPath, `Migration completed at ${new Date().toISOString()}\nMigrated ${migrated} documents\n`);

            console.error(`[OramaStore] Migrated ${migrated} documents from JSON to Orama`);
        } catch (error) {
            console.error('[OramaStore] Migration failed:', error);
        }
    }

    /**
     * Internal method to add a full Document (with chunks) to both DBs.
     * Used by migration and by addDocument.
     */
    private async addDocumentInternal(doc: Document): Promise<void> {
        if (!this.docsDb || !this.chunksDb) throw new Error('OramaStore not initialized');

        console.error(`[OramaStore] Inserting document ${doc.id} (${doc.title}) with ${doc.chunks?.length || 0} chunks`);
        // Insert into docs DB
        await insert(this.docsDb, {
            id: doc.id,
            title: doc.title,
            content: doc.content,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
            metadata: JSON.stringify(doc.metadata || {}),
        });

        // Insert chunks into chunks DB
        for (const chunk of doc.chunks) {
            const embedding = chunk.embeddings || [];
            // Skip chunks with missing or wrong-dimension embeddings
            if (embedding.length !== this.vectorDimensions) {
                console.error(`[OramaStore] Skipping chunk ${chunk.id} (embedding dim ${embedding.length} != ${this.vectorDimensions})`);
                continue;
            }

            await insert(this.chunksDb, {
                id: chunk.id,
                document_id: doc.id,
                document_title: doc.title,
                chunk_index: chunk.chunk_index,
                content: chunk.content,
                embedding,
                start_position: chunk.start_position,
                end_position: chunk.end_position,
                metadata: JSON.stringify(chunk.metadata || {}),
            });
        }
        console.error(`[OramaStore] Inserted document ${doc.id} into Orama (chunks inserted)`);
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Add a document and its chunks to the store
     */
    async addDocument(doc: Document): Promise<void> {
        if (!this.initialized) await this.initialize();
        await this.addDocumentInternal(doc);
        await this.persistToDisk();
    }

    /**
     * Delete a document and all associated chunks
     */
    async deleteDocument(documentId: string): Promise<boolean> {
        if (!this.initialized) await this.initialize();
        if (!this.docsDb || !this.chunksDb) return false;

        let deleted = false;

        // Remove from docs DB
        try {
            const docExists = getByID(this.docsDb, documentId);
            if (docExists) {
                await remove(this.docsDb, documentId);
                deleted = true;
            }
        } catch (error) {
            console.error(`[OramaStore] Error removing document ${documentId}:`, error);
        }

        // Remove associated chunks
        try {
            // Find all chunks for this document
            const chunkResults = await search(this.chunksDb, {
                term: documentId,
                properties: ['document_id'],
                limit: 10000,
                threshold: 0,
            }) as Results<OramaChunkDocument>;

            for (const hit of chunkResults.hits) {
                if (hit.document.document_id === documentId) {
                    try {
                        await remove(this.chunksDb, hit.id);
                    } catch {
                        // chunk may already be removed
                    }
                }
            }
        } catch (error) {
            console.error(`[OramaStore] Error removing chunks for ${documentId}:`, error);
        }

        if (deleted) {
            await this.persistToDisk();
        }
        return deleted;
    }

    /**
     * Get a document by ID (full Document with chunks reconstructed)
     */
    async getDocument(documentId: string): Promise<Document | null> {
        if (!this.initialized) await this.initialize();
        if (!this.docsDb || !this.chunksDb) return null;

        try {
            const doc = getByID(this.docsDb, documentId) as OramaDocDocument | undefined;
            if (!doc) return null;

            // Get chunks for this document
            const chunks = await this.getChunksByDocumentId(documentId);

            return {
                id: doc.id,
                title: doc.title,
                content: doc.content,
                metadata: this.safeJsonParse(doc.metadata),
                chunks,
                created_at: doc.created_at,
                updated_at: doc.updated_at,
            };
        } catch {
            return null;
        }
    }

    /**
     * Get all documents (metadata only, no embeddings)
     */
    async getAllDocuments(): Promise<Document[]> {
        if (!this.initialized) await this.initialize();
        if (!this.docsDb || !this.chunksDb) return [];

        try {
            // Use full-text search with empty term to get all docs
            const totalDocs = count(this.docsDb);
            if (totalDocs === 0) return [];

            const result = await search(this.docsDb, {
                term: '',
                limit: totalDocs,
                threshold: 0,
            }) as Results<OramaDocDocument>;

            const documents: Document[] = [];
            for (const hit of result.hits) {
                const d = hit.document;
                // Get chunk count for this document
                const chunks = await this.getChunksByDocumentId(d.id);
                documents.push({
                    id: d.id,
                    title: d.title,
                    content: d.content,
                    metadata: this.safeJsonParse(d.metadata),
                    chunks,
                    created_at: d.created_at,
                    updated_at: d.updated_at,
                });
            }

            return documents;
        } catch (error) {
            console.error('[OramaStore] Error getting all documents:', error);
            return [];
        }
    }

    /**
     * Search chunks using vector similarity, optionally filtered by document_id
     */
    async searchChunks(embedding: number[], limit: number = 10, documentId?: string): Promise<SearchResult[]> {
        if (!this.initialized) await this.initialize();
        if (!this.chunksDb) return [];

        try {
            const searchParams: any = {
                mode: 'vector',
                vector: {
                    value: embedding,
                    property: 'embedding',
                },
                similarity: 0.5,
                limit,
                includeVectors: false,
            };

            // Add document_id filter if specified
            if (documentId) {
                searchParams.where = {
                    document_id: documentId,
                };
            }

            const results = await search(this.chunksDb, searchParams) as Results<OramaChunkDocument>;

            return results.hits.map(hit => ({
                chunk: {
                    id: hit.document.id,
                    document_id: hit.document.document_id,
                    chunk_index: hit.document.chunk_index,
                    content: hit.document.content,
                    start_position: hit.document.start_position,
                    end_position: hit.document.end_position,
                    metadata: this.safeJsonParse(hit.document.metadata),
                } as DocumentChunk,
                score: hit.score,
            }));
        } catch (error) {
            console.error('[OramaStore] Error searching chunks:', error);
            return [];
        }
    }

    /**
     * Search across all documents using hybrid search (full-text + vector)
     */
    async searchAllDocuments(embedding: number[], limit: number = 10, term?: string): Promise<SearchResult[]> {
        if (!this.initialized) await this.initialize();
        if (!this.chunksDb) return [];

        try {
            let results: Results<OramaChunkDocument>;

            if (term) {
                // Hybrid search: full-text + vector
                results = await search(this.chunksDb, {
                    term,
                    mode: 'hybrid',
                    vector: {
                        value: embedding,
                        property: 'embedding',
                    },
                    properties: ['content', 'document_title'],
                    similarity: 0.5,
                    limit,
                    includeVectors: false,
                } as any) as Results<OramaChunkDocument>;
            } else {
                // Pure vector search
                results = await search(this.chunksDb, {
                    mode: 'vector',
                    vector: {
                        value: embedding,
                        property: 'embedding',
                    },
                    similarity: 0.5,
                    limit,
                    includeVectors: false,
                } as any) as Results<OramaChunkDocument>;
            }

            return results.hits.map(hit => ({
                chunk: {
                    id: hit.document.id,
                    document_id: hit.document.document_id,
                    chunk_index: hit.document.chunk_index,
                    content: hit.document.content,
                    start_position: hit.document.start_position,
                    end_position: hit.document.end_position,
                    metadata: this.safeJsonParse(hit.document.metadata),
                } as DocumentChunk,
                score: hit.score,
            }));
        } catch (error) {
            console.error('[OramaStore] Error in searchAllDocuments:', error);
            return [];
        }
    }

    /**
     * Get all chunks for a specific document, sorted by chunk_index
     */
    async getChunksByDocumentId(documentId: string): Promise<DocumentChunk[]> {
        if (!this.initialized) await this.initialize();
        if (!this.chunksDb) return [];

        try {
            const results = await search(this.chunksDb, {
                term: documentId,
                properties: ['document_id'],
                limit: 10000,
                threshold: 0,
            }) as Results<OramaChunkDocument>;

            const chunks: DocumentChunk[] = results.hits
                .filter(hit => hit.document.document_id === documentId)
                .map(hit => ({
                    id: hit.document.id,
                    document_id: hit.document.document_id,
                    chunk_index: hit.document.chunk_index,
                    content: hit.document.content,
                    start_position: hit.document.start_position,
                    end_position: hit.document.end_position,
                    metadata: this.safeJsonParse(hit.document.metadata),
                }))
                .sort((a, b) => a.chunk_index - b.chunk_index);

            return chunks;
        } catch (error) {
            console.error(`[OramaStore] Error getting chunks for ${documentId}:`, error);
            return [];
        }
    }

    /**
     * Safely parse JSON string, returning empty object on failure
     */
    private safeJsonParse(str: string): Record<string, any> {
        try {
            return JSON.parse(str);
        } catch {
            return {};
        }
    }
}
