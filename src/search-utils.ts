import { SearchResult } from './types.js';
import { DocumentManager } from './document-manager.js';

/**
 * Deduplicated search result after parent-child grouping.
 * Only parent content is exposed; children are used internally for search only.
 */
export interface DeduplicatedSearchResult {
    document_id: string;
    parent_index: number;
    score: number;
    /** Best cosine similarity among the matching children. */
    similarity?: number;
    content: string;
    heading?: string;
    heading_path?: string;
    /** Best matching child fragment (short, precise). */
    snippet?: string;
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

        if (existing && (result.similarity ?? 0) > (existing.similarity ?? 0)) existing.similarity = result.similarity;
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
                similarity: Math.max(result.similarity ?? 0, existing?.similarity ?? 0) || undefined,
                content: parentContent,
                heading: result.chunk.metadata?.heading,
                heading_path: result.chunk.metadata?.heading_path,
                snippet: result.chunk.content,
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

/**
 * Below this best cosine similarity the answer is flagged as unreliable.
 * Calibrated on the eval set: off-topic queries peak at <=0.20, real ones at >=0.22 (most >0.45).
 */
export function minReliableSimilarity(): number {
    const v = parseFloat(process.env.MCP_MIN_SIMILARITY || '');
    return Number.isFinite(v) ? v : 0.3;
}

function clip(text: string, maxChars: number): { text: string; truncated: boolean } {
    if (text.length <= maxChars) return { text, truncated: false };
    return { text: text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…', truncated: true };
}

/**
 * Agent-oriented search response: document title, heading path, tags, date/version,
 * bounded snippet (max_chars), at most `maxPerDocument` sections per document and an
 * explicit low-reliability signal.
 */
export async function formatAgentSearchResponse(
    results: DeduplicatedSearchResult[],
    manager: DocumentManager,
    opts: { maxChars?: number; maxPerDocument?: number; limit?: number } = {}
) {
    const maxChars = opts.maxChars ?? 1200;
    const maxPerDocument = opts.maxPerDocument ?? 2;
    const index = new Map((await manager.getDocumentIndex()).map(d => [d.id, d]));

    const perDoc = new Map<string, number>();
    const kept: DeduplicatedSearchResult[] = [];
    for (const r of results) {
        const n = perDoc.get(r.document_id) ?? 0;
        if (n >= maxPerDocument) continue;
        perDoc.set(r.document_id, n + 1);
        kept.push(r);
        if (opts.limit && kept.length >= opts.limit) break;
    }

    // Reliability is judged on the whole candidate pool, not only on the few results shown:
    // hybrid ranking can put text-only matches first while a strong semantic match sits lower.
    const topSim = Math.max(0, ...results.map(r => r.similarity ?? 0));
    // Similarity unavailable for every candidate = unknown, not "unreliable"
    const known = results.some(r => r.similarity !== undefined);
    const reliable = kept.length > 0 && (!known || topSim >= minReliableSimilarity());
    return {
        status: reliable ? 'ok' : 'sin_resultados_fiables',
        ...(reliable ? {} : {
            message: `Sin resultados fiables: la mejor similitud semántica (${topSim.toFixed(2)}) está por debajo de ${minReliableSimilarity()}. No des estos fragmentos por respuesta; reformula la consulta, usa filtros tags/folder/ticket o consulta list_documents.`,
        }),
        hint_for_llm: "Cada resultado trae un fragmento acotado. Usa get_context_window con document_id y parent_index para ampliar la sección.",
        results: kept.map(r => {
            const d = index.get(r.document_id);
            const snip = clip(r.snippet ?? r.content, maxChars);
            return {
                document_id: r.document_id,
                title: d?.title,
                heading_path: r.heading_path ?? r.heading ?? '',
                tags: d?.metadata?.tags ?? [],
                date: d?.updated_at,
                version: d?.metadata?.version,
                score: Number(r.score.toFixed(3)),
                similarity: r.similarity !== undefined ? Number(r.similarity.toFixed(3)) : undefined,
                parent_index: r.parent_index,
                snippet: snip.text,
                snippet_truncated: snip.truncated,
            };
        }),
    };
}
