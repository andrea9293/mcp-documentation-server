## Copilot instructions for contributors and AI coding agents

Short goal: make focused, safe changes that respect the project's local-first, file-backed architecture and feature flags.

What this project is (big picture)
- TypeScript MCP server that exposes tools for document ingestion, semantic search, and optional AI analysis (Gemini).
- Data is stored on disk under the default directory (~/.mcp-documentation-server) as JSON documents plus optional original file backups (see `src/document-manager.ts`).

Key components and where to look
- Server entrypoint: `src/server.ts` — registers MCP tools, uses Zod schemas for parameters, and boots via FastMCP.
- Document handling: `src/document-manager.ts` — chunking, embedding generation, uploads processing, file copy/backup, and deletion logic.
- Embeddings: `src/embedding-provider.ts` and `src/embeddings/embedding-cache.ts` — transformers-based provider with a SimpleEmbeddingProvider fallback; caching is optional.
- Indexing: `src/indexing/document-index.ts` — optional O(1) index used when MCP_INDEXING_ENABLED is true.
- Chunking: `src/intelligent-chunker.ts` — controls chunk sizes, overlap, adaptive sizing (used by DocumentManager.createChunks).
- Utilities & types: `src/utils.ts`, `src/types.ts` — canonical types and helpers. Use them for consistency.

Important conventions and patterns
- Local-first, file-backed data: prefer read/write to the data directory via `DocumentManager` methods rather than ad-hoc file writes. The DocumentIndex must be updated when documents change.
- Feature flags via environment variables: many behaviors toggle with env vars (MCP_INDEXING_ENABLED, MCP_PARALLEL_ENABLED, MCP_STREAMING_ENABLED, MCP_CACHE_SIZE, GEMINI_API_KEY). See `src/document-manager.ts` and `src/embedding-provider.ts` for exact names and fallbacks.
- Embedding models: default is `Xenova/all-MiniLM-L6-v2`. Changing the model requires re-adding documents (embeddings are model-specific). See `src/embedding-provider.ts` for model selection and timeouts.
- Large files: streaming path exists. Use `MCP_STREAMING_ENABLED` and `MCP_STREAM_FILE_SIZE_LIMIT` to control behavior. `DocumentManager.processUploadsFolder` handles copying originals to the data dir.
- Error handling: prefer bubbling an Error with a clear message (server tools wrap errors and return informative strings). Tools use Zod schemas for inputs — keep them intact when modifying server tool definitions in `src/server.ts`.

Developer workflows & commands (how to run and test)
- Run in development: `npm run dev` (uses `fastmcp dev src/server.ts`).
- Run directly without fastmcp: `npm run dev:direct` (npx tsx src/server.ts).
- Build: `npm run build` (tsc + permission fix via shx) and run packaged `dist` with `npm run dev:build`.
- Inspect tools: `npm run inspect` (uses fastmcp inspect). These scripts are in `package.json`.

Safe change checklist for PRs
1. Update types in `src/types.ts` when adding or changing tool parameters or Document shape.
2. Prefer to add helper functions in `src/utils.ts` rather than inline implementations.
3. Keep file-backed invariants: when creating/deleting documents, ensure `DocumentIndex` (if enabled) is updated and any backup originals in data/ are created/removed via `DocumentManager`.
4. Respect env toggles—don’t hard-code behavior that bypasses `process.env` flags.
5. If you touch embeddings, consider performance/timeouts: loading models can be slow (see initialization timeouts in `src/embedding-provider.ts`). Add pre-initialization only when needed.

Examples to copy/paste when interacting programmatically
- Search a document (tool): `search_documents` — parameters: `{ document_id: string, query: string, limit?: number }` (registered in `src/server.ts`).
- Process uploads: use `process_uploads` tool or put `.txt/.md/.pdf` files into the uploads dir (get path with `get_uploads_path`).

Notes for AI agents editing code
- Keep changes minimal and localized: prefer adding small, well-tested functions over sweeping refactors.
- When adding new public tools in `src/server.ts`, use Zod for params and update README examples.
- Mention the relevant env var in code comments when you rely on one.
- If you change persisted shapes (Document JSON), add a migration note in README and ensure backward compatibility in `DocumentManager.getDocument`.

Files to reference when editing or debugging
- `src/server.ts`, `src/document-manager.ts`, `src/embedding-provider.ts`, `src/indexing/document-index.ts`, `src/intelligent-chunker.ts`, `src/utils.ts`, `src/types.ts`.

If anything is unclear or you need operational details (CI, release, or platform-specific testing), ask the maintainer. After editing, run `npm run build` and basic manual smoke tests (start server and call a couple of tools) before opening a PR.

— End of Copilot instructions —
