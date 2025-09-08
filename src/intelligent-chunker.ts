import { EmbeddingProvider, DocumentChunk } from './types.js';

export interface ChunkOptions {
    maxSize?: number;
    overlap?: number;
    minSize?: number;
    preserveCodeBlocks?: boolean;
    preserveMarkdown?: boolean;
    adaptiveSize?: boolean;
    addContext?: boolean;
}

export interface ChunkMetadata {
    type: 'code' | 'text' | 'markdown' | 'structured' | 'mixed';
    language?: string;
    section?: string;
    heading?: string;
    complexity_score?: number;
    semantic_topic?: string;
    surrounding_context?: string;
    chunk_size: number;
    original_document_type?: string;
}

export enum ContentType {
    CODE = 'code',
    MARKDOWN = 'markdown',
    HTML = 'html',
    TEXT = 'text',
    PDF = 'pdf',
    MIXED = 'mixed'
}

export class IntelligentChunker {
    private embeddingProvider: EmbeddingProvider;

    constructor(embeddingProvider: EmbeddingProvider) {
        this.embeddingProvider = embeddingProvider;
    }

    /**
     * Main chunking method that automatically detects content type and applies best strategy
     */
    async createChunks(
        documentId: string, 
        content: string, 
        options: ChunkOptions = {}
    ): Promise<DocumentChunk[]> {
        const contentType = this.detectContentType(content);
        
        // Set default options based on content type
        const mergedOptions = this.getOptimalOptions(contentType, options);
        
        console.error(`[IntelligentChunker] Processing ${contentType} content with ${mergedOptions.maxSize} max size`);
        
        // Check if parallel processing should be used
        const useParallel = process.env.MCP_PARALLEL_ENABLED !== 'false' && 
                           content.length > 10000; // Use parallel for large documents
        
        if (useParallel) {
            try {
                console.error(`[IntelligentChunker] Using parallel processing for large document (${content.length} chars)`);
                return await this.createChunksParallel(documentId, content, contentType, mergedOptions);
            } catch (error) {
                console.warn('[IntelligentChunker] Parallel processing failed, falling back to sequential:', error);
                // Fall through to sequential processing
            }
        }
        
        return await this.createChunksSequential(documentId, content, contentType, mergedOptions);
    }

    /**
     * Sequential chunking (original implementation)
     */
    private async createChunksSequential(
        documentId: string, 
        content: string, 
        contentType: ContentType,
        options: ChunkOptions
    ): Promise<DocumentChunk[]> {
        let chunks: DocumentChunk[];
        
        switch (contentType) {
            case ContentType.CODE:
                chunks = await this.chunkCode(documentId, content, options);
                break;
            case ContentType.MARKDOWN:
                chunks = await this.chunkMarkdown(documentId, content, options);
                break;
            case ContentType.HTML:
                chunks = await this.chunkHtml(documentId, content, options);
                break;
            case ContentType.MIXED:
                chunks = await this.chunkMixed(documentId, content, options);
                break;
            default:
                chunks = await this.chunkText(documentId, content, options);
        }
        
        // Apply semantic chunking if enabled
        if (options.adaptiveSize) {
            chunks = await this.applySemanticRefinement(chunks, options);
        }
        
        // Add contextual information if enabled
        if (options.addContext) {
            chunks = await this.enrichWithContext(chunks, content);
        }
        
        console.error(`[IntelligentChunker] Created ${chunks.length} chunks (sequential)`);
        return chunks;
    }

    /**
     * Parallel chunking for improved performance on large documents
     */
    private async createChunksParallel(
        documentId: string, 
        content: string, 
        contentType: ContentType,
        options: ChunkOptions
    ): Promise<DocumentChunk[]> {
        const maxWorkers = parseInt(process.env.MCP_MAX_WORKERS || '4');
        
        // For parallel processing, we first create basic chunks quickly
        let initialChunks: DocumentChunk[];
        
        // Create initial chunks using appropriate strategy
        switch (contentType) {
            case ContentType.CODE:
                initialChunks = await this.chunkCode(documentId, content, options);
                break;
            case ContentType.MARKDOWN:
                initialChunks = await this.chunkMarkdown(documentId, content, options);
                break;
            case ContentType.HTML:
                initialChunks = await this.chunkHtml(documentId, content, options);
                break;
            case ContentType.MIXED:
                initialChunks = await this.chunkMixed(documentId, content, options);
                break;
            default:
                initialChunks = await this.chunkText(documentId, content, options);
        }

        // Now process chunks in parallel batches
        const batchSize = Math.max(1, Math.ceil(initialChunks.length / maxWorkers));
        const batches: DocumentChunk[][] = [];
        
        for (let i = 0; i < initialChunks.length; i += batchSize) {
            batches.push(initialChunks.slice(i, i + batchSize));
        }

        console.error(`[IntelligentChunker] Processing ${initialChunks.length} chunks in ${batches.length} parallel batches`);

        // Process batches in parallel
        const processedBatches = await Promise.all(
            batches.map(async (batch, batchIndex) => {
                try {
                    return await this.processChunkBatch(batch, options, content);
                } catch (error) {
                    console.warn(`[IntelligentChunker] Batch ${batchIndex} failed, using original chunks:`, error);
                    return batch; // Return original chunks if processing fails
                }
            })
        );

        // Flatten results
        const chunks = processedBatches.flat();
        
        console.error(`[IntelligentChunker] Created ${chunks.length} chunks (parallel)`);
        return chunks;
    }

    /**
     * Process a batch of chunks (can be run in parallel)
     */
    private async processChunkBatch(
        chunks: DocumentChunk[], 
        options: ChunkOptions,
        originalContent: string
    ): Promise<DocumentChunk[]> {
        let processedChunks = chunks;

        // Apply semantic refinement to this batch
        if (options.adaptiveSize) {
            processedChunks = await this.applySemanticRefinement(processedChunks, options);
        }

        // Add contextual information if enabled
        if (options.addContext) {
            processedChunks = await this.enrichWithContext(processedChunks, originalContent);
        }

        return processedChunks;
    }

    /**
     * Detect the type of content to determine chunking strategy
     */
    private detectContentType(content: string): ContentType {
        const codePatterns = [
            /^import\s+/m,
            /^from\s+\w+\s+import/m,
            /^\s*def\s+\w+/m,
            /^\s*function\s+\w+/m,
            /^\s*class\s+\w+/m,
            /^\s*public\s+class/m,
            /^\s*interface\s+\w+/m,
            /^\s*export\s+(class|function|interface)/m,
            /\{[\s\S]*\}/,
            /^\s*if\s*\(/m,
            /^\s*for\s*\(/m,
            /^\s*while\s*\(/m
        ];

        const markdownPatterns = [
            /^#{1,6}\s+/m,
            /^\*\s+/m,
            /^\d+\.\s+/m,
            /\[.*\]\(.*\)/,
            /```[\s\S]*?```/,
            /^\|.*\|.*\|/m,
            /^>\s+/m
        ];

        const htmlPatterns = [
            /<html/i,
            /<body/i,
            /<div/i,
            /<p>/i,
            /<h[1-6]>/i,
            /<script/i,
            /<style/i
        ];

        // Count matches for each type
        const codeScore = codePatterns.reduce((score, pattern) => 
            score + (pattern.test(content) ? 1 : 0), 0);
        const markdownScore = markdownPatterns.reduce((score, pattern) => 
            score + (pattern.test(content) ? 1 : 0), 0);
        const htmlScore = htmlPatterns.reduce((score, pattern) => 
            score + (pattern.test(content) ? 1 : 0), 0);

        // Check for mixed content
        if ((codeScore > 0 && markdownScore > 0) || 
            (codeScore > 0 && htmlScore > 0) || 
            (markdownScore > 0 && htmlScore > 0) ||
            (codeScore >= 2 && content.length > 1000)) { // Large docs with code are likely mixed
            return ContentType.MIXED;
        }

        if (htmlScore >= 2) return ContentType.HTML;
        if (markdownScore >= 2) return ContentType.MARKDOWN;
        if (codeScore >= 2) return ContentType.CODE;
        
        return ContentType.TEXT;
    }

    /**
     * Get optimal chunking options based on content type
     */
    private getOptimalOptions(contentType: ContentType, userOptions: ChunkOptions): ChunkOptions {
        const defaults: Record<ContentType, ChunkOptions> = {
            [ContentType.CODE]: {
                maxSize: 150,
                overlap: 30, // ~20% overlap
                minSize: 50,
                preserveCodeBlocks: true,
                adaptiveSize: true,
                addContext: true
            },
            [ContentType.MARKDOWN]: {
                maxSize: 400,
                overlap: 60, // ~15% overlap
                minSize: 100,
                preserveMarkdown: true,
                adaptiveSize: true,
                addContext: true
            },
            [ContentType.HTML]: {
                maxSize: 300,
                overlap: 50,
                minSize: 80,
                adaptiveSize: true,
                addContext: true
            },
            [ContentType.TEXT]: {
                maxSize: 500,
                overlap: 75, // ~15% overlap
                minSize: 100,
                adaptiveSize: false,
                addContext: true
            },
            [ContentType.MIXED]: {
                maxSize: 300,
                overlap: 60,
                minSize: 80,
                preserveCodeBlocks: true,
                preserveMarkdown: true,
                adaptiveSize: true,
                addContext: true
            },
            [ContentType.PDF]: {
                maxSize: 400,
                overlap: 70, // ~17% overlap  
                minSize: 100,
                adaptiveSize: true,
                addContext: true
            }
        };

        return { ...defaults[contentType], ...userOptions };
    }

    /**
     * Chunk code content with language-specific awareness
     */
    private async chunkCode(
        documentId: string, 
        content: string, 
        options: ChunkOptions
    ): Promise<DocumentChunk[]> {
        const language = this.detectProgrammingLanguage(content);
        const separators = this.getLanguageSpecificSeparators(language);
        
        // console.error(`[IntelligentChunker] Chunking ${language} code`);
        
        return this.recursiveChunk(documentId, content, separators, options, {
            type: 'code',
            language,
            original_document_type: 'code'
        });
    }

    /**
     * Detect programming language from code content
     */
    private detectProgrammingLanguage(content: string): string {
        const patterns: Record<string, RegExp[]> = {
            'typescript': [/^import\s+.*from\s+['"].*['"];?$/m, /^export\s+(interface|type|class)/m, /:\s*\w+(\[\])?(\s*\|\s*\w+)*\s*[=;]/],
            'javascript': [/^const\s+\w+\s*=\s*require\(/m, /^module\.exports\s*=/m, /^function\s+\w+/m],
            'python': [/^def\s+\w+/m, /^import\s+\w+/m, /^from\s+\w+\s+import/m, /^class\s+\w+:/m],
            'java': [/^public\s+class\s+\w+/m, /^import\s+\w+(\.\w+)*;/m, /^package\s+\w+/m],
            'csharp': [/^using\s+\w+/m, /^namespace\s+\w+/m, /^public\s+(class|interface)/m],
            'cpp': [/^#include\s*<.*>/m, /^using\s+namespace/m, /^class\s+\w+/m],
            'rust': [/^use\s+\w+/m, /^fn\s+\w+/m, /^impl\s+\w+/m],
            'go': [/^package\s+\w+/m, /^import\s*\(/m, /^func\s+\w+/m]
        };

        for (const [lang, regexes] of Object.entries(patterns)) {
            const matches = regexes.reduce((count, regex) => count + (regex.test(content) ? 1 : 0), 0);
            if (matches >= 2) return lang;
        }

        return 'unknown';
    }

    /**
     * Get language-specific separators for better code chunking
     */
    private getLanguageSpecificSeparators(language: string): string[] {
        const separators: Record<string, string[]> = {
            'python': ['\nclass ', '\ndef ', '\n\ndef ', '\n\n', '\n', ' ', ''],
            'javascript': ['\nfunction ', '\nclass ', '\nexport ', '\n\n', '\n', ' ', ''],
            'typescript': ['\ninterface ', '\ntype ', '\nclass ', '\nfunction ', '\nexport ', '\n\n', '\n', ' ', ''],
            'java': ['\npublic class ', '\npublic interface ', '\npublic ', '\n\n', '\n', ' ', ''],
            'csharp': ['\npublic class ', '\npublic interface ', '\npublic ', '\n\n', '\n', ' ', ''],
            'cpp': ['\nclass ', '\nvoid ', '\nint ', '\n\n', '\n', ' ', ''],
            'rust': ['\nfn ', '\nimpl ', '\nstruct ', '\nenum ', '\n\n', '\n', ' ', ''],
            'go': ['\nfunc ', '\ntype ', '\nstruct ', '\n\n', '\n', ' ', '']
        };

        return separators[language] || ['\n\n', '\n', ' ', ''];
    }

    /**
     * Chunk markdown content preserving structure
     */
    private async chunkMarkdown(
        documentId: string, 
        content: string, 
        options: ChunkOptions
    ): Promise<DocumentChunk[]> {
        const separators = [
            '\n## ', '\n### ', '\n#### ', '\n##### ', '\n###### ',  // Headers
            '\n\n', // Paragraphs
            '\n', // Lines
            '. ', // Sentences
            ' ', // Words
            '' // Characters
        ];

        return this.recursiveChunk(documentId, content, separators, options, {
            type: 'markdown',
            original_document_type: 'markdown'
        });
    }

    /**
     * Chunk HTML content preserving structure
     */
    private async chunkHtml(
        documentId: string, 
        content: string, 
        options: ChunkOptions
    ): Promise<DocumentChunk[]> {
        const separators = [
            '</div>', '</section>', '</article>', '</p>',
            '\n\n', '\n', '. ', ' ', ''
        ];

        return this.recursiveChunk(documentId, content, separators, options, {
            type: 'structured',
            original_document_type: 'html'
        });
    }

    /**
     * Chunk mixed content using hybrid approach
     */
    private async chunkMixed(
        documentId: string, 
        content: string, 
        options: ChunkOptions
    ): Promise<DocumentChunk[]> {
        // First, identify and separate different content types
        const sections = this.identifyContentSections(content);
        const allChunks: DocumentChunk[] = [];
        
        let globalPosition = 0;
        
        for (const section of sections) {
            let sectionChunks: DocumentChunk[];
            
            switch (section.type) {
                case 'code':
                    sectionChunks = await this.chunkCode(documentId, section.content, {
                        ...options,
                        maxSize: Math.min(options.maxSize || 150, 150)
                    });
                    break;
                case 'markdown':
                    sectionChunks = await this.chunkMarkdown(documentId, section.content, options);
                    break;
                default:
                    sectionChunks = await this.chunkText(documentId, section.content, options);
            }
            
            // Adjust positions to be global
            for (const chunk of sectionChunks) {
                chunk.start_position += globalPosition;
                chunk.end_position += globalPosition;
                chunk.chunk_index = allChunks.length;
                chunk.id = `${documentId}_chunk_${allChunks.length}`;
                allChunks.push(chunk);
            }
            
            globalPosition += section.content.length;
        }
        
        return allChunks;
    }

    /**
     * Identify different content sections in mixed content
     */
    private identifyContentSections(content: string): Array<{type: string, content: string}> {
        const sections: Array<{type: string, content: string}> = [];
        const lines = content.split('\n');
        
        let currentSection = { type: 'text', content: '' };
        
        for (const line of lines) {
            let lineType = 'text';
            
            // Detect code blocks with ```
            if (line.trim().startsWith('```')) {
                if (currentSection.type === 'code') {
                    // End of code block
                    currentSection.content += line + '\n';
                    sections.push(currentSection);
                    currentSection = { type: 'text', content: '' };
                    continue;
                } else {
                    // Start of code block
                    if (currentSection.content.trim()) {
                        sections.push(currentSection);
                    }
                    currentSection = { type: 'code', content: line + '\n' };
                    continue;
                }
            }
            
            // Detect inline code patterns (like from PDFs)
            const codePatterns = [
                /^\s*(public|private|protected)\s+(class|interface|static)/,
                /^\s*(function|def|class)\s+\w+/,
                /^\s*import\s+/,
                /^\s*from\s+\w+\s+import/,
                /^\s*\w+\s*[({].*[)}]\s*[{;]/,
                /^\s*\/\/|^\s*\/\*|^\s*\*/,  // Comments
                /^\s*}\s*$|^\s*{\s*$/,       // Braces alone
                /^\s+return\s+/,             // Indented return
                /^\s+if\s*\(|^\s+for\s*\(|^\s+while\s*\(/  // Indented control structures
            ];
            
            if (currentSection.type === 'code') {
                lineType = 'code';
            } else if (line.match(/^#{1,6}\s/) || line.match(/^\*\s/) || line.match(/^\d+\.\s/)) {
                lineType = 'markdown';
            } else if (codePatterns.some(pattern => pattern.test(line))) {
                lineType = 'code';
            }
            
            if (lineType !== currentSection.type && currentSection.content.trim()) {
                sections.push(currentSection);
                currentSection = { type: lineType, content: line + '\n' };
            } else {
                currentSection.content += line + '\n';
            }
        }
        
        if (currentSection.content.trim()) {
            sections.push(currentSection);
        }
        
        return sections;
    }

    /**
     * Chunk regular text content
     */
    private async chunkText(
        documentId: string, 
        content: string, 
        options: ChunkOptions
    ): Promise<DocumentChunk[]> {
        const separators = ['\n\n', '\n', '. ', ' ', ''];
        
        return this.recursiveChunk(documentId, content, separators, options, {
            type: 'text',
            original_document_type: 'text'
        });
    }

    /**
     * Recursive chunking with hierarchical separators (LangChain-inspired)
     */
    private async recursiveChunk(
        documentId: string,
        content: string,
        separators: string[],
        options: ChunkOptions,
        baseMetadata: Partial<ChunkMetadata>
    ): Promise<DocumentChunk[]> {
        const chunks: DocumentChunk[] = [];
        const maxSize = options.maxSize || 500;
        const overlap = options.overlap || 50;
        
        if (content.length <= maxSize) {
            // Content fits in one chunk
            const embeddings = await this.embeddingProvider.generateEmbedding(content);
            chunks.push({
                id: `${documentId}_chunk_0`,
                document_id: documentId,
                chunk_index: 0,
                content: content.trim(),
                embeddings,
                start_position: 0,
                end_position: content.length,
                metadata: {
                    ...baseMetadata,
                    chunk_size: content.length,
                    complexity_score: this.calculateComplexity(content)
                } as ChunkMetadata
            });
            return chunks;
        }

        // Use recursive splitting
        const splits = this.splitWithSeparators(content, separators, maxSize);
        
        let chunkIndex = 0;
        let globalPosition = 0;
        
        for (let i = 0; i < splits.length; i++) {
            const split = splits[i];
            let chunkContent = split;
            
            // Add overlap with previous chunk
            if (i > 0 && overlap > 0) {
                const prevSplit = splits[i - 1];
                const overlapText = prevSplit.slice(-overlap);
                chunkContent = overlapText + ' ' + chunkContent;
            }
            
            const embeddings = await this.embeddingProvider.generateEmbedding(chunkContent);
            const startPos = globalPosition;
            const endPos = globalPosition + split.length;
            
            chunks.push({
                id: `${documentId}_chunk_${chunkIndex}`,
                document_id: documentId,
                chunk_index: chunkIndex,
                content: chunkContent.trim(),
                embeddings,
                start_position: startPos,
                end_position: endPos,
                metadata: {
                    ...baseMetadata,
                    chunk_size: chunkContent.length,
                    complexity_score: this.calculateComplexity(chunkContent),
                    section: this.extractSection(chunkContent)
                } as ChunkMetadata
            });
            
            globalPosition = endPos;
            chunkIndex++;
        }
        
        return chunks;
    }

    /**
     * Split text using hierarchical separators
     */
    private splitWithSeparators(text: string, separators: string[], maxSize: number): string[] {
        if (separators.length === 0 || text.length <= maxSize) {
            return [text];
        }

        const separator = separators[0];
        const remainingSeparators = separators.slice(1);
        
        const splits = text.split(separator);
        const finalSplits: string[] = [];
        
        let currentGroup = '';
        
        for (const split of splits) {
            const testGroup = currentGroup + (currentGroup ? separator : '') + split;
            
            if (testGroup.length <= maxSize) {
                currentGroup = testGroup;
            } else {
                // Current group is ready to be added
                if (currentGroup) {
                    if (currentGroup.length > maxSize) {
                        // Need to split further
                        const subSplits = this.splitWithSeparators(currentGroup, remainingSeparators, maxSize);
                        finalSplits.push(...subSplits);
                    } else {
                        finalSplits.push(currentGroup);
                    }
                }
                
                // Start new group with current split
                currentGroup = split;
                if (currentGroup.length > maxSize) {
                    // Current split itself is too large
                    const subSplits = this.splitWithSeparators(currentGroup, remainingSeparators, maxSize);
                    finalSplits.push(...subSplits);
                    currentGroup = '';
                }
            }
        }
        
        if (currentGroup) {
            if (currentGroup.length > maxSize) {
                const subSplits = this.splitWithSeparators(currentGroup, remainingSeparators, maxSize);
                finalSplits.push(...subSplits);
            } else {
                finalSplits.push(currentGroup);
            }
        }
        
        return finalSplits.filter(s => s.trim().length > 0);
    }

    /**
     * Apply semantic refinement using embeddings similarity
     */
    private async applySemanticRefinement(
        chunks: DocumentChunk[], 
        options: ChunkOptions
    ): Promise<DocumentChunk[]> {
        if (chunks.length < 2) return chunks;
        
        console.error(`[IntelligentChunker] Applying semantic refinement to ${chunks.length} chunks`);
        
        const refinedChunks: DocumentChunk[] = [];
        let currentChunk = chunks[0];
        
        for (let i = 1; i < chunks.length; i++) {
            const nextChunk = chunks[i];
            
            // Calculate semantic similarity between chunks
            const similarity = this.calculateSimilarity(
                currentChunk.embeddings || [],
                nextChunk.embeddings || []
            );
            
            // If chunks are very similar and combined size is reasonable, merge them
            if (similarity > 0.8 && 
                (currentChunk.content.length + nextChunk.content.length) <= (options.maxSize || 500) * 1.5) {
                
                // Merge chunks
                const mergedContent = currentChunk.content + '\n' + nextChunk.content;
                const mergedEmbeddings = await this.embeddingProvider.generateEmbedding(mergedContent);
                
                currentChunk = {
                    ...currentChunk,
                    content: mergedContent,
                    embeddings: mergedEmbeddings,
                    end_position: nextChunk.end_position,
                    metadata: {
                        ...currentChunk.metadata,
                        chunk_size: mergedContent.length,
                        semantic_topic: 'merged'
                    }
                };
            } else {
                // Keep current chunk and move to next
                refinedChunks.push(currentChunk);
                currentChunk = nextChunk;
            }
        }
        
        refinedChunks.push(currentChunk);
        
        // Re-index chunks
        refinedChunks.forEach((chunk, index) => {
            chunk.chunk_index = index;
            chunk.id = `${chunk.document_id}_chunk_${index}`;
        });
        
        console.error(`[IntelligentChunker] Refined to ${refinedChunks.length} chunks`);
        return refinedChunks;
    }

    /**
     * Enrich chunks with contextual information
     */
    private async enrichWithContext(chunks: DocumentChunk[], originalContent: string): Promise<DocumentChunk[]> {
        const headings = this.extractHeadings(originalContent);
        
        for (const chunk of chunks) {
            // Find the most relevant heading for this chunk
            const relevantHeading = this.findRelevantHeading(chunk, headings);
            if (relevantHeading) {
                if (!chunk.metadata) {
                    chunk.metadata = {};
                }
                chunk.metadata.heading = relevantHeading;
                chunk.metadata.section = relevantHeading;
            }
            
            // Add surrounding context (simplified)
            const chunkIndex = chunk.chunk_index;
            if (chunkIndex > 0 && chunkIndex < chunks.length - 1) {
                if (!chunk.metadata) {
                    chunk.metadata = {};
                }
                const prevContent = chunks[chunkIndex - 1].content.substring(0, 100);
                const nextContent = chunks[chunkIndex + 1].content.substring(0, 100);
                chunk.metadata.surrounding_context = `Previous: ${prevContent}... Next: ${nextContent}...`;
            }
        }
        
        return chunks;
    }

    /**
     * Calculate text complexity score
     */
    private calculateComplexity(text: string): number {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const uniqueWords = new Set(words.map(w => w.toLowerCase()));
        
        if (words.length === 0) return 0;
        
        const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
        const lexicalDiversity = uniqueWords.size / words.length;
        const hasCode = /[{}();]/.test(text) ? 0.3 : 0;
        
        // Normalize to 0-1 scale
        return Math.min(1, (avgWordsPerSentence / 20) * 0.5 + lexicalDiversity * 0.5 + hasCode);
    }

    /**
     * Calculate cosine similarity between two embedding vectors
     */
    private calculateSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length || a.length === 0) return 0;
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        const norm = Math.sqrt(normA) * Math.sqrt(normB);
        return norm === 0 ? 0 : dotProduct / norm;
    }

    /**
     * Extract headings from content
     */
    private extractHeadings(content: string): Array<{level: number, text: string, position: number}> {
        const headings: Array<{level: number, text: string, position: number}> = [];
        
        // Markdown headings
        const markdownHeadings = content.matchAll(/^(#{1,6})\s+(.+)$/gm);
        for (const match of markdownHeadings) {
            headings.push({
                level: match[1].length,
                text: match[2].trim(),
                position: match.index || 0
            });
        }
        
        // HTML headings
        const htmlHeadings = content.matchAll(/<h([1-6]).*?>(.*?)<\/h[1-6]>/gi);
        for (const match of htmlHeadings) {
            headings.push({
                level: parseInt(match[1]),
                text: match[2].replace(/<[^>]*>/g, '').trim(),
                position: match.index || 0
            });
        }
        
        return headings.sort((a, b) => a.position - b.position);
    }

    /**
     * Find the most relevant heading for a chunk
     */
    private findRelevantHeading(
        chunk: DocumentChunk, 
        headings: Array<{level: number, text: string, position: number}>
    ): string | undefined {
        // Find the heading that appears before this chunk's position
        let relevantHeading: string | undefined;
        
        for (const heading of headings) {
            if (heading.position <= chunk.start_position) {
                relevantHeading = heading.text;
            } else {
                break;
            }
        }
        
        return relevantHeading;
    }

    /**
     * Extract section information from chunk content
     */
    private extractSection(content: string): string | undefined {
        // Look for markdown headers
        const headerMatch = content.match(/^(#{1,6})\s+(.+)$/m);
        if (headerMatch) {
            return headerMatch[2].trim();
        }
        
        // Look for HTML headers
        const htmlHeaderMatch = content.match(/<h[1-6].*?>(.*?)<\/h[1-6]>/i);
        if (htmlHeaderMatch) {
            return htmlHeaderMatch[1].replace(/<[^>]*>/g, '').trim();
        }
        
        return undefined;
    }
}
