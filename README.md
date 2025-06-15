# MCP Documentation Server (TypeScript)

A Model Context Protocol (MCP) server for document management with semantic search capabilities, built with TypeScript and FastMCP.

## Features

- **Document Management**: Add, retrieve, list, and delete documents
- **Semantic Search**: Find documents using natural language queries with embedding-based similarity
- **Multiple Content Types**: Support for text, markdown, HTML, JSON, XML, and CSV
- **Metadata Support**: Tags, authors, descriptions, and content types
- **Local Storage**: File-based storage with JSON metadata
- **Embeddings**: Uses Transformers.js for local embeddings (with fallback)

## Tools

### `add_document`
Add a new document to the collection.

**Parameters:**
- `title` (string): Document title
- `content` (string): Document content
- `author` (optional string): Document author
- `tags` (optional array): Document tags
- `description` (optional string): Document description
- `contentType` (optional string): Content type (auto-detected if not provided)

### `search_documents`
Search documents using semantic similarity.

**Parameters:**
- `query` (string): Search query
- `limit` (optional number): Maximum results (1-50, default: 10)
- `threshold` (optional number): Similarity threshold (0.0-1.0, default: 0.0)
- `includeContent` (optional boolean): Include full content (default: false)
- `tags` (optional array): Filter by tags
- `author` (optional string): Filter by author
- `contentType` (optional string): Filter by content type

### `get_document`
Retrieve a specific document by ID.

**Parameters:**
- `id` (string): Document ID
- `includeContent` (optional boolean): Include full content (default: true)

### `list_documents`
List all available documents.

**Parameters:**
- `tags` (optional array): Filter by tags
- `author` (optional string): Filter by author
- `contentType` (optional string): Filter by content type

### `delete_document`
Delete a document from the collection.

**Parameters:**
- `id` (string): Document ID to delete

## Resources

### `document://{id}`
Access document content directly as a resource.

## Installation

### NPM Package (Global)
```bash
npm install -g mcp-documentation-server-ts
```

### From Source
```bash
git clone <repository-url>
cd mcp-documentation-server-ts
npm install
npm run build
```

## Usage

### With Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%AppData%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "documentation": {
      "command": "npx",
      "args": ["mcp-documentation-server-ts"],
      "env": {
        "MCP_DATA_DIR": "/path/to/your/documents"
      }
    }
  }
}
```

### Development Mode

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
- **Transformers.js**: Local embedding generation (with fallback to simple embeddings)
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
