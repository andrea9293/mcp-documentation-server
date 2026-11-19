/**
 * Document metadata helpers: tags / folder / ticket derivation and search filters.
 */

export interface SearchFilters {
    /** All listed tags must be present (case-insensitive). */
    tags?: string[];
    /** Folder prefix (case-insensitive), e.g. "finutive" matches "finutive/front". */
    folder?: string;
    /** Ticket id, matched against metadata.ticket or a tag. */
    ticket?: string;
    author?: string;
    contentType?: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function toList(v: unknown): string[] {
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
    return String(v).split(',').map(x => x.trim()).filter(Boolean);
}

/** Minimal YAML front matter parser (scalars, inline lists and "- item" lists). */
export function parseFrontMatter(content: string): { data: Record<string, any>; body: string } {
    const m = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) return { data: {}, body: content };
    const data: Record<string, any> = {};
    let listKey: string | null = null;
    for (const line of m[1].split(/\r?\n/)) {
        const item = line.match(/^\s*-\s+(.*)$/);
        if (item && listKey) {
            data[listKey].push(item[1].trim().replace(/^["']|["']$/g, ''));
            continue;
        }
        const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
        if (!kv) { listKey = null; continue; }
        const [, key, raw] = kv;
        const val = raw.trim();
        if (val === '') { data[key] = []; listKey = key; continue; }
        listKey = null;
        const inline = val.match(/^\[(.*)\]$/);
        data[key] = inline
            ? inline[1].split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
            : val.replace(/^["']|["']$/g, '');
    }
    return { data, body: content.slice(m[0].length) };
}

/** "Finutive · front · Proceso de ramas" -> prefix ["Finutive", "front"]. */
export function titlePrefix(title: string): string[] {
    const parts = title.split('·').map(p => p.trim()).filter(Boolean);
    return parts.length > 1 ? parts.slice(0, -1) : [];
}

/**
 * Resolve final content + metadata. Explicit metadata wins over front matter,
 * which wins over values derived from the title prefix.
 */
export function deriveDocument(title: string, content: string, metadata: Record<string, any> = {}) {
    const { data, body } = parseFrontMatter(content);
    const prefix = titlePrefix(title);
    const out: Record<string, any> = { ...metadata };

    const tags = toList(metadata.tags).length ? toList(metadata.tags)
        : toList(data.tags).length ? toList(data.tags)
        : prefix.map(p => p.toLowerCase());
    if (tags.length) out.tags = Array.from(new Set(tags.map(t => t.toLowerCase())));

    const folder = metadata.folder ?? data.folder ?? (prefix.length ? prefix.map(p => p.toLowerCase()).join('/') : undefined);
    if (folder) out.folder = String(folder);

    const ticket = toList(metadata.ticket).length ? toList(metadata.ticket) : toList(data.ticket);
    if (ticket.length) out.ticket = ticket;

    for (const k of ['version', 'date']) {
        if (out[k] === undefined && data[k] !== undefined) out[k] = data[k];
    }
    return { content: body, metadata: out };
}

export function hasFilters(f?: SearchFilters): boolean {
    return !!f && !!(f.tags?.length || f.folder || f.ticket || f.author || f.contentType);
}

export function matchesFilters(metadata: Record<string, any> | undefined, f?: SearchFilters): boolean {
    if (!hasFilters(f)) return true;
    const md = metadata || {};
    const tags = toList(md.tags).map(norm);
    if (f!.tags?.length && !f!.tags.every(t => tags.includes(norm(t)))) return false;
    if (f!.folder) {
        const folder = norm(String(md.folder ?? ''));
        const want = norm(f!.folder);
        if (!(folder === want || folder.startsWith(want + '/'))) return false;
    }
    if (f!.ticket) {
        const want = norm(f!.ticket).replace(/^#/, '');
        const tickets = [...toList(md.ticket), ...toList(md.tags)].map(t => norm(t).replace(/^#/, ''));
        if (!tickets.includes(want)) return false;
    }
    if (f!.author && norm(String(md.author ?? '')) !== norm(f!.author)) return false;
    if (f!.contentType && norm(String(md.contentType ?? '')) !== norm(f!.contentType)) return false;
    return true;
}

/** Normalize filters coming from MCP/HTTP input (accepts csv strings). */
export function parseFilters(input: any): SearchFilters | undefined {
    if (!input) return undefined;
    const f: SearchFilters = {};
    const tags = toList(input.tags);
    if (tags.length) f.tags = tags;
    if (input.folder) f.folder = String(input.folder);
    if (input.ticket) f.ticket = String(input.ticket);
    return hasFilters(f) ? f : undefined;
}
