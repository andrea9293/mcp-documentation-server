# Testing Instructions for MCP Documentation Server with Chunking

## How to Test the Server

### 1. Start the Server
```bash
npm run inspect   
```

## New Chunking System

The server now automatically splits documents into chunks when adding them. Each chunk:
- Contains ~200 characters of content
- Is split on sentence boundaries
- Has its own embedding for semantic search
- Can be searched independently within a document

### 2. Test Tools

#### Add Document Tool
When you add a document, it will automatically be split into chunks:

```json
{
  "title": "Technical Documentation Guide",
  "content": "This is a comprehensive test document...",
  "metadata": {
    "category": "technical-documentation",
    "tags": ["programming", "development", "best-practices", "ai", "cloud"],    "difficulty": "intermediate",
    "last_updated": "2025-06-15",
    "author": "Test User"
  }
}
```

#### Search Documents Tool
**NEW**: Now requires a document_id and returns chunks instead of full documents:

1. **Python Search Query**:
   ```json
   {
     "document_id": "zddymz2x0",
     "query": "Python programming language",
     "limit": 5
   }
   ```

2. **Machine Learning Query**:
   ```json
   {
     "document_id": "zddymz2x0", 
     "query": "artificial intelligence machine learning",
     "limit": 3
   }
   ```

3. **JavaScript Query**:
   ```json
   {
     "document_id": "zddymz2x0",
     "query": "JavaScript TypeScript Node.js",
     "limit": 5
   }
   ```

4. **Cloud Computing Query**:
   ```json
   {
     "query": "cloud services scalability",
     "limit": 5
   }
   ```

#### List Documents Tool
```json
{}
```

#### Get Document Tool
Replace `{document_id}` with the actual ID returned from add_document:
```json
{
  "id": "{document_id}"
}
```

## New Upload Functionality

### Upload Folder Management
The server now supports a dedicated uploads folder for manual file uploads:

- **Supported formats**: `.txt` and `.md` files
- **Automatic processing**: Files are converted to chunks with embeddings
- **Overwrite protection**: Files with the same name replace previous versions

### New Tools

#### 1. Get Uploads Path
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_uploads_path",
    "arguments": {}
  }
}
```
Returns the absolute path where you can place your files.

#### 2. List Uploads Files
```json
{
  "method": "tools/call",
  "params": {
    "name": "list_uploads_files", 
    "arguments": {}
  }
}
```
Shows all files in the uploads folder with their status.

#### 3. Process Uploads
```json
{
  "method": "tools/call",
  "params": {
    "name": "process_uploads",
    "arguments": {}
  }
}
```
Processes all supported files and creates embeddings.

### Workflow

1. **Get the uploads path** using `get_uploads_path`
2. **Place your .txt or .md files** in that folder
3. **Check files** with `list_uploads_files`
4. **Process files** with `process_uploads`
5. **Search documents** normally with the document IDs

### Updated Search Parameters

Search now uses **700-character chunks** (increased from 200) for better context.

### 3. Expected Results

- **Add Document**: Should return a success message with the document ID
- **Search Documents**: Should return relevant documents with similarity scores
- **List Documents**: Should show all documents with previews
- **Get Document**: Should return the complete document data

### 4. Testing Scenarios

1. **Add the test document** using the add_document tool
2. **Search for different topics** to test semantic search
3. **List all documents** to verify storage
4. **Retrieve specific document** by ID
5. **Test edge cases** like empty searches or invalid IDs

### 5. Verification Points

- Documents are saved to the `./data` directory as JSON files
- Search results include similarity scores
- Metadata is preserved and searchable
- Content previews are properly truncated
- Error handling works for invalid inputs

This testing approach will validate all the core functionality of the MCP Documentation Server.
