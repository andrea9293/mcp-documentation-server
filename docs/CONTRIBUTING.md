# Contributing to MCP Documentation Server

🎉 Thank you for your interest in contributing to the MCP Documentation Server! This project aims to provide a robust, TypeScript-based Model Context Protocol server for document management and semantic search.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)
- [Release Process](#release-process)
- [Project Structure](#project-structure)

## Code of Conduct

This project follows a standard code of conduct. Please be respectful and constructive in all interactions. We're here to build something great together! 🚀

## Getting Started

### Prerequisites

- **Node.js** >= 22.0.0
- **npm** >= 10.0.0
- **Git** for version control
- Basic knowledge of TypeScript and the [Model Context Protocol](https://modelcontextprotocol.io/)

### Types of Contributions

We welcome various types of contributions:

- 🐛 **Bug fixes**
- ✨ **New features** 
- 📚 **Documentation improvements**
- 🎨 **Code quality improvements**
- 🔧 **Performance optimizations**
- 🧪 **Test additions**
- 🌐 **Embedding model support**
- 📄 **File format support** (beyond .txt, .md, .pdf)

## Development Setup

### 1. Fork & Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/mcp-documentation-server.git
cd mcp-documentation-server

# Add upstream remote
git remote add upstream https://github.com/andrea9293/mcp-documentation-server.git
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Verify Setup

```bash
# Build the project
npm run build

# Run in development mode
npm run dev

# Test the inspector
npm run inspect
```

### 4. Environment Setup

Create a `.env` file for local development (optional):
```bash
MCP_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
```

## Development Workflow

### Daily Development

```bash
# Start development server with hot reload
npm run dev

# Build and test changes
npm run build

# Inspect MCP tools (opens web interface)
npm run inspect

# Run direct without FastMCP wrapper
npm run dev:direct
```

### Making Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. **Make your changes** following our [code standards](#code-standards)

3. **Test your changes**:
   ```bash
   npm run build
   npm run inspect  # Test MCP functionality
   ```

4. **Commit with conventional commits**:
   ```bash
   git commit -m "feat: add PDF text extraction support"
   git commit -m "fix: resolve embedding model initialization error"
   git commit -m "docs: update README with new features"
   ```

## Code Standards

### TypeScript Guidelines

- **Strict mode**: Use TypeScript strict mode settings
- **Type safety**: Prefer explicit types over `any`
- **Interfaces**: Use interfaces for object shapes
- **Async/await**: Prefer async/await over Promises
- **Error handling**: Always handle errors appropriately

### Code Style

```typescript
// ✅ Good
interface DocumentMetadata {
    source: string;
    processedAt: string;
    fileExtension: string;
}

async function processDocument(content: string): Promise<Document> {
    try {
        const chunks = await this.createChunks(content);
        return { /* ... */ };
    } catch (error) {
        throw new Error(`Failed to process document: ${error.message}`);
    }
}

// ❌ Avoid
function processDoc(content: any) {
    // No error handling, no types
    const chunks = this.createChunks(content);
    return chunks;
}
```

### File Organization

- **Single responsibility**: One class/function per file when appropriate
- **Clear naming**: Use descriptive file and function names
- **Imports**: Group imports (external libraries, internal modules)
- **Exports**: Use named exports when possible

### Documentation

- **JSDoc comments** for public methods and classes
- **README updates** for new features
- **Inline comments** for complex logic
- **Type annotations** for better IDE support

## Testing

Currently, the project uses manual testing through the MCP inspector. We welcome contributions to improve our testing strategy:

### Manual Testing Checklist

- [ ] Document upload (.txt, .md, .pdf)
- [ ] Semantic search functionality
- [ ] Document listing and retrieval
- [ ] Error handling for malformed files
- [ ] Embedding model initialization
- [ ] Directory creation and permissions

### Future Testing Goals

- Unit tests for core functions
- Integration tests for MCP protocol
- Performance tests for large documents
- Automated testing in CI/CD

## Pull Request Process

### Before Submitting

1. **Sync with upstream**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Ensure build passes**:
   ```bash
   npm run build
   ```

3. **Test manually** using `npm run inspect`

4. **Update documentation** if needed

### PR Requirements

- **Clear title**: Use conventional commit format
- **Description**: Explain what, why, and how
- **Testing**: Describe how you tested the changes
- **Breaking changes**: Clearly mark any breaking changes
- **Screenshots**: Include for UI changes (inspector interface)

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Testing
- [ ] Built successfully (`npm run build`)
- [ ] Tested with MCP inspector (`npm run inspect`)
- [ ] Manual testing performed
- [ ] No breaking changes (or clearly documented)

## Screenshots (if applicable)

## Additional Notes
```

## Issue Guidelines

### Bug Reports

Use this template for bug reports:

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Upload file type '...'
2. Run command '...'
3. See error

**Expected behavior**
What you expected to happen.

**Environment:**
- OS: [e.g. Windows 11, macOS 14, Ubuntu 22.04]
- Node.js version: [e.g. 22.0.0]
- Package version: [e.g. 1.4.0]

**Additional context**
Add any other context about the problem here.
```

### Feature Requests

```markdown
**Is your feature request related to a problem?**
A clear description of what the problem is.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Alternative solutions or features you've considered.

**Additional context**
Add any other context or screenshots about the feature request.
```

## Release Process

This project uses **semantic-release** for automated releases:

### Commit Message Format

We follow [Conventional Commits](https://conventionalcommits.org/):

- `feat:` - New features (minor version bump)
- `fix:` - Bug fixes (patch version bump)  
- `docs:` - Documentation changes
- `style:` - Code formatting changes
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Build process or auxiliary tool changes

### Breaking Changes

For breaking changes, add `BREAKING CHANGE:` in the commit body:

```bash
feat: change document storage format

BREAKING CHANGE: Document storage format has changed. 
Existing documents need to be re-imported.
```

### Release Flow

1. **Merge to main** triggers semantic-release
2. **Version bump** based on conventional commits
3. **CHANGELOG.md** automatically updated
4. **NPM package** published automatically
5. **GitHub release** created with notes

## Project Structure

```
src/
├── server.ts              # Main MCP server implementation
├── document-manager.ts    # Document storage and retrieval
├── embedding-provider.ts  # AI embedding abstraction
├── search-engine.ts       # Semantic search functionality
├── types.ts              # TypeScript type definitions
└── utils.ts              # Utility functions

.github/
├── workflows/            # CI/CD workflows
└── copilot-instructions.md

docs/
├── README.md
├── SECURITY.md
└── CONTRIBUTING.md (this file)
```

### Key Components

- **FastMCP**: Framework for building MCP servers
- **@xenova/transformers**: Local AI embedding models
- **pdf-ts**: PDF text extraction
- **Zod**: Runtime type validation

## Getting Help

- 📖 **Documentation**: Check the [README](README.md) first
- 🐛 **Issues**: [GitHub Issues](https://github.com/andrea9293/mcp-documentation-server/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/andrea9293/mcp-documentation-server/discussions)
- 📧 **Email**: [your.email@example.com] for sensitive questions

## Recognition

Contributors will be recognized in:
- Release notes for their contributions
- GitHub contributors list
- Special thanks in major releases

---

**Happy Contributing!** 🎉

*Let's build an amazing MCP documentation server together!*
