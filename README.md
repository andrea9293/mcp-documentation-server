# MCP Documentation Server (TypeScript)

A Model Context Protocol (MCP) server for document management with semantic search capabilities, built with TypeScript and FastMCP.

## 🚀 Features

- **Document Management**: Add, retrieve, and list documents with automatic chunking
- **Semantic Search**: Search within specific documents using high-quality multilingual embeddings and chunk-based retrieval
- **Advanced Embedding Models**: Uses `paraphrase-multilingual-mpnet-base-v2` for superior multilingual semantic search
- **Embedding Model Switching**: Switch between different embedding models dynamically
- **Automatic Chunking**: Documents are split into 700-character semantic chunks for precise search
- **Upload Folder Management**: Upload .txt and .md files manually for automatic processing
- **Metadata Support**: Rich metadata storage with custom fields
- **Local Storage**: File-based storage with JSON persistence
- **Embedding Support**: Built-in embedding generation with transformer models and fallback options

## 📁 Project Structure

```
mcp-documentation-server-ts/
├── src/
│   ├── server.ts          # Main MCP server with FastMCP
│   ├── types.ts           # TypeScript interfaces
│   └── test-data.ts       # Test data utilities
├── data/                  # Document storage (auto-created)
├── uploads/               # Manual file uploads (auto-created)
├── dist/                  # Compiled JavaScript
└── docs/
    ├── TESTING.md         # Testing instructions
    └── README.md          # This file
```

## 🛠️ Tools

### `add_document`
Add a new document to the knowledge base with automatic chunking.

**Parameters:**
- `title` (string): Document title
- `content` (string): Document content (will be chunked automatically)
- `metadata` (optional object): Custom metadata fields

**Example:**
```json
{
  "title": "API Documentation",
  "content": "This document explains how to use our REST API...",
  "metadata": {
    "category": "technical",
    "author": "John Doe",
    "tags": ["api", "rest", "documentation"]
  }
}
```

### `search_documents`
Search for chunks within a specific document using semantic similarity.

**Parameters:**
- `document_id` (string): ID of the document to search within
- `query` (string): Search query
- `limit` (optional number): Maximum number of chunks to return (default: 10)

**Returns:** Array of chunks ordered by similarity score

**Example:**
```json
{
  "document_id": "abc123",
  "query": "authentication methods",
  "limit": 5
}
```

### `get_document`
Retrieve a complete document by ID.

**Parameters:**
- `id` (string): Document ID

**Returns:** Complete document with all chunks and metadata

### `list_documents`
List all documents in the knowledge base.

**Returns:** Array of documents with metadata and chunk counts

### `get_uploads_path`
Get the absolute path to the uploads folder.

**Returns:** Path where you can place .txt and .md files for processing

### `process_uploads`
Process all .txt and .md files in the uploads folder.

**Returns:** Processing summary with success count and any errors

### `list_uploads_files`
List all files in the uploads folder with their details.

**Returns:** Array of files with size, modification date, and supported status

### `switch_embedding_model`
Switch to a different embedding model for improved semantic search.

**Parameters:**
- `modelName` (string): Name of the embedding model (e.g., "Xenova/paraphrase-multilingual-mpnet-base-v2", "Xenova/all-MiniLM-L6-v2")

**Example:**
```json
{
  "modelName": "Xenova/all-MiniLM-L6-v2"
}
```

**Returns:** Success message with note about re-embedding existing documents

### `get_embedding_info`
Get information about the current embedding model and provider.

**Returns:** Details about the current embedding model, availability, and supported options

## 📊 Document Structure

Each document is automatically processed into chunks:

```typescript
interface Document {
  id: string;                    // Unique identifier
  title: string;                 // Document title
  content: string;               // Full content
  metadata: Record<string, any>; // Custom metadata
  chunks: DocumentChunk[];       // Array of semantic chunks
  created_at: string;           // ISO timestamp
  updated_at: string;           // ISO timestamp
}

interface DocumentChunk {
  id: string;              // Unique chunk identifier
  document_id: string;     // Parent document ID
  chunk_index: number;     // Sequential index
  content: string;         // Chunk content (~700 chars)
  embeddings: number[];    // Embedding vector
  start_position: number;  // Position in original text
  end_position: number;    // End position in original text
}
```

## 🔍 Chunking Logic

Documents are automatically split into chunks using an intelligent algorithm:

- **Target Size**: 700 characters per chunk
- **Boundary Respect**: Splits on sentence boundaries (`.`, `!`, `?`)
- **Semantic Integrity**: Never breaks in the middle of sentences
- **Embedding Generation**: Each chunk gets its own embedding vector
- **Position Tracking**: Maintains start/end positions in original text

## 📤 Upload Workflow

1. **Get Upload Path**: Use `get_uploads_path` to find where to place files
2. **Add Files**: Place `.txt` or `.md` files in the uploads folder
3. **List Files**: Use `list_uploads_files` to see available files
4. **Process Files**: Use `process_uploads` to create documents with embeddings
5. **Search**: Use normal search tools with the generated document IDs

**File Naming**: The filename (without extension) becomes the document title. Files with the same name will overwrite previous versions.

## 🚀 Installation

### Prerequisites
- Node.js 18+ 
- npm

### From Source
```bash
git clone <repository-url>
cd mcp-documentation-server-ts
npm install
npm run build
```

## 💻 Usage

### Development Mode
```bash
# Start with FastMCP dev server
npm run dev

# Or start directly with tsx
npm run dev:direct

# Build and run
npm run build && npm start
```

### With MCP Inspector
```bash
# Inspect the server tools and resources
npm run inspect
```

### With Claude Desktop

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%AppData%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "documentation": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-documentation-server-ts/src/server.ts"]
    }
  }
}
```

## 🧪 Testing

See `TESTING.md` for detailed testing instructions and example payloads.

### Quick Test
1. Start the server: `npm run dev`
2. Add a test document with the provided sample data
3. Search within the document using semantic queries
4. Upload files to the uploads folder and process them

## 🛠️ Development

### Project Scripts
- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Start development server with FastMCP
- `npm run dev:direct` - Start server directly with tsx
- `npm start` - Run compiled server
- `npm run inspect` - Inspect server with FastMCP tools

### Adding New Features
1. Update interfaces in the main server file
2. Add new tools using FastMCP's `server.addTool()` 
3. Update documentation in README and TESTING.md
4. Test with the development server

## 📝 Example Usage

### Adding and Searching Documents

```typescript
// 1. Add a document
{
  "method": "tools/call",
  "params": {
    "name": "add_document",
    "arguments": {
      "title": "Python Guide",
      "content": "Python is a powerful programming language...",
      "metadata": {"category": "programming"}
    }
  }
}

// 2. Search within the document  
{
  "method": "tools/call",
  "params": {
    "name": "search_documents", 
    "arguments": {
      "document_id": "abc123",
      "query": "python functions",
      "limit": 3
    }
  }
}
```

### Upload Workflow

```bash
# 1. Get upload path
GET uploads path → /absolute/path/to/uploads

# 2. Place file: /uploads/python-tutorial.md

# 3. Process uploads
Process uploads → Creates document with chunks and embeddings

# 4. Search in the new document
Search for "variables" in the python-tutorial document
```

## 🔧 Configuration

### Environment Variables
- `MCP_DATA_DIR` - Custom data directory (default: `./data`)
- `MCP_UPLOADS_DIR` - Custom uploads directory (default: `./uploads`)

### Chunk Size
Modify `chunkSize` in the `createChunks` method to adjust chunk dimensions.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Update documentation
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙋‍♂️ Support

For issues and questions:
1. Check the TESTING.md file for common issues
2. Review the MCP protocol documentation
3. Open an issue on GitHub

---

**Built with FastMCP and TypeScript** 🚀

For development and testing:

```bash
# Run with FastMCP development server
npm run dev

# Inspect with MCP Inspector (web UI)
npm run inspect
```

### Command Line Testing

Test the server using MCP CLI:

```bash
# Install MCP CLI
npm install -g @modelcontextprotocol/cli

# Test the server
mcp-cli run npx mcp-documentation-server-ts
```

## Configuration

Configure the server using environment variables:

- `MCP_DATA_DIR`: Data directory path (default: `~/.mcp-documentation-server`)
- `MCP_MAX_DOCUMENT_SIZE`: Maximum document size in bytes (default: 1048576 = 1MB)
- `MCP_SEARCH_LIMIT`: Default search result limit (default: 10)

## Examples

### Adding a Document
```javascript
{
  "tool": "add_document",
  "arguments": {
    "title": "MCP Protocol Guide",
    "content": "The Model Context Protocol (MCP) is an open standard...",
    "author": "MCP Team",
    "tags": ["mcp", "protocol", "documentation"],
    "description": "Complete guide to MCP implementation",
    "contentType": "text/markdown"
  }
}
```

### Searching Documents
```javascript
{
  "tool": "search_documents",
  "arguments": {
    "query": "How to implement MCP servers",
    "limit": 5,
    "threshold": 0.7,
    "tags": ["mcp", "implementation"]
  }
}
```

## Architecture

- **FastMCP**: TypeScript framework for MCP server implementation
- **Transformers.js**: Advanced multilingual embedding generation with paraphrase-multilingual-mpnet-base-v2 (with fallback to simpler models)
- **File Storage**: JSON-based document and metadata storage
- **Semantic Search**: Cosine similarity for vector search

## File Structure

```
src/
├── index.ts              # Main server entry point
├── document-manager.ts   # Document storage and management
├── search-engine.ts      # Semantic search engine
├── embedding-provider.ts # Embedding generation
├── types.ts             # TypeScript type definitions
└── utils.ts             # Utility functions

data/
├── metadata.json        # Document metadata index
└── documents/           # Individual document files
    ├── {id}.json       # Document content and metadata
    └── {id}.embedding.json  # Document embeddings
```

## Dependencies

- **fastmcp**: MCP framework for TypeScript
- **@xenova/transformers**: Local embeddings via Transformers.js
- **zod**: Runtime type validation
- **fs-extra**: Enhanced file system operations

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run development server
npm run dev

# Inspect with web UI
npm run inspect
```

## License

MIT

## Contributing

Contributions are welcome! Please read the contributing guidelines and submit pull requests for any improvements.

## Support

For issues and questions:
1. Check the documentation
2. Search existing issues
3. Create a new issue with detailed information

## Related Projects

- [FastMCP (TypeScript)](https://github.com/punkpeye/fastmcp) - MCP framework
- [FastMCP (Python)](https://github.com/jlowin/fastmcp) - Python version
- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP documentation
