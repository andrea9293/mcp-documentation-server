# [1.12.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.11.2...v1.12.0) (2025-12-02)


### Features

* add configurable base directory via MCP_BASE_DIR env var ([eaa5cf8](https://github.com/andrea9293/mcp-documentation-server/commit/eaa5cf84b8937793500daec46dde27dfdab92eda))

## [1.11.2](https://github.com/andrea9293/mcp-documentation-server/compare/v1.11.1...v1.11.2) (2025-12-02)


### Bug Fixes

* upgrade fastmcp to v3.24.0 ([f4e14ba](https://github.com/andrea9293/mcp-documentation-server/commit/f4e14babdad2a5bb3d44e9eaefb21e419c7b3aa9))

## [1.11.1](https://github.com/andrea9293/mcp-documentation-server/compare/v1.11.0...v1.11.1) (2025-09-13)


### Bug Fixes

* **document-manager:** fix method add_document for creating document with md extension method documentation ([e704267](https://github.com/andrea9293/mcp-documentation-server/commit/e704267536f126aa6d209bac90271a1d14ad5dba))
* **server:** add_document metadata parameters description adjusted ([52e19e4](https://github.com/andrea9293/mcp-documentation-server/commit/52e19e4930621c3f2e75407ced23f9e1b5757de8))

# [1.11.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.10.1...v1.11.0) (2025-09-11)


### Features

* **AI-Powered Document Intelligence**: Add Google Gemini AI integration for advanced document analysis
  - New `search_documents_with_ai` tool for natural language queries and intelligent summaries
  - Smart file mapping prevents re-uploading the same files to Gemini
  - Requires `GEMINI_API_KEY` environment variable (optional feature)

* **Intelligent File Management**: Enhanced file handling with copy-based storage
  - Files are now copied to data directory instead of moved, preserving originals in uploads
  - Complete deletion removes both JSON files and associated original files
  - Improved data safety and backup preservation

#### ⚠️ Important Notes

* **AI Compatibility**: Gemini AI analysis works only on documents imported with this version or later
* **File Preservation**: This version copies files from upload folder, ensuring originals remain available for AI analysis.
* **Migration**: Existing documents without original files in uploads folder cannot use AI features. If you want to use AI features on existing documents, you can re-upload them or copy in data folder renaming with the same name of the respective JSON with embeddings.
* **Optional Feature**: AI functionality requires `GEMINI_API_KEY` and doesn't affect core operations


* add file backup functionality during document upload ([db31495](https://github.com/andrea9293/mcp-documentation-server/commit/db31495312f82edb2ee01c89ac7e14938df1a7a4))
* enhance document deletion to remove associated files and improve error handling ([b2fd308](https://github.com/andrea9293/mcp-documentation-server/commit/b2fd3086f3b1db2652adf03fd5d874ee63736bcc))
* integrate Gemini AI for advanced document search ([34e0960](https://github.com/andrea9293/mcp-documentation-server/commit/34e09600e46eb2061ef69b952bc821ef004b7a9b))

## [1.10.1](https://github.com/andrea9293/mcp-documentation-server/compare/v1.10.0...v1.10.1) (2025-09-05)


### Bug Fixes

* **indexing:** avoid fs-extra ESM/CJS interop causing fs.readdir error ([ccd92e1](https://github.com/andrea9293/mcp-documentation-server/commit/ccd92e164b63f6b116a20c5ddd8327844855511f)), closes [#8](https://github.com/andrea9293/mcp-documentation-server/issues/8)

# [1.10.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.9.0...v1.10.0) (2025-08-25)


### Features

* add readme to reflect the status of the server ([2f01eba](https://github.com/andrea9293/mcp-documentation-server/commit/2f01eba015546a55bcf8968a8a9bb694982fb2d8))

# [1.9.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.8.0...v1.9.0) (2025-08-25)


### Features

* Phase 1 (scalability) - O(1) DocumentIndex, LRU embedding cache, parallel chunking & streaming, closes [#7](https://github.com/andrea9293/mcp-documentation-server/issues/7)

**Implement Phase 1 scalability improvements:**
- Adds `DocumentIndex` (O(1) lookup, deduplication, keyword index, persistence).
- Adds `EmbeddingCache` (LRU) to avoid recomputing embeddings.
- Updates chunker to support parallel chunking and batch processing.
- Adds streaming file reader to handle large files without loading entire content into memory.
- Integrates index/cache into the server and MCP tools (updated: process_uploads, search, get_context_window).
- Small changes to `embedding-provider` and `types` to leverage the cache.
- Updates `tsconfig.json` for stricter compilation settings.

Operational notes / migration:
- To warm the cache immediately: run `process_uploads`.
- Relevant environment variables:
  - MCP_INDEXING_ENABLED=true
  - MCP_CACHE_SIZE=1000
  - MCP_PARALLEL_ENABLED=true
  - MCP_MAX_WORKERS=4
  - MCP_STREAMING_ENABLED=true


Refs: PR [#7](https://github.com/andrea9293/mcp-documentation-server/issues/7) (Implement Phase 1 Scalability Improvements)

# [1.8.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.7.0...v1.8.0) (2025-08-23)


### Features

* Fix critical PDF vulnerability (CVE-2024-4139) by replacing pdf-ts with unpdf ([f28f93b](https://github.com/andrea9293/mcp-documentation-server/commit/f28f93b4c26d25511055a449ecee241aeddb2a3b))

# [1.7.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.6.0...v1.7.0) (2025-07-25)


### Features

* update all docs e and bugfixing ([c202ee5](https://github.com/andrea9293/mcp-documentation-server/commit/c202ee5124563b8d4eeba0ddde07e3c4efc34358))

# [1.6.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.5.1...v1.6.0) (2025-07-19)


### Bug Fixes

* add dotenv import to load environment variables from .env files ([b91f578](https://github.com/andrea9293/mcp-documentation-server/commit/b91f5781bd3fe6d3c7bc89511d2560bb4fc37d3e))


### Features

* add get_context_window tool to retrieve surrounding chunks of a document ([c92f530](https://github.com/andrea9293/mcp-documentation-server/commit/c92f530cf6dac48ab91bf6bc8358222ef6e54fe4))
* add getOnlyContentDocument method and get_context_window tool; enhance EmbeddingProvider with getDimensions ([f94746b](https://github.com/andrea9293/mcp-documentation-server/commit/f94746bd1b2b6e8bdc63e8e3e0c0259c174dd50c))
* enhance embedding providers with model dimensions and lazy initialization ([d8b3321](https://github.com/andrea9293/mcp-documentation-server/commit/d8b3321cac4a02fc60d3447ef94a91f5ebf7b975))
* enhance search_documents tool with truncation notice and context retrieval hint ([8750830](https://github.com/andrea9293/mcp-documentation-server/commit/8750830b9f62ecc86f29d7b6bc73bc3ee93240a5))
* implement intelligent chunking for document processing ([d7dc3c9](https://github.com/andrea9293/mcp-documentation-server/commit/d7dc3c94d246bc16beda982b19bbcace6772c46f))
* update README to enhance feature descriptions and add context window retrieval example ([77514d8](https://github.com/andrea9293/mcp-documentation-server/commit/77514d8b312d5f297eda823711657deb6b20bc0c))

## [1.5.1](https://github.com/andrea9293/mcp-documentation-server/compare/v1.5.0...v1.5.1) (2025-06-19)


### Bug Fixes

* update document search logic and improve error handling ([7397bcf](https://github.com/andrea9293/mcp-documentation-server/commit/7397bcfe30c91541e94306caee7cc37771dc7c83))
* update search_documents tool to include query parameter for improved search functionality ([ddf4e1c](https://github.com/andrea9293/mcp-documentation-server/commit/ddf4e1cc3e6ac4477408878fbbe6e4cd6918de8a))

# [1.5.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.4.0...v1.5.0) (2025-06-16)


### Features

* increase content preview length in get_document tool ([7920c59](https://github.com/andrea9293/mcp-documentation-server/commit/7920c595c82e5d2ba1d729363cae5d9868e6e3a6))

# [1.4.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.3.0...v1.4.0) (2025-06-16)


### Features

* enhance file upload support and improve directory management in DocumentManager ([2d1a9c9](https://github.com/andrea9293/mcp-documentation-server/commit/2d1a9c9cad2887c9fcfba57fb53c68ea9e6f1aa6))

# [1.3.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.2.0...v1.3.0) (2025-06-16)


### Bug Fixes

* improve code readability by adding spacing in TransformersEmbeddingProvider ([40f8e14](https://github.com/andrea9293/mcp-documentation-server/commit/40f8e1488af37db919310a23d2b1a37f09a2e23c))


### Features

* add PDF text extraction support ([1fa17d9](https://github.com/andrea9293/mcp-documentation-server/commit/1fa17d9f8f8ee28bf69582b6377fbd9dac1da61e))

# [1.2.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.1.1...v1.2.0) (2025-06-15)


### Features

* add comprehensive document deletion functionality and improve documentation ([00329c4](https://github.com/andrea9293/mcp-documentation-server/commit/00329c4b147c3a47af30219b2055a71c7767c322))

## [1.1.1](https://github.com/andrea9293/mcp-documentation-server/compare/v1.1.0...v1.1.1) (2025-06-15)


### Bug Fixes

* correct bin path in package.json for proper executable resolution ([d7674f4](https://github.com/andrea9293/mcp-documentation-server/commit/d7674f413bc07e7abd8c24f2208b757f114f29fd))

# [1.1.0](https://github.com/andrea9293/mcp-documentation-server/compare/v1.0.0...v1.1.0) (2025-06-15)


### Features

* add publishConfig to package.json for public access ([4602c1e](https://github.com/andrea9293/mcp-documentation-server/commit/4602c1e6fa093a5605a2bcaa216c42c8beb1aed9))

# 1.0.0 (2025-06-15)


### Bug Fixes

* update Node.js version in GitHub Actions workflow to 20 ([1a32615](https://github.com/andrea9293/mcp-documentation-server/commit/1a3261527d3896555fead50461d6061ff04622d6))
* update workflow to handle test script and fix GitHub Actions configuration ([3c21a05](https://github.com/andrea9293/mcp-documentation-server/commit/3c21a05c96a7c9ea82e640d27172251a166f7b56))


### Features

* Update package configuration and embedding model ([edf04bd](https://github.com/andrea9293/mcp-documentation-server/commit/edf04bd73cde1bdaad961ea2db913e0f82764ca9))
