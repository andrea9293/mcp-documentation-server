import * as path from 'path';
import * as os from 'os';

/**
 * Get the default data directory for the server
 */
export function getDefaultDataDir(): string {
    // Check for MCP_BASE_DIR environment variable first
    const baseDir = process.env.MCP_BASE_DIR?.trim();
    if (baseDir) {
        return baseDir;
    }
    
    // Fall back to home directory
    const homeDir = os.homedir();
    return path.join(homeDir, '.mcp-documentation-server');
}

/**
 * Sanitize filename by removing invalid characters
 */
export function sanitizeFilename(filename: string): string {
    return filename.replace(/[<>:"/\\|?*]/g, '_').trim();
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Truncate text to specified length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Extract meaningful excerpt from text around search terms
 */
export function extractExcerpt(text: string, searchTerms: string[], maxLength: number = 200): string {
    if (!searchTerms.length) {
        return truncateText(text, maxLength);
    }

    const lowerText = text.toLowerCase();
    const lowerTerms = searchTerms.map(term => term.toLowerCase());

    // Find the first occurrence of any search term
    let firstIndex = -1;
    for (const term of lowerTerms) {
        const index = lowerText.indexOf(term);
        if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
            firstIndex = index;
        }
    }

    if (firstIndex === -1) {
        return truncateText(text, maxLength);
    }

    // Calculate excerpt boundaries
    const halfLength = Math.floor(maxLength / 2);
    const start = Math.max(0, firstIndex - halfLength);
    const end = Math.min(text.length, start + maxLength);

    let excerpt = text.substring(start, end);

    // Add ellipsis if truncated
    if (start > 0) excerpt = '...' + excerpt;
    if (end < text.length) excerpt = excerpt + '...';

    return excerpt;
}

/**
 * Validate document content type
 */
export function validateContentType(contentType: string): boolean {
    const validTypes = [
        'text/plain',
        'text/markdown',
        'text/html',
        'application/json',
        'application/xml',
        'text/csv'
    ];
    return validTypes.includes(contentType);
}

/**
 * Infer content type from file extension or content
 */
export function inferContentType(filename: string, content: string): string {
    const ext = path.extname(filename).toLowerCase();

    switch (ext) {
        case '.md':
        case '.markdown':
            return 'text/markdown';
        case '.html':
        case '.htm':
            return 'text/html';
        case '.json':
            return 'application/json';
        case '.xml':
            return 'application/xml';
        case '.csv':
            return 'text/csv';
        default:
            // Try to infer from content
            if (content.trim().startsWith('<') && content.trim().endsWith('>')) {
                return 'text/html';
            }
            if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
                try {
                    JSON.parse(content);
                    return 'application/json';
                } catch {
                    // Not valid JSON
                }
            }
            return 'text/plain';
    }
}

/**
 * Clean and normalize text for processing
 */
export function normalizeText(text: string): string {
    return text
        .replace(/\r\n/g, '\n')  // Normalize line endings
        .replace(/\t/g, '  ')    // Replace tabs with spaces
        .trim();
}

/**
 * Calculate similarity score as percentage
 */
export function formatSimilarityScore(score: number): string {
    return `${Math.round(score * 100)}%`;
}

/**
 * Convert Date to ISO string for JSON serialization
 */
export function serializeDate(date: Date): string {
    return date.toISOString();
}

/**
 * Parse ISO string back to Date
 */
export function parseDate(dateString: string): Date {
    return new Date(dateString);
}
