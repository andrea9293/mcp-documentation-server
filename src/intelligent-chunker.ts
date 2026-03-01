import { EmbeddingProvider, DocumentChunk, ParentChunkData, ChunkingResult } from './types.js';

/**
 * Options for parent-child chunking.
 * Parent chunks are large context-preserving segments (not embedded directly).
 * Child chunks are small precise segments used for vector search (embedded).
 */
export interface ParentChildChunkOptions {
    /** Max size of parent chunks in characters */
    parentMaxSize?: number;
    /** Max size of child chunks in characters */
    childMaxSize?: number;
    /** Overlap between consecutive child chunks within the same parent */
    childOverlap?: number;
    /** Overlap between consecutive parent chunks */
    parentOverlap?: number;
}

export enum ContentType {
    CODE = 'code',
    MARKDOWN = 'markdown',
    HTML = 'html',
    TEXT = 'text',
    PDF = 'pdf',
    MIXED = 'mixed'
}

interface ParentChunk {
    index: number;
    content: string;
    startPosition: number;
    endPosition: number;
    heading?: string;
    contentType: ContentType;
}

type ResolvedOptions = Required<ParentChildChunkOptions>;

/**
 * IntelligentChunker implements the Parent-Child Chunking pattern for RAG.
 *
 * Pattern (from "Parent-Child Chunking in LangChain for Advanced RAG"):
 * 1. The document is split into large "parent" chunks that preserve full context
 *    (entire sections, multiple paragraphs, or conceptually complete units).
 * 2. Each parent is further split into small "child" chunks for precise matching.
 * 3. Only child chunks are embedded and indexed for vector search.
 * 4. Each child stores its parent's content in metadata.
 * 5. At search time, child chunks enable precise query matching, but the
 *    corresponding parent chunk is returned for richer context.
 *
 * Benefits:
 * - Better context preservation (parent chunks maintain the broader narrative)
 * - Higher search precision (child chunks match specific queries accurately)
 * - Adaptive granularity (complex queries get full context, simple ones get focused answers)
 */
export class IntelligentChunker {
    private embeddingProvider: EmbeddingProvider;

    constructor(embeddingProvider: EmbeddingProvider) {
        this.embeddingProvider = embeddingProvider;
    }

    /**
     * Main entry point: creates parent-child chunks from document content.
     * Returns a ChunkingResult with:
     *  - children: small chunks with embeddings (indexed for vector search)
     *  - parents: large context chunks (stored separately, referenced by index)
     */
    async createChunks(
        documentId: string,
        content: string,
        options: ParentChildChunkOptions = {}
    ): Promise<ChunkingResult> {
        const contentType = this.detectContentType(content);
        const opts = this.resolveOptions(contentType, options);

        console.error(
            `[IntelligentChunker] Parent-child chunking: type=${contentType}, ` +
            `len=${content.length}, parentMax=${opts.parentMaxSize}, childMax=${opts.childMaxSize}`
        );

        // Step 1: Split document into large parent chunks
        const internalParents = this.createParentChunks(content, contentType, opts);

        // Step 2: Build ParentChunkData array for separate storage
        const parentData: ParentChunkData[] = internalParents.map(p => ({
            index: p.index,
            content: p.content.trim(),
            startPosition: p.startPosition,
            endPosition: p.endPosition,
            heading: p.heading,
            contentType: p.contentType,
        }));

        // Step 3: For each parent, split into small children and generate embeddings
        // Children only store a lightweight reference (parent_index) to their parent.
        const allChildren: DocumentChunk[] = [];
        let globalChildIndex = 0;

        for (const parent of internalParents) {
            const childTexts = this.createChildTexts(parent.content, contentType, opts);

            let searchFrom = 0;
            for (const childText of childTexts) {
                const trimmed = childText.trim();
                if (!trimmed) continue;

                // Track child position within parent content
                const posInParent = parent.content.indexOf(trimmed, searchFrom);
                const globalStart = parent.startPosition + Math.max(0, posInParent);
                const globalEnd = globalStart + trimmed.length;
                if (posInParent >= 0) searchFrom = posInParent + 1;

                const embeddings = await this.embeddingProvider.generateEmbedding(trimmed);

                allChildren.push({
                    id: `${documentId}_chunk_${globalChildIndex}`,
                    document_id: documentId,
                    chunk_index: globalChildIndex,
                    content: trimmed,
                    embeddings,
                    start_position: globalStart,
                    end_position: globalEnd,
                    metadata: {
                        type: parent.contentType,
                        parent_index: parent.index,
                        heading: parent.heading,
                    }
                });
                globalChildIndex++;
            }
        }

        console.error(
            `[IntelligentChunker] Created ${parentData.length} parents → ${allChildren.length} children`
        );
        return { children: allChildren, parents: parentData };
    }

    // ─── Parent Chunk Creation ────────────────────────────────────────────

    /**
     * Split the full document into large parent chunks that preserve context.
     * Uses high-level structural separators (headings, sections, function/class defs).
     */
    private createParentChunks(
        content: string,
        contentType: ContentType,
        opts: ResolvedOptions
    ): ParentChunk[] {
        const separators = this.getParentSeparators(contentType);
        const rawTexts = this.splitWithSeparators(content, separators, opts.parentMaxSize);
        const headings = this.extractHeadings(content);

        const parents: ParentChunk[] = [];
        let searchPos = 0;

        for (let i = 0; i < rawTexts.length; i++) {
            const text = rawTexts[i];
            if (!text.trim()) continue;

            // Locate this segment in the original content
            const matchSnippet = text.substring(0, Math.min(80, text.length));
            let startPos = content.indexOf(matchSnippet, searchPos);
            if (startPos === -1) startPos = searchPos;
            const endPos = startPos + text.length;

            const heading = this.findHeadingForPosition(headings, startPos);

            // Add overlap from preceding text for context continuity
            let parentContent = text;
            let actualStart = startPos;
            if (i > 0 && opts.parentOverlap > 0) {
                const overlapStart = Math.max(0, startPos - opts.parentOverlap);
                parentContent = content.substring(overlapStart, startPos) + parentContent;
                actualStart = overlapStart;
            }

            parents.push({
                index: i,
                content: parentContent,
                startPosition: actualStart,
                endPosition: endPos,
                heading,
                contentType,
            });

            searchPos = endPos;
        }

        return parents;
    }

    // ─── Child Chunk Creation ─────────────────────────────────────────────

    /**
     * Split a parent chunk into small child texts for precise search matching.
     * Uses lower-level separators (paragraphs, lines, sentences).
     */
    private createChildTexts(
        parentContent: string,
        contentType: ContentType,
        opts: ResolvedOptions
    ): string[] {
        const separators = this.getChildSeparators(contentType);
        const rawChildren = this.splitWithSeparators(parentContent, separators, opts.childMaxSize);

        if (rawChildren.length <= 1 || opts.childOverlap <= 0) return rawChildren;

        // Add overlap between consecutive children for continuity
        const withOverlap: string[] = [rawChildren[0]];
        for (let i = 1; i < rawChildren.length; i++) {
            const prev = rawChildren[i - 1];
            const overlapText = prev.slice(Math.max(0, prev.length - opts.childOverlap));
            withOverlap.push(overlapText + ' ' + rawChildren[i]);
        }

        return withOverlap;
    }

    // ─── Separator Hierarchies ────────────────────────────────────────────

    /**
     * Separators for splitting into large parent chunks.
     * High-level structural boundaries (headings, function/class definitions).
     */
    private getParentSeparators(contentType: ContentType): string[] {
        switch (contentType) {
            case ContentType.MARKDOWN:
                return ['\n## ', '\n### ', '\n#### ', '\n\n\n', '\n\n'];
            case ContentType.CODE:
                return [
                    '\nexport class ', '\nexport function ', '\nexport async function ',
                    '\nexport default ', '\nexport const ',
                    '\nclass ', '\nfunction ', '\nasync function ',
                    '\ndef ', '\nclass ',
                    '\n\n\n', '\n\n',
                ];
            case ContentType.HTML:
                return ['</section>', '</article>', '</div>', '\n\n\n', '\n\n'];
            case ContentType.MIXED:
                return ['\n## ', '\n### ', '\n```', '\n\n\n', '\n\n'];
            default: // TEXT, PDF
                return ['\n\n\n', '\n\n'];
        }
    }

    /**
     * Separators for splitting parents into small child chunks.
     * Lower-level boundaries (paragraphs, lines, sentences).
     */
    private getChildSeparators(contentType: ContentType): string[] {
        switch (contentType) {
            case ContentType.MARKDOWN:
                return ['\n\n', '\n', '. ', ' '];
            case ContentType.CODE:
                return ['\n\n', '\n', ' '];
            case ContentType.HTML:
                return ['</p>', '</li>', '\n\n', '\n', '. ', ' '];
            default: // TEXT, PDF, MIXED
                return ['\n\n', '\n', '. ', ' '];
        }
    }

    // ─── Recursive Splitting ──────────────────────────────────────────────

    /**
     * Recursively split text using a hierarchy of separators.
     * Tries the first separator; if any resulting segment is still too large,
     * recurses with the remaining separators.
     */
    private splitWithSeparators(text: string, separators: string[], maxSize: number): string[] {
        if (text.length <= maxSize) return [text];

        if (separators.length === 0) {
            // Hard split at maxSize as last resort
            const chunks: string[] = [];
            for (let i = 0; i < text.length; i += maxSize) {
                chunks.push(text.substring(i, i + maxSize));
            }
            return chunks;
        }

        const separator = separators[0];
        const remaining = separators.slice(1);
        const parts = text.split(separator);
        const result: string[] = [];
        let current = '';

        for (const part of parts) {
            const candidate = current
                ? current + separator + part
                : part;

            if (candidate.length <= maxSize) {
                current = candidate;
            } else {
                if (current) {
                    if (current.length > maxSize) {
                        result.push(...this.splitWithSeparators(current, remaining, maxSize));
                    } else {
                        result.push(current);
                    }
                }
                if (part.length > maxSize) {
                    result.push(...this.splitWithSeparators(part, remaining, maxSize));
                    current = '';
                } else {
                    current = part;
                }
            }
        }

        if (current) {
            if (current.length > maxSize) {
                result.push(...this.splitWithSeparators(current, remaining, maxSize));
            } else {
                result.push(current);
            }
        }

        return result.filter(s => s.trim().length > 0);
    }

    // ─── Content Type Detection ───────────────────────────────────────────

    /**
     * Detect content type to choose optimal separator hierarchies and sizes.
     */
    detectContentType(content: string): ContentType {
        const codePatterns = [
            /^import\s+/m, /^from\s+\w+\s+import/m,
            /^\s*def\s+\w+/m, /^\s*function\s+\w+/m,
            /^\s*class\s+\w+/m, /^\s*public\s+class/m,
            /^\s*interface\s+\w+/m, /^\s*export\s+(class|function|interface)/m,
            /^\s*if\s*\(/m, /^\s*for\s*\(/m, /^\s*while\s*\(/m,
        ];
        const markdownPatterns = [
            /^#{1,6}\s+/m, /^\*\s+/m, /^\d+\.\s+/m,
            /\[.*\]\(.*\)/, /```[\s\S]*?```/, /^\|.*\|.*\|/m, /^>\s+/m,
        ];
        const htmlPatterns = [
            /<html/i, /<body/i, /<div/i, /<p>/i,
            /<h[1-6]>/i, /<script/i, /<style/i,
        ];

        const codeScore = codePatterns.reduce((s, p) => s + (p.test(content) ? 1 : 0), 0);
        const mdScore = markdownPatterns.reduce((s, p) => s + (p.test(content) ? 1 : 0), 0);
        const htmlScore = htmlPatterns.reduce((s, p) => s + (p.test(content) ? 1 : 0), 0);

        // Mixed content has signals from multiple types
        if ((codeScore > 0 && mdScore > 0) || (codeScore > 0 && htmlScore > 0) ||
            (mdScore > 0 && htmlScore > 0)) {
            return ContentType.MIXED;
        }
        if (htmlScore >= 2) return ContentType.HTML;
        if (mdScore >= 2) return ContentType.MARKDOWN;
        if (codeScore >= 2) return ContentType.CODE;

        return ContentType.TEXT;
    }

    // ─── Options Resolution ───────────────────────────────────────────────

    /**
     * Resolve optimal parent/child chunk sizes based on content type.
     * User-provided options override defaults.
     */
    private resolveOptions(contentType: ContentType, userOpts: ParentChildChunkOptions): ResolvedOptions {
        const defaults: Record<ContentType, ResolvedOptions> = {
            [ContentType.TEXT]: {
                parentMaxSize: 5800,
                childMaxSize: 1000,
                childOverlap: 50,
                parentOverlap: 0,
            },
            [ContentType.MARKDOWN]: {
                parentMaxSize: 7800,
                childMaxSize: 1400,
                childOverlap: 60,
                parentOverlap: 0,
            },
            [ContentType.CODE]: {
                parentMaxSize: 3000,
                childMaxSize: 600,
                childOverlap: 40,
                parentOverlap: 0,
            },
            [ContentType.HTML]: {
                parentMaxSize: 5800,
                childMaxSize: 1000,
                childOverlap: 50,
                parentOverlap: 0,
            },
            [ContentType.PDF]: {
                parentMaxSize: 5800,
                childMaxSize: 1200,
                childOverlap: 60,
                parentOverlap: 0,
            },
            [ContentType.MIXED]: {
                parentMaxSize: 4600,
                childMaxSize: 1000,
                childOverlap: 50,
                parentOverlap: 0,
            },
        };

        return { ...defaults[contentType], ...userOpts } as ResolvedOptions;
    }

    // ─── Heading Utilities ────────────────────────────────────────────────

    /**
     * Extract all headings (markdown + HTML) with their positions.
     */
    private extractHeadings(content: string): Array<{ text: string; position: number }> {
        const headings: Array<{ text: string; position: number }> = [];

        for (const match of content.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
            headings.push({ text: match[2].trim(), position: match.index || 0 });
        }
        for (const match of content.matchAll(/<h([1-6]).*?>(.*?)<\/h[1-6]>/gi)) {
            headings.push({
                text: match[2].replace(/<[^>]*>/g, '').trim(),
                position: match.index || 0,
            });
        }

        return headings.sort((a, b) => a.position - b.position);
    }

    /**
     * Find the most recent heading that appears before a given position.
     */
    private findHeadingForPosition(
        headings: Array<{ text: string; position: number }>,
        position: number
    ): string | undefined {
        let heading: string | undefined;
        for (const h of headings) {
            if (h.position <= position) heading = h.text;
            else break;
        }
        return heading;
    }
}
