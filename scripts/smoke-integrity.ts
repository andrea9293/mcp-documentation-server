/**
 * Smoke test: updates and reindexing must never lose documents when they fail midway.
 * Uses a stub embedding provider and a throw-away data dir (no model, no real data).
 * Usage: npx tsx scripts/smoke-integrity.ts
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const base = fs.mkdtempSync(path.join(fs.existsSync('/tmp/opencode') ? '/tmp/opencode' : os.tmpdir(), 'integrity-'));
process.env.MCP_BASE_DIR = base;
const { DocumentManager } = await import('../src/document-manager.js');

let failing = false;
const provider: any = {
    generateEmbedding: async (t: string) => {
        if (failing) throw new Error('embedding failure (simulated)');
        const v = new Array(8).fill(0); for (let i = 0; i < t.length; i++) v[i % 8] += t.charCodeAt(i) % 7; return v;
    },
    isAvailable: () => true, getModelName: () => 'stub', getDimensions: () => 8,
};
const check = (cond: boolean, msg: string) => { if (!cond) { console.log('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg); };
const open = () => new DocumentManager(provider);

const m = open();
const a = await m.addDocument('Doc · A', '# A\n\n## S1\n\ntexto uno\n\n## S2\n\ntexto dos');
const b = await m.addDocument('Doc · B', '# B\n\n## T1\n\notro texto');
check((await m.getDocumentIndex()).length === 2, 'two documents indexed');

failing = true;
await m.updateDocument(a.id, '# A\n\n## nuevo\n\ncontenido').then(() => check(false, 'update should fail'), () => check(true, 'update_document failure is reported'));
await m.updateDocumentMetadata(b.id, { tags: ['x'] }).then(() => check(false, 'metadata update should fail'), () => check(true, 'update_document_metadata failure is reported'));
failing = false;
check((await m.getDocumentIndex()).length === 2, 'failed updates keep both documents (memory)');
const re = open();
check((await re.getDocumentIndex()).length === 2, 'failed updates keep both documents (disk)');
check((await re.getDocument(a.id))!.chunks.length > 0, 'failed update keeps chunks of the old version');

// interrupted reindex: force it, make embeddings fail on the 2nd document
fs.writeFileSync(path.join(base, 'data', 'index-version.json'), JSON.stringify({ tokenizer: 'old' }));
let calls = 0; const orig = provider.generateEmbedding;
provider.generateEmbedding = async (t: string) => { if (++calls > 1) throw new Error('crash mid-reindex (simulated)'); return orig(t); };
const crashed = open();
await crashed.getDocumentIndex().then(() => check(false, 'reindex should fail'), () => check(true, 'interrupted reindex is reported'));
provider.generateEmbedding = orig;
const after = open();
const idx = await after.getDocumentIndex(); // reindexes again, completely
check(idx.length === 2, 'documents survive an interrupted reindex');
check((await after.getDocument(b.id))!.chunks.length > 0, 'chunks present after the retried reindex');
check(JSON.parse(fs.readFileSync(path.join(base, 'data', 'index-version.json'), 'utf8')).tokenizer !== 'old', 'index version updated only after a complete reindex');

// successful updates keep the id and the count
const u = await after.updateDocument(a.id, '# A\n\n## nuevo\n\ncontenido nuevo');
check(u?.id === a.id && (await after.getDocumentIndex()).length === 2, 'successful update keeps id and count');
fs.rmSync(base, { recursive: true, force: true });
process.exit(process.exitCode ?? 0);
