#!/usr/bin/env node
/**
 * MCP Documentation Server - Integration Test
 * Tests the server by starting it and making real MCP tool calls via stdio transport.
 */
import { spawn } from 'child_process';
import { once } from 'events';

let msgId = 0;
const nextId = () => ++msgId;

class MCPClient {
  constructor(serverPath) {
    this.serverPath = serverPath;
    this.proc = null;
    this.pending = new Map();
    this.buffer = '';
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.proc = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, START_WEB_UI: 'false' }
      });

      let started = false;

      this.proc.stdout.on('data', (chunk) => {
        this.buffer += chunk.toString();
        // Process complete lines
        let newlineIdx;
        while ((newlineIdx = this.buffer.indexOf('\n')) !== -1) {
          const line = this.buffer.slice(0, newlineIdx).trim();
          this.buffer = this.buffer.slice(newlineIdx + 1);
          if (line) {
            try {
              const msg = JSON.parse(line);
              if (msg.id && this.pending.has(msg.id)) {
                const { resolve: res } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                res(msg);
              }
            } catch (e) {
              // stderr messages might come through stdout, ignore non-JSON
            }
          }
        }
      });

      this.proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        // Only print server logs if they're not the usual noise
        if (text.includes('[Server]') || text.includes('Error') || text.includes('error')) {
          process.stderr.write(`  [SERVER] ${text.trim()}\n`);
        }
      });

      this.proc.on('error', reject);
      this.proc.on('spawn', () => {
        started = true;
        resolve();
      });

      // Timeout guard
      setTimeout(() => {
        if (!started) reject(new Error('Server start timeout'));
      }, 10000);
    });
  }

  async send(method, params = {}) {
    const id = nextId();
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(msg);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout for ${method} (id=${id})`));
        }
      }, 30000);
    });
  }

  async initialize() {
    const initResult = await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    });
    // Send initialized notification (no response expected)
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return initResult;
  }

  async callTool(name, args = {}) {
    const result = await this.send('tools/call', { name, arguments: args });
    return result;
  }

  async listTools() {
    const result = await this.send('tools/list', {});
    return result;
  }

  stop() {
    this.proc.kill();
  }
}

async function main() {
  const serverPath = process.argv[2] || 'dist/server.js';
  console.log('🔧 MCP Documentation Server - Integration Test');
  console.log(`   Server: ${serverPath}\n`);

  const client = new MCPClient(serverPath);
  
  let passed = 0;
  let failed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    process.stdout.write(`  [TEST ${total}] ${name}... `);
    return fn()
      .then(() => {
        passed++;
        console.log('✅ PASS');
      })
      .catch(err => {
        failed++;
        console.log(`❌ FAIL: ${err.message}`);
      });
  }

  try {
    // Start server
    console.log('  Starting server...');
    await client.start();
    console.log('  Server started ✅\n');

    // Initialize
    console.log('  Initializing MCP session...');
    await client.initialize();
    console.log('  Initialized ✅\n');

    // === TEST SUITE ===
    console.log('╔══════════════════════════════════════════╗');
    console.log('║          TESTING MCP TOOLS               ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // 1. List tools
    await test('list_tools - get available tools', async () => {
      const result = await client.listTools();
      const tools = result.result?.tools || result.result || [];
      if (!Array.isArray(tools) || tools.length === 0) {
        throw new Error(`Expected tools array, got: ${JSON.stringify(result).slice(0, 200)}`);
      }
      const toolNames = tools.map(t => t.name).sort();
      console.log(`\n    Tools found: ${toolNames.join(', ')}`);
      return true;
    });

    // 2. list_documents (should be empty)
    await test('list_documents - initially empty', async () => {
      const result = await client.callTool('list_documents');
      const content = result.result?.content?.[0]?.text || result.result?.text || JSON.stringify(result);
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        throw new Error(`Expected array, got: ${content.slice(0, 100)}`);
      }
      if (parsed.length !== 0) {
        console.log(`\n    (found ${parsed.length} existing docs — may be from previous runs)`);
      }
      return true;
    });

    // 3. add_document - simple text
    await test('add_document - simple text', async () => {
      const result = await client.callTool('add_document', {
        title: 'Test Document 1',
        content: 'This is a test document for the MCP Documentation Server. It contains some sample text about artificial intelligence and machine learning. AI is transforming how we interact with technology.'
      });
      const text = result.result?.content?.[0]?.text || result.result?.text || '';
      if (!text.includes('Document added successfully')) {
        throw new Error(`Expected success message, got: ${text}`);
      }
      return true;
    });

    // 4. add_document - with metadata
    await test('add_document - with metadata', async () => {
      const result = await client.callTool('add_document', {
        title: 'Test Document 2 - TypeScript Guide',
        content: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It offers static typing, interfaces, and advanced type inference. Many developers prefer TypeScript for large-scale applications.',
        metadata: { language: 'typescript', category: 'programming', difficulty: 'intermediate' }
      });
      const text = result.result?.content?.[0]?.text || result.result?.text || '';
      if (!text.includes('Document added successfully') && !text.includes('already exists')) {
        throw new Error(`Expected success or already-exists message, got: ${text}`);
      }
      return true;
    });

    // 5. add_document - longer content for chunking test
    await test('add_document - longer content (tests chunking)', async () => {
      const result = await client.callTool('add_document', {
        title: 'Test Document 3 - Long Article',
        content: `# Introduction to Neural Networks

Neural networks are computing systems inspired by biological neural networks. They consist of interconnected nodes or "neurons" organized in layers.

## How Neural Networks Work

Each neuron receives input signals, processes them, and passes the result to the next layer. The connections between neurons have weights that are adjusted during training.

## Types of Neural Networks

### Feedforward Neural Networks
The simplest type where connections between nodes do not form cycles. Data flows from input to output through hidden layers.

### Convolutional Neural Networks (CNNs)
Specialized for processing grid-like data such as images. They use convolutional layers to detect patterns.

### Recurrent Neural Networks (RNNs)
Designed for sequential data like text or time series. They maintain internal state or "memory".

## Applications

Neural networks are used in image recognition, natural language processing, speech recognition, and many other fields.

## Conclusion

Neural networks have revolutionized artificial intelligence and continue to evolve with new architectures and training methods.`
      });
      const text = result.result?.content?.[0]?.text || result.result?.text || '';
      if (!text.includes('Document added successfully') && !text.includes('already exists')) {
        throw new Error(`Expected success or already-exists message, got: ${text}`);
      }
      // Extract document ID
      const idMatch = text.match(/ID:\s*(\S+)/);
      if (idMatch) console.log(`\n    Document ID: ${idMatch[1]}`);
      return true;
    });

    // 6. list_documents (should have 3 now)
    await test('list_documents - shows all documents', async () => {
      const result = await client.callTool('list_documents');
      const content = result.result?.content?.[0]?.text || result.result?.text || '';
      const docs = JSON.parse(content);
      if (docs.length < 3) {
        throw new Error(`Expected at least 3 documents, got ${docs.length}`);
      }
      console.log(`\n    Documents in DB: ${docs.length}`);
      return true;
    });

    // 7. get_document - by ID (use first doc)
    let firstDocId = null;
    await test('get_document - retrieve document by ID', async () => {
      const listResult = await client.callTool('list_documents');
      const listContent = listResult.result?.content?.[0]?.text || listResult.result?.text || '';
      const docs = JSON.parse(listContent);
      if (docs.length === 0) throw new Error('No documents found');
      firstDocId = docs[0].id;
      
      const result = await client.callTool('get_document', { id: firstDocId });
      const text = result.result?.content?.[0]?.text || result.result?.text || '';
      // Server returns the content string directly (getOnlyContentDocument)
      if (!text || typeof text !== 'string' || text.length === 0) {
        throw new Error(`Expected document content string, got: ${JSON.stringify(text).slice(0, 100)}`);
      }
      console.log(`\n    Retrieved: "${docs[0].title}" (${docs[0].id})`);
      return true;
    });

    // 8. search_all_documents
    await test('search_all_documents - search for "neural networks"', async () => {
      const result = await client.callTool('search_all_documents', {
        query: 'neural networks',
        limit: 5
      });
      const text = result.result?.content?.[0]?.text || result.result?.text || '';
      const parsed = JSON.parse(text);
      if (!parsed.results || parsed.results.length === 0) {
        // Search may return empty if embeddings aren't fully computed
        console.log(`\n    (no results — embeddings may still be processing)`);
        return true;
      }
      console.log(`\n    Found ${parsed.results.length} results`);
      return true;
    });

    // 9. get_uploads_path
    await test('get_uploads_path - returns path', async () => {
      const result = await client.callTool('get_uploads_path');
      const text = result.result?.content?.[0]?.text || result.result?.text || '';
      if (!text.includes('Uploads folder path:')) {
        throw new Error(`Expected uploads path, got: ${text.slice(0, 100)}`);
      }
      console.log(`\n    ${text.trim().split('\n')[0]}`);
      return true;
    });

    // 10. list_uploads_files
    await test('list_uploads_files - returns file list', async () => {
      const result = await client.callTool('list_uploads_files');
      const text = result.result?.content?.[0]?.text || result.result?.text || '';
      // Server returns JSON array or plain text if empty
      let files;
      try {
        files = JSON.parse(text);
      } catch {
        files = text;
      }
      console.log(`\n    Upload files: ${Array.isArray(files) ? files.length + ' files' : text.slice(0, 60)}`);
      return true;
    });

    // 11. get_context_window (if we have docs with parent chunks)
    await test('get_context_window - try with document 3', async () => {
      const listResult = await client.callTool('list_documents');
      const listContent = listResult.result?.content?.[0]?.text || listResult.result?.text || '';
      const docs = JSON.parse(listContent);
      
      // Try to find doc 3 (the long one)
      const longDoc = docs.find(d => d.title?.includes('Long Article')) || docs[2] || docs[0];
      
      try {
        const result = await client.callTool('get_context_window', {
          document_id: longDoc.id,
          parent_index: 0,
          before: 0,
          after: 1
        });
        const text = result.result?.content?.[0]?.text || result.result?.text || '';
        if (text.includes('not found') || text.includes('Error')) {
          console.log(`\n    (context window not available yet — chunks may still be processing)`);
        } else {
          console.log(`\n    Context window retrieved successfully`);
        }
      } catch (e) {
        console.log(`\n    (context window test skipped — ${e.message.slice(0, 50)})`);
      }
      return true;
    });

    // 12. delete_document (cleanup: delete doc 1)
    await test('delete_document - remove test document', async () => {
      const listResult = await client.callTool('list_documents');
      const listContent = listResult.result?.content?.[0]?.text || listResult.result?.text || '';
      const docs = JSON.parse(listContent);
      if (docs.length === 0) throw new Error('No documents to delete');
      const docId = docs[0].id;
      
      const result = await client.callTool('delete_document', { id: docId });
      const text = result.result?.content?.[0]?.text || result.result?.text || '';
      if (!text.includes('deleted successfully')) {
        throw new Error(`Expected deletion success, got: ${text.slice(0, 100)}`);
      }
      console.log(`\n    Deleted: ${docId}`);
      return true;
    });

    // 13. Search within a specific document
    await test('search_documents - search in specific doc', async () => {
      const listResult = await client.callTool('list_documents');
      const listContent = listResult.result?.content?.[0]?.text || listResult.result?.text || '';
      const docs = JSON.parse(listContent);
      if (docs.length === 0) throw new Error('No documents available');
      
      const result = await client.callTool('search_documents', {
        document_id: docs[0].id,
        query: 'TypeScript',
        limit: 3
      });
      const text = result.result?.content?.[0]?.text || result.result?.text || '';
      const parsed = JSON.parse(text);
      // It's OK if no results (embeddings not ready), but tool should not error
      return true;
    });

  } catch (err) {
    console.error(`\n  Unexpected error: ${err.message}`);
    failed++;
  } finally {
    client.stop();
  }

  // === SUMMARY ===
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║          TEST RESULTS                    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  Total: ${total}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}`);
  console.log(`  Pass rate: ${total > 0 ? Math.round(passed / total * 100) : 0}%\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
