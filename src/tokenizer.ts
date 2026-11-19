/**
 * Spanish-aware Orama tokenizer for chunk full-text search.
 *  - folds accents (and ñ -> n) and lowercases
 *  - light Spanish stemming (plurals, -mente) and stopword removal
 *  - keeps exact identifiers as single tokens: ticket ids, Flyway versions
 *    (V2026.11.19.1__x -> v2026_11_19_1__x), kebab/snake names, CamelCase classes
 *    (the whole identifier AND its parts are indexed)
 * The same tokenizer runs at index and query time, so matching stays symmetric.
 */
export const TOKENIZER_VERSION = 'es-fold-ids-sections-v2';

const STOPWORDS = new Set((
    'a al algo ante con como cual cuando de del desde donde el ella ellos en entre era es esta este esto ' +
    'fue ha han hay la las le les lo los mas me mi muy no nos o para pero por que se sin sobre su sus ' +
    'si son su un una uno unos unas y ya the of and to is in for on'
).split(' '));

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function stem(word: string): string {
    if (!/^[a-z]+$/.test(word) || word.length <= 4) return word;
    let w = word;
    if (w.endsWith('mente') && w.length > 7) w = w.slice(0, -5);
    else if (w.endsWith('ciones')) w = w.slice(0, -2);      // soluciones -> solucion
    else if (w.endsWith('es') && w.length > 5) w = w.slice(0, -2);
    else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    return w;
}

function pushWord(out: string[], word: string) {
    if (!word || STOPWORDS.has(word)) return;
    out.push(stem(word));
}

export function tokenizeText(input: string): string[] {
    const out: string[] = [];
    const folded = fold(input);
    for (const raw of folded.split(/[^A-Za-z0-9._\-\/]+/)) {
        if (!raw) continue;
        // peel punctuation at the edges ("flyway." / "(x)")
        const tok = raw.replace(/^[._\-\/]+|[._\-\/]+$/g, '');
        if (!tok) continue;
        const lower = tok.toLowerCase();
        const parts = lower.split(/[._\-\/]+/).filter(Boolean);
        if (parts.length > 1) {
            // identifier / version / compound: whole token (dots, hyphens, slashes -> "_")
            out.push(lower.replace(/[._\-\/]+/g, '_'));
        }
        for (const p of parts) pushWord(out, p);
        // CamelCase: index the parts too (the whole word is already a token)
        if (/[a-z][A-Z]/.test(tok)) {
            for (const piece of tok.split(/(?<=[a-z0-9])(?=[A-Z])/)) pushWord(out, piece.toLowerCase());
        }
    }
    return Array.from(new Set(out));
}

/** Orama tokenizer component (language stays 'english' only as an Orama label). */
export function createSpanishTokenizer(): any {
    const tokenizer: any = {
        language: 'english',
        normalizationCache: new Map<string, string>(),
        stemmerSkipProperties: new Set<string>(),
        tokenizeSkipProperties: new Set<string>(),
        allowDuplicates: false,
        normalizeToken(_prop: string, token: string) { return fold(token.toLowerCase()); },
        tokenize(input: unknown, _language?: string, prop?: string): string[] {
            if (typeof input !== 'string') return [input as any];
            if (prop === 'document_id') return [input.toLowerCase()];
            return tokenizeText(input);
        },
    };
    return tokenizer;
}
