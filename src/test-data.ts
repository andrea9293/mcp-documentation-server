import { readFileSync } from 'fs';
import path from 'path';

// Sample document data for testing
const testDocument = {
  title: "Technical Documentation Guide",
  content: readFileSync(path.join(process.cwd(), 'test-document.md'), 'utf-8'),
  metadata: {
    category: "technical-documentation",
    tags: ["programming", "development", "best-practices", "ai", "cloud"],
    difficulty: "intermediate",
    last_updated: "2025-06-15",
    author: "Test User"
  }
};

// Test queries for semantic search
const testQueries = [
  "REST API development frameworks",
  "artificial intelligence machine learning",
  "JavaScript TypeScript Node.js",
  "cloud services scalability",
  "database design patterns",
  "authentication security",
  "microservices architecture"
];

console.log('=== MCP Documentation Server Test Data ===\n');

console.log('1. Test Document to Add:');
console.log(JSON.stringify(testDocument, null, 2));

console.log('\n2. Test Search Queries:');
testQueries.forEach((query, index) => {
  console.log(`   ${index + 1}. "${query}"`);
});

console.log('\n3. To test the server:');
console.log('   - Start the server with: npm run dev');
console.log('   - Use the FastMCP CLI to test tools');
console.log('   - Add the document using add_document tool');
console.log('   - Search using the queries above');
console.log('   - List documents and get specific documents by ID');

export { testDocument, testQueries };
