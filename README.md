# MCP Documentation Server

A TypeScript-based [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides document management and semantic search capabilities. Upload documents, search them with AI embeddings, and integrate seamlessly with MCP clients like Claude Desktop.

## Quick Start

### 1. Install and Run

```bash
# Run directly with npx (recommended)
npx @andrea9293/mcp-documentation-server
```

### 2. Configure MCP Client

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "documentation": {
      "command": "npx",
      "args": ["@andrea9293/mcp-documentation-server"]
    }
  }
}
```

### 3. Start Using

- **Add documents**: Upload text/markdown files or add content directly
- **Search documents**: Use semantic search to find relevant information
- **Manage content**: List, retrieve, and organize your documents

## Features

- 📄 **Document Management** - Add, list, retrieve documents with metadata
- 🔍 **Semantic Search** - AI-powered search using embeddings
- 📁 **File Upload** - Drop .txt/.md files in uploads folder for processing
- 🧩 **Smart Chunking** - Automatic text splitting for better search accuracy
- 🌍 **Multilingual** - Supports multiple languages with quality embeddings
- 💾 **Local Storage** - All data stored locally in JSON format
- ⚡ **Fast Setup** - No database required, works out of the box

## Available Tools

| Tool | Description |
|------|-------------|
| `add_document` | Add a document with title, content, and metadata |
| `search_documents` | Search for chunks within a specific document |
| `list_documents` | List all documents with their metadata |
| `get_document` | Retrieve a complete document by ID |
| `get_uploads_path` | Get path to uploads folder |
| `list_uploads_files` | List files in uploads folder |
| `process_uploads` | Process uploaded files into documents |

## Usage Examples

### Adding a Document

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

### Searching Documents

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

### File Upload Workflow

1. Get uploads path: `get_uploads_path`
2. Place your .txt/.md files in that folder
3. Process files: `process_uploads`
4. Search the processed documents

## Configuration

### Embedding Models

Set via `MCP_EMBEDDING_MODEL` environment variable:

- **`Xenova/all-MiniLM-L6-v2`** (default) - Fast, good quality
- **`Xenova/paraphrase-multilingual-mpnet-base-v2`** (recommended) - Best quality, multilingual

⚠️ **Important**: Changing models requires re-adding all documents as embeddings are incompatible.

### Other Environment Variables

```bash
MCP_DATA_DIR="/custom/data/path"           # Data storage location
MCP_MAX_DOCUMENT_SIZE="2097152"            # Max file size (2MB)
MCP_SEARCH_LIMIT="10"                      # Default search results limit
```

## Installation Options

### NPX (Recommended)
```bash
npx @andrea9293/mcp-documentation-server
```

### Global Installation
```bash
npm install -g @andrea9293/mcp-documentation-server
mcp-documentation-server
```

### From Source
```bash
git clone https://github.com/andrea9293/mcp-documentation-server.git
cd mcp-documentation-server
npm install
npm run build
npm start
```

## Troubleshooting

### Timeout on First Use
- **Cause**: Embedding models download on first use (~420MB for best model)
- **Solution**: Wait for background download to complete, or use smaller model initially

### Search Results Issues
- **Cause**: Mixed embedding models in same dataset
- **Solution**: Stick to one model or re-add all documents after switching

## Development

```bash
# Development server with hot reload
npm run dev

# Build and test
npm run build

# Inspect tools with web UI
npm run inspect
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/name`
3. Follow [Conventional Commits](https://conventionalcommits.org/) for messages
4. Submit pull request

## License

MIT - see [LICENSE](LICENSE) file

## Support

- 📖 [Documentation](https://github.com/andrea9293/mcp-documentation-server)
- 🐛 [Report Issues](https://github.com/andrea9293/mcp-documentation-server/issues)
- 💬 [MCP Community](https://modelcontextprotocol.io/)

---

**Built with [FastMCP](https://github.com/punkpeye/fastmcp) and TypeScript** 🚀
