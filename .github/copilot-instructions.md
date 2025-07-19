# MCP Documentation Server - AI Coding Agent Instructions

## Architecture Overview

This is a **TypeScript-based Model Context Protocol (MCP) server** providing document management and semantic search capabilities using local AI embeddings. Key architectural patterns:

- **FastMCP Framework**: Uses `fastmcp` library for MCP server implementation with Zod schema validation
- **Modular Design**: Core functionality split across `DocumentManager`, `EmbeddingProvider`, and utility modules
- **Local-First Storage**: All data stored in `~/.mcp-documentation-server/` (no database required)
- **Lazy Loading**: Embedding models load on-demand to avoid startup delays
- **Chunk-Based Search**: Documents split into chunks with embeddings for granular semantic search

## Core Components

### Server Entry Point (`src/server.ts`)
- Main FastMCP server with 8 MCP tools (add_document, search_documents, etc.)
- Uses `#!/usr/bin/env node` shebang - this file becomes the CLI executable
- Environment configuration via `dotenv` (loads `.env` files)
- Singleton `DocumentManager` instance with lazy initialization

### Document Management (`src/document-manager.ts` logic in `server.ts`)
- **Chunking Strategy**: Text split into ~500-character chunks with overlap for better search
- **ID Generation**: Uses timestamp + random suffix pattern (see `generateId()`)
- **Storage**: JSON files per document in `data/` directory
- **File Processing**: Supports .txt, .md, .pdf via uploads folder workflow

### Embedding Providers (`src/embedding-provider.ts`)
- **Primary**: `TransformersEmbeddingProvider` using `@xenova/transformers` (local ML)
- **Fallback**: `SimpleEmbeddingProvider` (hash-based, no ML dependencies)
- **Model Selection**: Via `MCP_EMBEDDING_MODEL` env var (default: `Xenova/all-MiniLM-L6-v2`)
- **Critical**: Model downloads (~420MB) on first use - implement timeouts

## Development Workflows

### Build & Run Commands
```bash
npm run build      # TypeScript compilation + executable permissions (shx chmod)
npm start          # Direct tsx execution (development)
npm run dev        # FastMCP dev mode with hot reload
npm run inspect    # FastMCP web UI for tool testing
```

### Package Distribution
- **Binary**: `dist/server.js` becomes CLI executable via `package.json` bin field
- **NPX Usage**: `npx @andrea9293/mcp-documentation-server` (primary distribution method)
- **Publishing**: Automated via semantic-release with GitHub Actions

### Development Setup
```bash
npm run dev        # Hot reload during development
npm run inspect    # Visual tool testing interface
```

## Project-Specific Patterns

### Error Handling Convention
- Tools return descriptive error messages via `throw new Error()`
- Embedding failures gracefully fallback to SimpleEmbeddingProvider
- File operations include existence checks before processing

### Data Directory Structure
```
~/.mcp-documentation-server/
├── data/           # JSON files per document (${id}.json)
└── uploads/        # User drops files here for processing
```

### MCP Tool Patterns
All tools follow this structure:
```typescript
server.addTool({
    name: "tool_name",
    description: "Tool description",
    parameters: z.object({...}),  // Zod validation
    execute: async (args) => {    // Returns string or throws Error
        const manager = await initializeDocumentManager();
        // ... implementation
    }
});
```

### Environment Configuration
- `MCP_EMBEDDING_MODEL`: Embedding model selection (affects all new documents)
- `dotenv/config` import at top of server.ts enables .env file support
- Default paths always use `getDefaultDataDir()` from utils.ts

## Integration Points

### FastMCP Integration
- Server definition: `new FastMCP({ name, version })`
- Tool registration: `server.addTool()` with Zod schemas
- Automatic MCP protocol handling (stdio communication)

### Embeddings Pipeline
- **Async Initialization**: Models load lazily on first embedding request
- **Timeout Handling**: 5-minute timeout for model downloads
- **Memory Management**: Single pipeline instance per provider

### File Processing Workflow
1. User places files in uploads/ (via `get_uploads_path` tool)
2. `process_uploads` tool discovers .txt/.md/.pdf files
3. Content extraction (including PDF via `pdf-ts`)
4. Automatic chunking and embedding generation
5. Document storage with searchable chunks

## Testing & Debugging

- **Tool Testing**: Use `npm run inspect` for interactive web UI
- **Log Output**: Embedding initialization logs to stderr (not stdout - preserves MCP protocol)
- **Error Debugging**: Check document existence before search operations
- **Performance**: First embedding takes time (model download), subsequent ones are fast

## Critical Implementation Notes

- **Never** output to stdout in the server (breaks MCP protocol) - use stderr for logs
- **Embedding Model Changes**: Require re-adding all documents (incompatible embeddings)
- **File Permissions**: Build process sets executable permissions on dist/*.js
- **TypeScript**: Uses ES modules (`"type": "module"`) with .js imports for compiled output
