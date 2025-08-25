[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/72109e6a-27fa-430d-9034-571e7065fe05) [![npm version](https://badge.fury.io/js/@andrea9293%2Fmcp-documentation-server.svg)](https://badge.fury.io/js/@andrea9293%2Fmcp-documentation-server) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/andrea9293/mcp-documentation-server)

[![Donate with PayPal](https://i.ibb.co/SX4qQBfm/paypal-donate-button171.png)](https://www.paypal.com/donate/?hosted_button_id=HXATGECV8HUJN) 

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/andrea.bravaccino)


# MCP Documentation Server

A TypeScript-based [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides local-first document management and semantic search using embeddings. The server exposes a collection of MCP tools and is optimized for performance with on-disk persistence, an in-memory index, and caching.

## Demo Video

[![IMAGE ALT TEXT HERE](https://img.youtube.com/vi/GA28hib-Vj0/0.jpg)](https://www.youtube.com/watch?v=GA28hib-Vj0)



## Core capabilities

- O(1) Document lookup and keyword index through `DocumentIndex` for fast chunk and document retrieval.
- LRU `EmbeddingCache` to avoid recomputing embeddings and speed up repeated queries.
- Parallel chunking and batch processing to accelerate ingestion of large documents.
- Streaming file reader to process large files without high memory usage.
- Chunk-based semantic search with context-window retrieval to gather surrounding chunks for better LLM answers.
- Local-only storage: no external database required. All data resides in `~/.mcp-documentation-server/`.

## Quick Start

### Install and run

Run directly with npx (recommended):

```bash
npx @andrea9293/mcp-documentation-server
```

### Configure an MCP client

Example configuration for an MCP client (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "documentation": {
      "command": "npx",
      "args": [
        "-y",
        "@andrea9293/mcp-documentation-server"
      ],
      "env": {
        "MCP_EMBEDDING_MODEL": "Xenova/all-MiniLM-L6-v2"
      }
    }
  }
}
```

### Basic workflow

- Add documents using the `add_document` tool or by placing `.txt`, `.md`, or `.pdf` files into the uploads folder and calling `process_uploads`.
- Search documents with `search_documents` to get ranked chunk hits.
- Use `get_context_window` to fetch neighboring chunks and provide LLMs with richer context.

## Features

- Document management: add, list, retrieve, delete documents and metadata.
- Semantic search: chunk-level search using embeddings plus an in-memory keyword index.
- `DocumentIndex`: constant-time lookups for documents and chunks; supports deduplication and persisted index file.
- `EmbeddingCache`: configurable LRU cache for embedding vectors to reduce recomputation and speed repeated requests.
- Parallel and batch chunking: ingestion is parallelized for large documents to improve throughput.
- Streaming file processing: large files are processed in a streaming manner to avoid excessive memory usage.
- Context window retrieval: fetch N chunks before/after a hit to assemble full context for LLM prompts.
- Local-first persistence: documents and index are stored as JSON files under the user's data directory.

## Exposed MCP tools

The server exposes several tools (validated with Zod schemas) for document lifecycle and search:

- `add_document` — Add a document (title, content, metadata)
- `list_documents` — List stored documents and metadata
- `get_document` — Retrieve a full document by id
- `delete_document` — Remove a document and its chunks
- `process_uploads` — Convert files in uploads folder into documents (chunking + embeddings)
- `get_uploads_path` — Returns the absolute uploads folder path
- `list_uploads_files` — Lists files in uploads folder
- `search_documents` — Semantic search within a document (returns chunk hits and LLM hint)
- `get_context_window` — Return a window of chunks around a target chunk index

## Configuration & environment variables

Configure behavior via environment variables. Important options:

- `MCP_EMBEDDING_MODEL` — embedding model name (default: `Xenova/all-MiniLM-L6-v2`). Changing the model requires re-adding documents. (all feature extraction xenova models are [here](https://huggingface.co/xenova)).
- `MCP_INDEXING_ENABLED` — enable/disable the `DocumentIndex` (true/false). Default: `true`.
- `MCP_CACHE_SIZE` — LRU embedding cache size (integer). Default: `1000`.
- `MCP_PARALLEL_ENABLED` — enable parallel chunking (true/false). Default: `true`.
- `MCP_MAX_WORKERS` — number of parallel workers for chunking/indexing. Default: `4`.
- `MCP_STREAMING_ENABLED` — enable streaming reads for large files. Default: `true`.
- `MCP_STREAM_CHUNK_SIZE` — streaming buffer size in bytes. Default: `65536` (64KB).
- `MCP_STREAM_FILE_SIZE_LIMIT` — threshold (bytes) to switch to streaming path. Default: `10485760` (10MB).

Example `.env` (defaults applied when variables are not set):

```env
MCP_INDEXING_ENABLED=true          # Enable O(1) indexing (default: true)
MCP_CACHE_SIZE=1000                # LRU cache size (default: 1000)
MCP_PARALLEL_ENABLED=true          # Enable parallel processing (default: true)
MCP_MAX_WORKERS=4                  # Parallel worker count (default: 4)
MCP_STREAMING_ENABLED=true         # Enable streaming (default: true)
MCP_STREAM_CHUNK_SIZE=65536        # Stream chunk size (default: 64KB)
MCP_STREAM_FILE_SIZE_LIMIT=10485760 # Streaming threshold (default: 10MB)
```

Default storage layout (data directory):

```
~/.mcp-documentation-server/
├── data/      # Document JSON files
└── uploads/   # Drop files (.txt, .md, .pdf) to import
```

## Usage examples

Add a document via MCP tool:

```json
{
  "tool": "add_document",
  "arguments": {
    "title": "Python Basics",
    "content": "Python is a high-level programming language...",
    "metadata": {
      "category": "programming",
      "tags": ["python", "tutorial"]
    }
  }
}
```

Search a document:

```json
{
  "tool": "search_documents",
  "arguments": {
    "document_id": "doc-123",
    "query": "variable assignment",
    "limit": 5
  }
}
```

Fetch context window:

```json
{
  "tool": "get_context_window",
  "arguments": {
    "document_id": "doc-123",
    "chunk_index": 5,
    "before": 2,
    "after": 2
  }
}
```

## Performance and operational notes

- Embedding models are downloaded on first use; some models require several hundred MB of downloads.
- The `DocumentIndex` persists an index file and can be rebuilt if necessary.
- The `EmbeddingCache` can be warmed by calling `process_uploads`, issuing curated queries, or using a preload API when available.

### Embedding Models

Set via `MCP_EMBEDDING_MODEL` environment variable:

- **`Xenova/all-MiniLM-L6-v2`** (default) - Fast, good quality (384 dimensions)
- **`Xenova/paraphrase-multilingual-mpnet-base-v2`** (recommended) - Best quality, multilingual (768 dimensions)

The system automatically manages the correct embedding dimension for each model. Embedding providers expose their dimension via `getDimensions()`.

⚠️ **Important**: Changing models requires re-adding all documents as embeddings are incompatible.


## Development

```bash
git clone https://github.com/andrea9293/mcp-documentation-server.git
```
```bash
cd mcp-documentation-server
```

```bash
npm run dev
```
```bash
npm run build
```
```bash
npm run inspect
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/name`
3. Follow [Conventional Commits](https://conventionalcommits.org/) for messages
4. Open a pull request

## License

MIT - see [LICENSE](LICENSE) file
 

## Support

- 📖 [Documentation](https://github.com/andrea9293/mcp-documentation-server)
- 🐛 [Report Issues](https://github.com/andrea9293/mcp-documentation-server/issues)
- 💬 [MCP Community](https://modelcontextprotocol.io/)

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=andrea9293/mcp-documentation-server&type=Date)](https://www.star-history.com/#andrea9293/mcp-documentation-server&Date)


**Built with [FastMCP](https://github.com/punkpeye/fastmcp) and TypeScript** 🚀