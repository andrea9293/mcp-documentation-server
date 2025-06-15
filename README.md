# MCP Documentation Server (TypeScript)

A Model Context Protocol (MCP) server for document management with semantic search capabilities, built with TypeScript and FastMCP.

## 🚀 Features

- **Document Management**: Add, retrieve, and list documents with automatic chunking
- **Semantic Search**: Search within specific documents using high-quality multilingual embeddings and chunk-based retrieval
- **Configurable Embedding Models**: Use environment variables to configure embedding models (defaults to `Xenova/all-MiniLM-L6-v2`, recommend `Xenova/paraphrase-multilingual-mpnet-base-v2` for best results)
- **Lazy Loading**: Models load on first use to prevent MCP client timeouts
- **Automatic Chunking**: Documents are split into 700-character semantic chunks for precise search
- **Upload Folder Management**: Upload .txt and .md files manually for automatic processing
- **Metadata Support**: Rich metadata storage with custom fields
- **Local Storage**: File-based storage with JSON persistence
- **Embedding Support**: Built-in embedding generation with transformer models and fallback options

## 📁 Project Structure

```
mcp-documentation-server/
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

## 📦 Installation

### Using NPX (Recommended)

The easiest way to use this server is with npx:

```bash
npx @andrea9293/mcp-documentation-server
```

### Installation via NPM

```bash
npm install -g @andrea9293/mcp-documentation-server
```

Then run with:

```bash
mcp-documentation-server
```

### Configuration in MCP Clients

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "documentation": {
      "command": "npx",
      "args": [
        "@andrea9293/mcp-documentation-server"
      ],
      "env": {
        "MCP_EMBEDDING_MODEL": "Xenova/paraphrase-multilingual-mpnet-base-v2"
      }
    }
  }
}
```

**Environment Variables:**
- `MCP_EMBEDDING_MODEL`: Embedding model to use (default: `Xenova/all-MiniLM-L6-v2`)
  - Recommended: `Xenova/paraphrase-multilingual-mpnet-base-v2` for best multilingual results (more RAM used)
  - Alternative: `Xenova/all-MiniLM-L6-v2` for faster processing

### Manual Installation from Source
```bash
git clone <repository-url>
cd mcp-documentation-server
npm install
npm run build
```

## ⚙️ Configuration

### Embedding Model Configuration

The embedding model is configured via the `MCP_EMBEDDING_MODEL` environment variable:

```bash
# Default model (fast startup, good quality)
export MCP_EMBEDDING_MODEL="Xenova/all-MiniLM-L6-v2"

# Recommended model (best quality, multilingual)
export MCP_EMBEDDING_MODEL="Xenova/paraphrase-multilingual-mpnet-base-v2"
```

**Available Models:**
- `Xenova/all-MiniLM-L6-v2` (default): Fast startup, 384 dimensions, good quality
- `Xenova/paraphrase-multilingual-mpnet-base-v2` (recommended): Best quality, 768 dimensions, multilingual

**⚠️ IMPORTANT**: Different embedding models produce incompatible vectors. If you change the model, you must re-add all documents for consistent search results.

### Other Environment Variables

```bash
# Data directory (default: ./data)
export MCP_DATA_DIR="/path/to/your/data"

# Maximum document size (default: 1MB)
export MCP_MAX_DOCUMENT_SIZE="2097152"

# Default search limit (default: 10)
export MCP_SEARCH_LIMIT="20"
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
      "args": ["tsx", "/path/to/mcp-documentation-server/src/server.ts"]
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

## ⚠️ Troubleshooting

### MCP Timeout Errors

If you encounter `MCP error -32001: Request timed out` when adding documents, this is normal behavior:

**Why it happens:**
- The server uses `paraphrase-multilingual-mpnet-base-v2` model which downloads ~420MB on first use
- MCP clients have a 60-second timeout by default
- The operation completes successfully in the background even after timeout

**Solutions:**
1. **Wait for completion**: The document is still being processed even after timeout
2. **Check document list**: Use `list_documents` to verify successful processing
3. **Use smaller model**: Switch to `Xenova/all-MiniLM-L6-v2` for faster processing:
   ```json
   {
     "modelName": "Xenova/all-MiniLM-L6-v2"
   }
   ```
4. **Pre-warm the model**: Add a simple document first to download the model

**Model Loading Times:**
- `paraphrase-multilingual-mpnet-base-v2`: 2-5 minutes first time (better quality)
- `all-MiniLM-L6-v2`: 30-60 seconds first time (faster, good quality)

The server uses lazy loading so models download only when first needed, preventing startup delays.

### Embedding Model Compatibility

**🚨 CRITICAL**: Embeddings from different models are completely incompatible:

**Why incompatible:**
- Different vector dimensions (384 vs 768)
- Different semantic spaces and training data  
- Cannot mix or reuse embeddings between models

**When switching models:**
1. **Clear understanding**: Old documents keep old embeddings
2. **Search inconsistency**: Mixed embeddings give poor results
3. **Solution**: Re-add all documents with new model

**Best practices:**
- Choose your model early in development
- Use `all-MiniLM-L6-v2` for development (faster)
- Use `paraphrase-multilingual-mpnet-base-v2` for production (better quality)
- Avoid switching models on existing datasets

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
mcp-cli run npx mcp-documentation-server
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

## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/andrea9293/mcp-documentation-server.git
cd mcp-documentation-server

# Install dependencies
npm install

# Build the project
npm run build

# Run development server
npm run dev

# Inspect with web UI
npm run inspect
```

## 🚀 Release Process

This project uses semantic-release for automated publishing:

1. **Commit Message Format**: Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` for new features (minor version bump)
   - `fix:` for bug fixes (patch version bump)
   - `feat!:` or `fix!:` for breaking changes (major version bump)

2. **Automatic Release**: Pushing to `main` branch triggers:
   - Version calculation based on commit messages
   - CHANGELOG.md generation
   - GitHub release creation
   - NPM package publishing

3. **Manual Release**: Create and push a git tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

## 📄 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

For bug reports and feature requests, please use the [GitHub Issues](https://github.com/andrea9293/mcp-documentation-server/issues).

## Support

For issues and questions:
1. Check the documentation
2. Search existing issues
3. Create a new issue with detailed information

## Related Projects

- [FastMCP (TypeScript)](https://github.com/punkpeye/fastmcp) - MCP framework
- [FastMCP (Python)](https://github.com/jlowin/fastmcp) - Python version
- [Model Context Protocol](https://modelcontextprotocol.io/) - Official MCP documentation
