# Security Policy

## Supported Versions

We actively maintain and provide security updates for the following versions of the MCP Documentation Server:

| Version | Supported          | Notes                                    |
| ------- | ------------------ | ---------------------------------------- |
| 1.4.x   | :white_check_mark: | Current stable release                   |
| 1.3.x   | :white_check_mark: | Previous stable, security updates only   |
| 1.2.x   | :x:                | End of life, please upgrade              |
| 1.1.x   | :x:                | End of life, please upgrade              |
| 1.0.x   | :x:                | End of life, please upgrade              |
| < 1.0   | :x:                | Beta versions, not supported             |

**Recommendation**: Always use the latest stable version (1.4.x) for the best security and feature support.

## Security Considerations

### Data Storage
- All documents are stored locally in `~/.mcp-documentation-server/`
- No data is transmitted to external servers (except for embedding model downloads)
- Ensure proper file system permissions on the storage directory

### File Upload Security
- **Supported formats**: Only `.txt`, `.md`, and `.pdf` files are processed
- **PDF processing**: Uses `unpdf` library for safe text extraction without code execution
- **Security**: PDF processing uses a memory-safe library without known vulnerabilities
- **Malicious files**: Always validate uploaded content before processing
- **Path traversal**: The server restricts file access to designated directories only

### Network Security
- The server runs locally via stdio transport by default
- No network ports are opened unless explicitly configured
- MCP protocol communication is handled by the client (e.g., Claude Desktop)

### Embedding Models
- Models are downloaded from HuggingFace Hub on first use
- Verify model integrity if using custom embedding models
- Models run locally without sending data to external services

## Reporting a Vulnerability

We take security seriously and appreciate responsible disclosure of security vulnerabilities.

### How to Report

1. **Email**: Send details to [andreabravaccino@gmail.com] (replace with your actual email)
2. **GitHub Issues**: For non-sensitive issues, you can use our [issue tracker](https://github.com/andrea9293/mcp-documentation-server/issues)
3. **Security Advisories**: For sensitive vulnerabilities, use GitHub's [private vulnerability reporting](https://github.com/andrea9293/mcp-documentation-server/security/advisories)

### What to Include

Please provide:
- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Suggested fix (if available)
- Your contact information for follow-up

### Response Timeline

- **Initial Response**: Within 48 hours of report
- **Status Updates**: Weekly updates on investigation progress
- **Resolution**: Target 30 days for fixes, depending on severity
- **Public Disclosure**: Coordinated disclosure after fix is available

### What to Expect

**If the vulnerability is accepted:**
- We'll work with you on a fix timeline
- Credit will be given in release notes (if desired)
- Security advisory will be published after resolution
- Affected versions will be clearly documented

**If the vulnerability is declined:**
- Clear explanation of why it's not considered a security issue
- Alternative solutions or mitigations (if applicable)
- Guidance on proper usage to avoid the reported concern

## Security Best Practices

### For Users
- Keep the server updated to the latest version
- Regularly review uploaded documents and clean up unused files
- Use proper file system permissions for the storage directory
- Validate document sources before processing
- Monitor system resources during embedding generation

### For Developers
- Follow secure coding practices
- Validate all inputs before processing
- Keep dependencies updated
- Run security audits regularly (`npm audit`)
- Test with various file types and sizes

## Scope

This security policy covers:
- The MCP Documentation Server codebase
- Direct dependencies and their known vulnerabilities
- File processing and storage mechanisms
- MCP protocol implementation

**Out of scope:**
- Third-party MCP clients (e.g., Claude Desktop)
- Operating system security
- Network infrastructure
- Embedding model training data or algorithms

## Contact

For security-related questions or concerns:
- **General Security**: [andreabravaccino@gmail.com]
- **Project Maintainer**: [@andrea9293](https://github.com/andrea9293)
- **Repository**: [mcp-documentation-server](https://github.com/andrea9293/mcp-documentation-server)

---

*Last updated: June 16, 2025*
