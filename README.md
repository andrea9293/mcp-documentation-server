[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/72109e6a-27fa-430d-9034-571e7065fe05) [![npm version](https://badge.fury.io/js/@andrea9293%2Fmcp-documentation-server.svg)](https://badge.fury.io/js/@andrea9293%2Fmcp-documentation-server) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/andrea9293/mcp-documentation-server) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![Donate with PayPal](https://i.ibb.co/SX4qQBfm/paypal-donate-button171.png)](https://www.paypal.com/donate/?hosted_button_id=HXATGECV8HUJN) 

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/andrea.bravaccino)


# MCP Documentation Server

A TypeScript-based [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides local-first document management and semantic search. Documents are stored in an embedded [Orama](https://orama.com/) vector database with hybrid search (full-text + vector), intelligent chunking, and local AI embeddings — no external database or cloud service required.

## Core capabilities

### 🔍 Search & Intelligence
- **Hybrid Search**: Combined full-text and vector similarity powered by Orama, for both single-document and cross-document queries
- **AI-Powered Search** 🤖: Advanced document analysis with Google Gemini AI for contextual understanding and intelligent insights (optional, requires API key)
- **Context Window Retrieval**: Fetch surrounding chunks to provide LLMs with richer context

### ⚡ Performance & Architecture
- **Orama Vector DB**: Embedded search engine with zero native dependencies — replaces manual JSON storage and cosine similarity
- **LRU Embedding Cache**: Avoids recomputing embeddings for repeated content and queries
- **Intelligent Chunking**: Content-aware splitting (code, markdown, text) with adaptive sizing and parallel processing
- **Streaming File Reader**: Handles large files without high memory usage
- **Automatic Migration**: Legacy JSON documents are migrated to Orama on first startup — no manual intervention needed

### 📁 File Management
- **Upload processing**: Drop `.txt`, `.md`, or `.pdf` files into the uploads folder and process them with a single tool call
- **Copy-based storage**: Original files are backed up alongside the database
- **Local-only storage**: All data resides in `~/.mcp-documentation-server/`

## Quick Start

### Configure an MCP client

Example configuration for an MCP client (e.g., Claude Desktop, VS Code):

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
        "MCP_BASE_DIR": "/path/to/workspace",
        "GEMINI_API_KEY": "your-api-key-here",
        "MCP_EMBEDDING_MODEL": "Xenova/all-MiniLM-L6-v2"
      }
    }
  }
}
```

All environment variables are optional. Without `GEMINI_API_KEY`, only the local embedding-based search tools are available.

### Basic workflow

1. Add documents using `add_document` or place `.txt` / `.md` / `.pdf` files in the uploads folder and call `process_uploads`.
2. Search across everything with `search_all_documents`, or within a single document with `search_documents`.
3. Use `get_context_window` to fetch neighboring chunks and give the LLM broader context.

## MCP Tools

The server registers the following tools (all validated with Zod schemas):

### 📄 Document Management
| Tool | Description |
| --- | --- |
| `add_document` | Add a document (title, content, optional metadata) |
| `list_documents` | List all documents with metadata and content preview |
| `get_document` | Retrieve the full content of a document by ID |
| `delete_document` | Remove a document, its chunks, database entries, and associated files |

### 📁 File Processing
| Tool | Description |
| --- | --- |
| `process_uploads` | Process all files in the uploads folder (chunking + embeddings) |
| `get_uploads_path` | Returns the absolute path to the uploads folder |
| `list_uploads_files` | Lists files in the uploads folder with size and format info |

### 🔍 Search
| Tool | Description |
| --- | --- |
| `search_documents` | Semantic vector search within a specific document |
| `search_all_documents` | Hybrid (full-text + vector) cross-document search |
| `get_context_window` | Returns a window of chunks around a given chunk index |
| `search_documents_with_ai` | 🤖 AI-powered search using Gemini (requires `GEMINI_API_KEY`) |

## Configuration

Configure via environment variables or a `.env` file in the project root:

| Variable | Default | Description |
| --- | --- | --- |
| `MCP_BASE_DIR` | `~/.mcp-documentation-server` | Base directory for data storage |
| `MCP_EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | Embedding model name |
| `GEMINI_API_KEY` | — | Google Gemini API key (enables `search_documents_with_ai`) |
| `MCP_CACHE_ENABLED` | `true` | Enable/disable LRU embedding cache |
| `MCP_PARALLEL_ENABLED` | `true` | Enable parallel chunking for large documents |
| `MCP_STREAMING_ENABLED` | `true` | Enable streaming reads for large files |
| `MCP_STREAM_CHUNK_SIZE` | `65536` | Streaming buffer size in bytes (64KB) |
| `MCP_STREAM_FILE_SIZE_LIMIT` | `10485760` | Threshold to switch to streaming (10MB) |

### Storage layout

```
~/.mcp-documentation-server/     # Or custom path via MCP_BASE_DIR
├── data/
│   ├── orama-chunks.msp         # Orama vector DB (chunks + embeddings)
│   ├── orama-docs.msp           # Orama document DB (full content + metadata)
│   ├── migration-complete.flag   # Written after legacy JSON migration
│   └── *.md                     # Markdown copies of documents
└── uploads/                     # Drop .txt, .md, .pdf files here
```

### Embedding Models

Set via `MCP_EMBEDDING_MODEL`:

| Model | Dimensions | Notes |
| --- | --- | --- |
| `Xenova/all-MiniLM-L6-v2` | 384 | Default — fast, good quality |
| `Xenova/paraphrase-multilingual-mpnet-base-v2` | 768 | Recommended — best quality, multilingual |

Models are downloaded on first use (~80–420 MB). The vector dimension is determined automatically from the provider.

⚠️ **Important**: Changing the embedding model requires re-adding all documents — embeddings from different models are incompatible. The Orama database is recreated automatically when the dimension changes.

## Usage examples

### Add a document

```json
{
  "tool": "add_document",
  "arguments": {
    "title": "Python Basics",
    "content": "Python is a high-level programming language...",
    "metadata": { "category": "programming", "tags": ["python", "tutorial"] }
  }
}
```

### Search within a document

```json
{
  "tool": "search_documents",
  "arguments": {
    "document_id": "abc123",
    "query": "variable assignment",
    "limit": 5
  }
}
```

### Cross-document search

```json
{
  "tool": "search_all_documents",
  "arguments": {
    "query": "how to handle authentication",
    "limit": 10
  }
}
```

### Fetch context around a chunk

```json
{
  "tool": "get_context_window",
  "arguments": {
    "document_id": "abc123",
    "chunk_index": 5,
    "before": 2,
    "after": 2
  }
}
```

### AI-powered analysis (requires `GEMINI_API_KEY`)

```json
{
  "tool": "search_documents_with_ai",
  "arguments": {
    "document_id": "abc123",
    "query": "explain the main concepts and their relationships"
  }
}
```

## Architecture

```
Server (FastMCP)
  └─ DocumentManager
       ├─ OramaStore          — Orama vector DB (chunks DB + docs DB), persistence, migration
       ├─ IntelligentChunker  — Content-aware splitting (code, markdown, text, PDF)
       ├─ EmbeddingProvider   — Local embeddings via @xenova/transformers
       │    └─ EmbeddingCache — LRU in-memory cache
       └─ GeminiSearchService — Optional AI search via Google Gemini
```

- **OramaStore** manages two Orama instances: one for document metadata/content and one for chunks with vector embeddings. Both are persisted to binary files on disk and restored on startup.
- **IntelligentChunker** detects content type and applies the best splitting strategy with adaptive chunk sizes.
- **EmbeddingProvider** lazily loads a Transformers.js model for local inference — no API calls needed.

## Development

```bash
git clone https://github.com/andrea9293/mcp-documentation-server.git
cd mcp-documentation-server
npm install
```

```bash
npm run dev       # FastMCP dev mode with hot reload
npm run build     # TypeScript compilation
npm run inspect   # FastMCP web UI for interactive tool testing
npm start         # Direct tsx execution
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/name`
3. Follow [Conventional Commits](https://conventionalcommits.org/) for messages
4. Open a pull request

## License

MIT — see [LICENSE](LICENSE)

## Support

- 📖 [Documentation](https://github.com/andrea9293/mcp-documentation-server)
- 🐛 [Report Issues](https://github.com/andrea9293/mcp-documentation-server/issues)
- 💬 [MCP Community](https://modelcontextprotocol.io/)
- 🤖 [Google AI Studio](https://aistudio.google.com/app/apikey) — get a Gemini API key

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=andrea9293/mcp-documentation-server&type=Date)](https://www.star-history.com/#andrea9293/mcp-documentation-server&Date)

**Built with [FastMCP](https://github.com/punkpeye/fastmcp), [Orama](https://orama.com/), and TypeScript**