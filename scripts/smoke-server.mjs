/**
 * Smoke test of the REAL server path (dist/server.js over stdio, MCP client).
 * Copies a data directory to a throw-away location (never touches the source), then checks that
 * a good query is reported "ok" with a similarity and an off-topic one "sin_resultados_fiables".
 *
 * Usage: npm run build && SMOKE_SOURCE_DATA=<dir with data/ of a knowledge base> \
 *        [MCP_EMBEDDING_MODEL=...] [SMOKE_GOOD_QUERY="..."] node scripts/smoke-server.mjs
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.SMOKE_SOURCE_DATA;
if (!source) { console.error('Set SMOKE_SOURCE_DATA to a directory containing data/'); process.exit(2); }
const tmpRoot = fs.existsSync('/tmp/opencode') ? '/tmp/opencode' : (process.env.TMPDIR || '/tmp');
const base = fs.mkdtempSync(path.join(tmpRoot, 'smoke-server-'));
fs.cpSync(path.join(source, 'data'), path.join(base, 'data'), { recursive: true });

const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, 'dist/server.js')],
    cwd: root,
    env: { ...process.env, MCP_BASE_DIR: base, START_WEB_UI: 'false', MCP_EMBEDDING_MODEL: process.env.MCP_EMBEDDING_MODEL || 'Xenova/paraphrase-multilingual-mpnet-base-v2' },
});
const client = new Client({ name: 'smoke-server', version: '1' });
await client.connect(transport);

const search = async (args) => JSON.parse((await client.callTool({ name: 'search_all_documents', arguments: args }, undefined, { timeout: 600000 })).content[0].text);
let failed = false;
const check = (ok, msg) => { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) failed = true; };

const good = await search({ query: process.env.SMOKE_GOOD_QUERY || 'cómo se hace un hotfix en front y qué merges necesita', limit: 3, max_chars: 100 });
check(good.status === 'ok', `good query -> status ${good.status}${good.message ? ' (' + good.message.slice(0, 80) + ')' : ''}`);
check(good.results?.length > 0 && good.results.every(r => r.snippet.length <= 101), 'good query returns bounded snippets');
check(good.results?.some(r => typeof r.similarity === 'number' && r.similarity > 0), 'good query reports a similarity > 0');
const off = await search({ query: 'receta de tarta de manzana con canela', limit: 3 });
check(off.status === 'sin_resultados_fiables', `off-topic query -> status ${off.status}`);

fs.rmSync(base, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
