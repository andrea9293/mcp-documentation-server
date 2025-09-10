import 'dotenv/config';
import {
    GoogleGenAI,
    Type,
    createUserContent,
    createPartFromUri,
} from '@google/genai';
import * as path from 'path';
import { existsSync } from 'fs';
import { GeminiFileMappingService } from './gemini-file-mapping-service.js';

/**
 * Service for AI-powered document search using Gemini
 */
export class GeminiSearchService {
    /**
     * Search within a document using Gemini AI
     * @param documentId The document ID to search in
     * @param query The search query
     * @param dataDir The data directory path
     * @param apiKey Optional API key (will use env var if not provided)
     * @returns Search results from Gemini
     */
    public static async searchDocumentWithGemini(
        documentId: string,
        query: string,
        dataDir: string,
        apiKey?: string
    ): Promise<string> {
        const geminiApiKey = process.env.GEMINI_API_KEY || apiKey;
        if (!geminiApiKey) {
            throw new Error('GEMINI_API_KEY environment variable is required for AI-powered search');
        }

        return await performGeminiSearch(documentId, query, dataDir, geminiApiKey);
    }
}

async function performGeminiSearch(
    documentId: string,
    query: string,
    dataDir: string,
    apiKey: string
): Promise<string> {
    // Initialize mapping service
    GeminiFileMappingService.initialize(dataDir);

    const ai = new GoogleGenAI({
        apiKey: apiKey,
    });

    // Find the original file (any extension except .json)
    const fs = await import('fs/promises');
    const files = await fs.readdir(dataDir);
    let originalFile: string | null = null;

    for (const file of files) {
        if (file.startsWith(documentId) && !file.endsWith('.json')) {
            originalFile = file;
            break;
        }
    }

    if (!originalFile) {
        throw new Error(`Original file for document ${documentId} not found in data directory`);
    }

    const filePath = path.join(dataDir, originalFile);
    if (!existsSync(filePath)) {
        throw new Error(`File ${originalFile} not found at ${filePath}`);
    }

    console.error(`[GeminiSearch] Processing file: ${originalFile}`);

    let myfile;
    const mimeType = getMimeType(originalFile);

    // Check if we already have a mapping for this document
    if (GeminiFileMappingService.hasMapping(documentId)) {
        const existingGeminiFileId = GeminiFileMappingService.getGeminiFileId(documentId);
        console.error(`[GeminiSearch] Found existing mapping: ${documentId} -> ${existingGeminiFileId}`);

        try {
            // Verify the file still exists on Gemini
            const fileStatus = await ai.files.get({ name: existingGeminiFileId as string });
            if (fileStatus.state === 'ACTIVE') {
                console.error(`[GeminiSearch] Using existing Gemini file: ${existingGeminiFileId}`);
                myfile = {
                    uri: fileStatus.uri,
                    mimeType: fileStatus.mimeType,
                    name: existingGeminiFileId
                };
            } else {
                console.error(`[GeminiSearch] Existing file is not active, will re-upload`);
                // Remove invalid mapping
                await GeminiFileMappingService.removeMapping(documentId);
            }
        } catch (error) {
            console.error(`[GeminiSearch] Error checking existing file: ${error}`);
            // Remove invalid mapping
            await GeminiFileMappingService.removeMapping(documentId);
        }
    }

    // If we don't have a valid existing file, upload a new one
    if (!myfile) {
        console.error(`[GeminiSearch] Uploading new file to Gemini`);

        // Get list of existing files for cleanup
        let listOfFiles = [];
        const listResponse = await ai.files.list({ config: { pageSize: 50 } });
        for await (const file of listResponse) {
            listOfFiles.push(file);
        }

        console.error('[GeminiSearch] Uploaded Files found:', listOfFiles.length);

        // Upload file to Gemini
        myfile = await ai.files.upload({
            file: filePath,
            config: { mimeType: mimeType },
        });

        console.error(`[GeminiSearch] File uploaded to Gemini: ${myfile.uri}`);
        console.error(`[GeminiSearch] File ID: ${myfile.name}`);

        // Save the mapping
        await GeminiFileMappingService.addMapping(
            documentId,
            myfile.name as string,
            originalFile,
            mimeType
        );
    }

    // Wait for file to be processed (only for newly uploaded files)
    if (!GeminiFileMappingService.hasMapping(documentId)) {
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max wait
        while (attempts < maxAttempts) {
            const fileStatus = await ai.files.get({ name: myfile.name as string });
            if (fileStatus.state === 'ACTIVE') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }

        if (attempts >= maxAttempts) {
            throw new Error('File processing timeout - file not ready for analysis');
        }
    }

    // Configure Gemini for document search
    const config = {
        thinkingConfig: {
            thinkingBudget: 16000, // Higher budget for document analysis
        },
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.OBJECT,
            required: ['search_results', 'relevant_sections'],
            properties: {
                search_results: {
                    type: Type.STRING,
                    description: "The most relevant content found in the document that matches the search query.",
                },
                relevant_sections: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            section_title: { type: Type.STRING },
                            content: { type: Type.STRING },
                            relevance_score: { type: Type.NUMBER },
                            page_number: { type: Type.NUMBER }
                        }
                    },
                    description: "Array of relevant sections with their content, page number (if applicable) and relevance scores."
                },
            },
        },
        systemInstruction: [
            {
                text: `You are an expert document analyst specializing in semantic search and content extraction. Your task is to analyze the provided document and find the most relevant content that matches the user's search query.

Search Strategy:
1. **Semantic Understanding**: Understand the intent and context of the search query
2. **Content Analysis**: Scan the entire document for relevant information
3. **Relevance Scoring**: Rate how well each section matches the query
4. **Content Extraction**: Extract the most relevant sections with their surrounding context
5. **Summarization**: Provide concise but comprehensive results

Guidelines:
- Focus on factual content that directly addresses the query
- Include relevant context around found content
- Rate confidence based on how well the content matches the query
- Extract multiple relevant sections if they provide different perspectives
- Maintain the original meaning and context of the content

Return structured results that help the user understand what was found and why it's relevant.`,
            },
        ],
    };

    // Create search prompt
    const searchPrompt = `
Please analyze this document and find content related to: "${query}"

Search for:
- Direct matches to the query terms
- Semantic equivalents and related concepts
- Contextual information that helps understand the topic
- Any relevant examples, explanations, or details

Provide the most relevant informations with their context.
`;

    // Generate content with Gemini
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        config: config,
        contents: createUserContent([
            createPartFromUri(myfile.uri || '', myfile.mimeType || getMimeType(originalFile)),
            searchPrompt,
        ]),
    });

    try {
        // Get list of files for cleanup
        let listOfFiles = [];
        const listResponse = await ai.files.list({ config: { pageSize: 50 } });
        for await (const file of listResponse) {
            listOfFiles.push(file);
        }

        for (const pdfFile of listOfFiles) {
            if (typeof pdfFile.name === 'string') {
                if (pdfFile.state !== "ACTIVE") {
                    await ai.files.delete({ name: pdfFile.name });
                }
            }
        }
    } catch (cleanupError) {
        console.error(`[GeminiSearch] Warning: Could not cleanup file ${myfile.name}:`, cleanupError);
    }

    console.error(`[GeminiSearch] Search completed for document ${documentId}`);
    const result = response.text;
    return result ? result.trim() : 'No search results found';
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();

    switch (ext) {
        case '.pdf':
            return 'application/pdf';
        case '.txt':
            return 'text/plain';
        case '.md':
            return 'text/markdown';
        case '.docx':
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case '.doc':
            return 'application/msword';
        default:
            return 'application/octet-stream';
    }
}
