/**
 * Search-quality evaluation harness.
 * Runs every question in eval/questions.json against the current global search
 * (DocumentManager.searchAllDocuments + deduplicateSearchResults, limit 10)
 * and reports accuracy@1 / @3 for document and document+section.
 *

 * Default model matches the real install (multilingual mpnet, 768 dims).
 * Usage: MCP_BASE_DIR=/tmp/opencode/search-quality npm run eval -- --label baseline
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createLazyEmbeddingProvider } from '../src/embedding-provider.js';
import { DocumentManager } from '../src/document-manager.js';
import { deduplicateSearchResults } from '../src/search-utils.js';

interface Question { id: string; query: string; docTitle: string; section: string }

const here = path.dirname(fileURLToPath(import.meta.url));
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.md$/, '').trim();

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
    const label = arg('label', 'run');
    const limit = parseInt(arg('limit', '10'), 10);
    if (!process.env.MCP_BASE_DIR) throw new Error('MCP_BASE_DIR must point to the evaluation data copy');
    const questions: Question[] = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'));

    const model = process.env.MCP_EMBEDDING_MODEL || 'Xenova/paraphrase-multilingual-mpnet-base-v2';
    const manager = new DocumentManager(createLazyEmbeddingProvider(model));
    const titles = new Map((await manager.getAllDocuments()).map(d => [d.id, d.title]));

    const rows: any[] = [];
    for (const q of questions) {
        const hits = await deduplicateSearchResults(await manager.searchAllDocuments(q.query, limit), manager);
        const ranked = hits.map(h => ({
            title: titles.get(h.document_id) ?? h.document_id,
            heading: h.heading ?? '',
            path: h.heading_path ?? h.heading ?? '',
            score: h.score,
        }));
        const docOk = (h: { title: string }) => norm(h.title) === norm(q.docTitle);
        const secOk = (h: { title: string; heading: string }) => docOk(h) && norm(h.heading).includes(norm(q.section));
        const pathOk = (h: { title: string; path: string }) => docOk(h) && norm(h.path).includes(norm(q.section));
        const first = (f: (h: any) => boolean) => ranked.findIndex(f) + 1; // 0 = not found
        const dRank = first(docOk), sRank = first(secOk), pRank = first(pathOk);
        rows.push({
            id: q.id, query: q.query, expectedDoc: q.docTitle, expectedSection: q.section,
            docRank: dRank || null, docSectionRank: sRank || null, pathRank: pRank || null,
            doc1: dRank === 1, doc3: dRank >= 1 && dRank <= 3,
            sec1: sRank === 1, path1: pRank === 1, path3: pRank >= 1 && pRank <= 3, sec3: sRank >= 1 && sRank <= 3,
            top3: ranked.slice(0, 3),
        });
    }

    const n = rows.length;
    const sum = (k: string) => rows.filter(r => r[k]).length;
    const totals = { questions: n, doc_at_1: sum('doc1') / n, doc_at_3: sum('doc3') / n, docsection_at_1: sum('sec1') / n, docsection_at_3: sum('sec3') / n, docpath_at_1: sum('path1') / n, docpath_at_3: sum('path3') / n };

    console.log('\nID   doc@1 doc@3 sec@1 sec@3  rank(doc/sec)  query');
    const mark = (b: boolean) => (b ? ' ✔  ' : ' ✘  ');
    for (const r of rows) {
        console.log(`${r.id}  ${mark(r.doc1)} ${mark(r.doc3)} ${mark(r.sec1)} ${mark(r.sec3)}   ${String(r.docRank ?? '-').padStart(3)}/${String(r.docSectionRank ?? '-').padEnd(3)}   ${r.query.slice(0, 70)}`);
    }
    const pct = (x: number) => (x * 100).toFixed(1) + '%';
    console.log(`\nTotals (${n} questions): doc@1 ${pct(totals.doc_at_1)} | doc@3 ${pct(totals.doc_at_3)} | doc+section@1 ${pct(totals.docsection_at_1)} | doc+section@3 ${pct(totals.docsection_at_3)} | doc+path@1 ${pct(totals.docpath_at_1)} | doc+path@3 ${pct(totals.docpath_at_3)}`);

    const outDir = path.join(here, 'results');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${label}.json`);
    fs.writeFileSync(outFile, JSON.stringify({ label, model, limit, totals, rows }, null, 2));
    console.log(`Saved ${outFile}`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
