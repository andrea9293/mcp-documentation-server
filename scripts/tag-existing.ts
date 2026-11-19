/**
 * One-off helper: tag existing documents with the controlled vocabulary
 * (repo / type / topic / ticket) without changing ids.
 * Usage: MCP_BASE_DIR=<data copy> npx tsx scripts/tag-existing.ts [--dry]
 */
import { createLazyEmbeddingProvider } from '../src/embedding-provider.js';
import { titlePrefix } from '../src/metadata-utils.js';
import { DocumentManager } from '../src/document-manager.js';

const model = process.env.MCP_EMBEDDING_MODEL || 'Xenova/paraphrase-multilingual-mpnet-base-v2';
const dry = process.argv.includes('--dry');
const count = (text: string, re: RegExp) => (text.match(re) || []).length;

function classify(title: string, content: string, md: Record<string, any>) {
    const t = title.toLowerCase();
    const tags = new Set<string>();
    const ticket = /^(\d{4})\b/.exec(title)?.[1];

    // repo
    if (md.repo === 'global' || t.includes('· global ·')) tags.add('global');
    if (t.includes('· backend ·')) tags.add('backend');
    if (t.includes('front react')) tags.add('front-react');
    else if (t.includes('front legacy') || t.includes('· front ·')) tags.add('front');
    if (ticket === '2442') tags.add('front');

    // type
    if (/development plan/.test(t)) tags.add('plan');
    if (/story\d+/.test(t)) tags.add('ficha');
    if (/runbook/.test(t)) tags.add('runbook');
    if (/guia|readme|despliegue|integracion|convenciones|localinstall/.test(t)) tags.add('guía');
    if (/arquitectura/.test(t)) tags.add('arquitectura');

    // topic
    if (/flyway/.test(t) || count(content, /flyway/gi) >= 3) tags.add('flyway');
    if (/proceso de ramas/.test(t)) { tags.add('ramas'); tags.add('épicas'); }
    if (ticket) tags.add('hotfix');
    if (/localinstall|entorno ocr/.test(t)) tags.add('entorno-local');
    if (/ocr/.test(t) || count(content, /\bocr\b/gi) >= 5) tags.add('ocr');
    if (ticket === '2454' || ticket === '2447' || /comunicaciones/i.test(title) || count(content, /comunicaciones/gi) >= 5) tags.add('comunicaciones');
    if (count(content, /shadow[ -]?dom/gi) >= 2) tags.add('shadow-dom');

    return { tags: [...tags], ticket };
}

const manager = new DocumentManager(createLazyEmbeddingProvider(model));
for (const d of await manager.getAllDocuments()) {
    const { tags, ticket } = classify(d.title, d.content, d.metadata);
    const patch: Record<string, any> = { tags };
    if (ticket) patch.ticket = [ticket];
    const prefix = titlePrefix(d.title);
    if (prefix.length) patch.folder = prefix.map(p => p.toLowerCase()).join('/');
    console.log(`${d.id} | ${d.title} -> ${tags.join(', ')}${ticket ? ` [ticket ${ticket}]` : ''}`);
    if (!dry) await manager.updateDocumentMetadata(d.id, patch);
}
process.exit(0);
