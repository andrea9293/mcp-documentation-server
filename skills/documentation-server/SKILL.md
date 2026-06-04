---
name: documentation-server
description: Use when you need to store, retrieve, search, or manage documents in a local knowledge base with semantic search and hybrid (vector + full-text) retrieval. Also use when interacting with the documentation server web interface, managing uploads, or performing AI-powered document analysis. Use this instead of MCP-native tool definitions when context efficiency is a concern.
---

# Documentation Server — REST API Skill

## Overview

This server provides a **local-first knowledge base** with semantic search, parent-child chunking, and an embedded vector database (Orama). Every operation available through the MCP protocol is also accessible via a **REST API** on `http://127.0.0.1:3080/api/`.

Calling the REST API directly (with `curl` or your agent's HTTP tool) is **more token-efficient** than loading MCP tool schemas — only the response JSON enters context, not the tool definitions.

## When to Use

- You need to add, retrieve, search, or delete documents in the knowledge base
- You want **semantic search** (vector similarity) across one or all documents
- You need to **retrieve context windows** around matched chunks for richer LLM context
- You need to **manage uploads**: list files, process them into documents, or get the uploads path
- You want the **web UI** to browse documents visually, upload files via drag-and-drop, or explore search results interactively
- Context token budget is tight and you want to avoid MCP tool schema overhead

**When NOT to use**: If the server isn't running and you cannot start it (no `npx`/Node.js available), fall back to another documentation strategy.

## Web Interface

The server includes a full-featured **graphical web interface** at `http://127.0.0.1:3080` that runs automatically alongside the REST API. Use it for:

- **Dashboard** — overview of all documents and statistics
- **Documents** — browse, view, and delete documents visually
- **Add Document** — create documents with title, content, and metadata
- **Search** — semantic search across all or within a specific document
- **AI Search** — Gemini-powered analysis (if `GEMINI_API_KEY` is set)
- **Upload Files** — drag-and-drop `.txt`, `.md`, or `.pdf` files
- **Context Window** — explore chunks around a specific index interactively

The REST API is for programmatic access; the web UI is for visual exploration and one-off operations.

## Server Lifecycle

### 1. Check if the server is already running

```bash
curl -s http://127.0.0.1:3080/api/config
```

If you get a JSON response, the server is active. If the connection fails, proceed to start it.

### 2. Start the server (if inactive)

```bash
# Start in background, redirect logs to a temp file
npx -y @andrea9293/mcp-documentation-server > /tmp/doc-server.log 2>&1 &

# Wait for startup (embedding model download may take a few extra seconds on first run)
sleep 5
```

Then **verify** with the check step above. Retry after a few seconds if the model is still downloading.

### 3. Optional: stop the server

```bash
pkill -f "@andrea9293/mcp-documentation-server" || true
```

The server is safe to leave running in the background between sessions.

## API Reference

All endpoints are on `http://127.0.0.1:3080/api/`. All POST endpoints accept `Content-Type: application/json`.

### Document CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/documents` | List all documents |
| `GET` | `/api/documents/:id` | Get a document's full content |
| `POST` | `/api/documents` | Add a new document |
| `DELETE` | `/api/documents/:id` | Delete a document |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/search` | Semantic search within a single document |
| `POST` | `/api/search-all` | Hybrid search across all documents |
| `POST` | `/api/context-window` | Get surrounding chunks around a matched section |
| `POST` | `/api/search-ai` | AI-powered analysis (requires `GEMINI_API_KEY`) |

### Uploads

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/uploads` | List files in the uploads folder |
| `GET` | `/api/uploads/path` | Get the uploads directory path |
| `POST` | `/api/uploads/process` | Process all pending upload files into documents |
| `POST` | `/api/uploads/upload` | Upload files via multipart form |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Server configuration (embedding model, Gemini availability) |

## Example Usage

### List all documents

```bash
curl -s http://127.0.0.1:3080/api/documents
```

### Add a document

```bash
curl -s -X POST http://127.0.0.1:3080/api/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Document Title",
    "content": "Full document content here...",
    "metadata": { "source": "web", "tags": ["reference"] }
  }'
```

### Search across all documents (hybrid search)

```bash
curl -s -X POST http://127.0.0.1:3080/api/search-all \
  -H "Content-Type: application/json" \
  -d '{"query": "your search query here", "limit": 10}'
```

Each result includes:
- `content` — the matched text chunk
- `score` — relevance score (0-1, higher = more relevant)
- `document_id` — ID of the document this chunk belongs to
- `parent_index` — chunk index within the document (needed for context window queries)

### Get a document's full content by ID

```bash
curl -s http://127.0.0.1:3080/api/documents/DOCUMENT_ID_HERE
```

Note: returns a **single object**, not an array.

### Search within a specific document

```bash
curl -s -X POST http://127.0.0.1:3080/api/search \
  -H "Content-Type: application/json" \
  -d '{"document_id": "DOCUMENT_ID_HERE", "query": "search term", "limit": 5}'
```

### Get context window around a chunk

After search results give you a `document_id` and `parent_index`, expand the context:

```bash
curl -s -X POST http://127.0.0.1:3080/api/context-window \
  -H "Content-Type: application/json" \
  -d '{"document_id": "DOCUMENT_ID_HERE", "parent_index": 3, "before": 2, "after": 2}'
```

### Delete a document

```bash
curl -s -X DELETE http://127.0.0.1:3080/api/documents/DOCUMENT_ID_HERE
```

### Process uploads folder

```bash
curl -s -X POST http://127.0.0.1:3080/api/uploads/process
```

### List uploads

```bash
curl -s http://127.0.0.1:3080/api/uploads
```

### Get uploads path

```bash
curl -s http://127.0.0.1:3080/api/uploads/path
```

### Check server configuration

```bash
curl -s http://127.0.0.1:3080/api/config
```

Returns server metadata: embedding model, Gemini availability, chunking settings.

### AI-powered search (requires GEMINI_API_KEY)

```bash
curl -s -X POST http://127.0.0.1:3080/api/search-ai \
  -H "Content-Type: application/json" \
  -d '{"document_id": "DOCUMENT_ID_HERE", "query": "what does this document say about X?"}'
```

Returns an AI-generated answer grounded in the document content.

## Best Practices

1. **Always check if the server is running before making requests.** Start it if inactive. A running server is safe to keep between sessions.

2. **Prefer calling the REST API over MCP tool definitions** — the REST API returns JSON directly without the overhead of loading tool schemas into the agent's context window.

3. **Keep output minimal.** For lists: just IDs and titles. For search: scores and truncated content snippets (~200 chars is usually enough). For errors: the error message.

4. **Handle the `limit` parameter.** Default is 10. Increase for exhaustive searches, decrease for quick lookups.

5. **Use the web UI** (`http://127.0.0.1:3080`) for visual browsing, drag-and-drop uploads, and one-off operations. The REST API is for programmatic access.

6. **Document IDs are opaque strings** (e.g. `4ecc2235ec887d3e`). Always list documents first to get the correct ID.

7. **First startup may be slow** because the embedding model (~80 MB) is downloaded from Hugging Face. Subsequent starts are fast.

8. **The server prints startup info to stdout.** When started in background with `> /tmp/doc-server.log`, these logs don't clutter the terminal.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting to start the server | Always check `/api/config` first; start if it fails |
| Not waiting for model download on first run | Use `sleep 5` after starting; verify with the check step |
| Using wrong document ID | Always get the ID from `list` or `search` results first |
| Printing raw JSON in conversation | Log only what you need (IDs, scores, truncated snippets) |
| Expecting array from single-document GET | `GET /api/documents/:id` returns a **single object**, not an array |
| Putting the server on a different port | Default is 3080; override with `WEB_PORT` env var |

## Response Formats

All endpoints return JSON. Typical response shapes:

- **List documents:** `[{id, title, ...}]`
- **Single document:** `{id, title, content, metadata, createdAt}`
- **Add document:** `{success, id, title}`
- **Search results:** `[{content, score, document_id, parent_index, ...}]`
- **Context window:** `{parents: [{index, content, ...}], ...}`
- **Delete:** `{success, message}`
- **Error:** `{error: "message"}`
