[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/72109e6a-27fa-430d-9034-571e7065fe05) [![npm version](https://badge.fury.io/js/@andrea9293%2Fmcp-documentation-server.svg)](https://badge.fury.io/js/@andrea9293%2Fmcp-documentation-server) [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/andrea9293/mcp-documentation-server)

[![Donate with PayPal](https://i.ibb.co/SX4qQBfm/paypal-donate-button171.png)](https://www.paypal.com/donate/?hosted_button_id=HXATGECV8HUJN) 

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://buymeacoffee.com/andrea.bravaccino)


# MCP Documentation Server

A TypeScript-based [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides document management and semantic search capabilities. Upload documents, search them with AI embeddings, and integrate seamlessly with MCP clients like Claude Desktop.

## Demo Video

[![IMAGE ALT TEXT HERE](https://img.youtube.com/vi/GA28hib-Vj0/0.jpg)](https://www.youtube.com/watch?v=GA28hib-Vj0)


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

### 3. Start Using

- **Add documents**: Upload text/markdown files or add content directly
- **Search documents**: Use semantic search to find relevant information
- **Manage content**: List, retrieve, and organize your documents

## Features

 - 📄 **Document Management** - Add, list, retrieve, and delete documents with metadata
 - 🔍 **Semantic Search** - AI-powered search using embeddings
 - 🧠 **Intelligent Chunking** - Documents are automatically split into context-aware chunks for better search accuracy and context retrieval
 - 🧩 **Context Window Retrieval** - Retrieve a window of chunks around a relevant chunk to get more context for your queries
 - � **LLM Guidance** - The search tool provides hints to LLMs on how to use context windowing for better answers
 - 📁 **File Upload** - Drop .txt/.md/.pdf files in uploads folder for processing
 - 🗑️ **Document Deletion** - Clean removal of documents and their chunks
 - 🌍 **Multilingual** - Supports multiple languages with quality embeddings
 - 💾 **Local Storage** - All data stored locally in `~/.mcp-documentation-server/` directory
 - ⚡ **Fast Setup** - No database required, works out of the box

## Available Tools

| Tool                | Description                                                                 |
|---------------------|-----------------------------------------------------------------------------|
| `add_document`      | Add a document with title, content, and metadata                            |
| `search_documents`  | Search for chunks within a specific document. Returns a hint for LLMs on how to retrieve more context. |
| `get_context_window`| Returns a window of chunks around a central chunk for a document            |
| `list_documents`    | List all documents with their metadata                                      |
| `get_document`      | Retrieve a complete document by ID                                         |
| `delete_document`   | Delete a document by ID (removes all associated chunks)                    |
| `get_uploads_path`  | Get path to uploads folder                                                  |
| `list_uploads_files`| List files in uploads folder                                                |
| `process_uploads`   | Process uploaded files into documents                                       |

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

### Retrieving Context Window

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

### Deleting a Document

```json
{
  "tool": "delete_document",
  "arguments": {
    "id": "doc-123"
  }
}
```

### File Upload Workflow

1. Get uploads path: `get_uploads_path` (`~/.mcp-documentation-server/uploads/`)
2. Place your .txt/.md/.pdf files in that folder
3. Process files: `process_uploads`
4. Search the processed documents

**Supported file types:**
- **.txt** - Plain text files
- **.md** - Markdown files  
- **.pdf** - PDF files (text extraction, no OCR)

## Configuration

### Data Storage

All documents and uploads are stored locally in:
```
~/.mcp-documentation-server/
├── data/      # Document storage (JSON files)
└── uploads/   # Files to process (.txt, .md, .pdf)
```

### Embedding Models

Set via `MCP_EMBEDDING_MODEL` environment variable:

- **`Xenova/all-MiniLM-L6-v2`** (default) - Fast, good quality (384 dimensions)
- **`Xenova/paraphrase-multilingual-mpnet-base-v2`** (recommended) - Best quality, multilingual (768 dimensions)

The system automatically manages the correct embedding dimension for each model. Embedding providers expose their dimension via `getDimensions()`.

⚠️ **Important**: Changing models requires re-adding all documents as embeddings are incompatible.

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

## Best Practices

### Document Organization
- Use descriptive titles for easy identification
- Add relevant metadata (tags, categories) for better organization
- Keep documents focused on specific topics for better search accuracy

### Search Optimization
- Use specific, descriptive search queries
- Combine keywords related to your topic
- Start with broader queries, then refine with more specific terms
- After finding relevant chunks with `search_documents`, use `get_context_window` to retrieve additional context around those chunks. You can call `get_context_window` multiple times until you have enough context to answer your question.

### Performance Tips
- Process large files during off-peak hours (initial embedding creation)
- Use smaller embedding models for faster performance if quality is acceptable
- Regularly clean up unused documents to maintain performance

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

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=andrea9293/mcp-documentation-server&type=Date)](https://www.star-history.com/#andrea9293/mcp-documentation-server&Date)
