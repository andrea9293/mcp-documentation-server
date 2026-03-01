import { SearchResult } from './types.js';
import { DocumentManager } from './document-manager.js';

/**
 * Deduplicated search result after parent-child grouping.
 */
export interface DeduplicatedSearchResult {
    document_id: string;
    parent_index: number;
    score: number;
    matched_content: string;
    parent_content: string;
    chunk_index: number;
    heading?: string;
}

/**
 * Parent-child deduplication: group children by parent, keep best score per parent.
 * Shared between MCP tools and Web UI API routes.
 */
export async function deduplicateSearchResults(
    results: SearchResult[],
    manager: DocumentManager
): Promise<DeduplicatedSearchResult[]> {
    const parentMap = new Map<string, DeduplicatedSearchResult>();

    for (const result of results) {
        const parentIdx = result.chunk.metadata?.parent_index ?? result.chunk.chunk_index;
        const key = `${result.chunk.document_id}_p${parentIdx}`;
        const existing = parentMap.get(key);

        if (!existing || result.score > existing.score) {
            // Lookup parent content from parents DB; falls back to child content for legacy docs
            let parentContent = await manager.getParentContent(result.chunk.document_id, parentIdx);
            if (!parentContent) {
                parentContent = result.chunk.content;
            }

            parentMap.set(key, {
                document_id: result.chunk.document_id,
                parent_index: parentIdx,
                score: result.score,
                matched_content: result.chunk.content,
                parent_content: parentContent,
                chunk_index: result.chunk.chunk_index,
                heading: result.chunk.metadata?.heading,
            });
        }
    }

    return Array.from(parentMap.values()).sort((a, b) => b.score - a.score);
}

/**
 * Format document list for API/MCP responses.
 */
export function formatDocumentList(documents: Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    metadata: Record<string, any>;
    content: string;
    chunks: Array<any>;
}>) {
    return documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        metadata: doc.metadata,
        content_preview: doc.content.substring(0, 700) + "...",
        chunks_count: doc.chunks.length,
    }));
}
