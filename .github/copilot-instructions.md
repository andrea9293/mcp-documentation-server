# Copilot Instructions

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is an MCP (Model Context Protocol) Server project written in TypeScript. You can find more info and examples at https://modelcontextprotocol.io/llms-full.txt

## Project Overview
This project is a TypeScript implementation of an MCP server for document management and search capabilities. It provides:

1. **Document Management Tools**:
   - Add documents with metadata and content
   - Search documents using embeddings and vector similarity
   - List and retrieve document metadata

2. **Search Capabilities**:
   - Embedding-based semantic search
   - Vector similarity scoring
   - Content filtering and ranking

3. **MCP Protocol Implementation**:
   - Tools for document operations
   - Resources for document access
   - Proper error handling and validation

## Key Technologies
- **MCP SDK**: @modelcontextprotocol/sdk for protocol implementation
- **TypeScript**: Type-safe development
- **Zod**: Runtime type validation
- **Embeddings**: Text embedding for semantic search
- **File System**: Local document storage and indexing

## Development Guidelines
- Follow TypeScript best practices
- Use Zod for input validation
- Implement proper error handling
- Maintain compatibility with MCP protocol
- Keep embeddings functionality optional/configurable
