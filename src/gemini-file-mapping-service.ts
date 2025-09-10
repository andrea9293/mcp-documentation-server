import * as path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

interface GeminiFileMapping {
    [documentId: string]: {
        gemini_file_id: string;
        uploaded_at: string;
        original_filename: string;
        mime_type: string;
    };
}

/**
 * Service for managing Gemini file mappings to avoid re-uploading
 */
export class GeminiFileMappingService {
    private static mappingFile: string;
    private static mappingData: GeminiFileMapping = {};

    /**
     * Initialize the mapping service with the data directory
     */
    public static initialize(dataDir: string): void {
        this.mappingFile = path.join(dataDir, 'gemini_file_mappings.json');
        this.loadMappings();
    }

    /**
     * Load mappings from file
     */
    private static async loadMappings(): Promise<void> {
        try {
            if (existsSync(this.mappingFile)) {
                const data = await readFile(this.mappingFile, 'utf-8');
                this.mappingData = JSON.parse(data);
                console.error(`[GeminiMapping] Loaded ${Object.keys(this.mappingData).length} file mappings`);
            } else {
                this.mappingData = {};
                console.error('[GeminiMapping] No existing mappings file found, starting fresh');
            }
        } catch (error) {
            console.error('[GeminiMapping] Error loading mappings:', error);
            this.mappingData = {};
        }
    }

    /**
     * Save mappings to file
     */
    private static async saveMappings(): Promise<void> {
        try {
            await writeFile(this.mappingFile, JSON.stringify(this.mappingData, null, 2));
            console.error(`[GeminiMapping] Saved ${Object.keys(this.mappingData).length} file mappings`);
        } catch (error) {
            console.error('[GeminiMapping] Error saving mappings:', error);
        }
    }

    /**
     * Get Gemini file ID for a document
     */
    public static getGeminiFileId(documentId: string): string | null {
        const mapping = this.mappingData[documentId];
        return mapping ? mapping.gemini_file_id : null;
    }

    /**
     * Check if a document has a mapping
     */
    public static hasMapping(documentId: string): boolean {
        return documentId in this.mappingData;
    }

    /**
     * Add or update a mapping
     */
    public static async addMapping(
        documentId: string,
        geminiFileId: string,
        originalFilename: string,
        mimeType: string
    ): Promise<void> {
        this.mappingData[documentId] = {
            gemini_file_id: geminiFileId,
            uploaded_at: new Date().toISOString(),
            original_filename: originalFilename,
            mime_type: mimeType
        };

        await this.saveMappings();
        console.error(`[GeminiMapping] Added mapping: ${documentId} -> ${geminiFileId}`);
    }

    /**
     * Remove a mapping
     */
    public static async removeMapping(documentId: string): Promise<void> {
        if (documentId in this.mappingData) {
            delete this.mappingData[documentId];
            await this.saveMappings();
            console.error(`[GeminiMapping] Removed mapping for: ${documentId}`);
        }
    }

    /**
     * Get all mappings
     */
    public static getAllMappings(): GeminiFileMapping {
        return { ...this.mappingData };
    }

    /**
     * Clean up invalid mappings (files that no longer exist on Gemini)
     */
    public static async cleanupInvalidMappings(validGeminiFileIds: string[]): Promise<void> {
        const validIdsSet = new Set(validGeminiFileIds);
        let cleanedCount = 0;

        for (const [documentId, mapping] of Object.entries(this.mappingData)) {
            if (!validIdsSet.has(mapping.gemini_file_id)) {
                delete this.mappingData[documentId];
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            await this.saveMappings();
            console.error(`[GeminiMapping] Cleaned up ${cleanedCount} invalid mappings`);
        }
    }
}
