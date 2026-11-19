/**
 * Dependency-free Markdown renderer for the document viewer modal.
 *
 * The renderer builds DOM nodes directly instead of assembling HTML strings,
 * so stored documents can never inject scripts, event handlers or style
 * attributes into the dashboard. Only http(s), mailto, data:image and
 * relative URLs are accepted for links and images.
 *
 * It intentionally supports the subset of CommonMark/GFM that documentation
 * usually relies on: headings, paragraphs, lists, task lists, blockquotes,
 * fenced code, tables, horizontal rules, links, images, emphasis, inline code
 * and strikethrough.
 *
 * Usage:
 *   MarkdownPreview.isMarkdownDocument(doc)  // true when the doc looks like Markdown
 *   MarkdownPreview.render(markdownText)     // returns a DocumentFragment
 */
(function (global) {
    'use strict';

    const SAFE_SCHEME = /^(?:https?:|mailto:)/i;
    const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

    function safeUrl(url) {
        if (!url) return null;
        const value = String(url).trim();
        if (!value) return null;
        if (SCHEME.test(value)) return SAFE_SCHEME.test(value) ? value : null;
        return value;
    }

    function element(tag, className) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        return node;
    }

    // ============ INLINE PARSING ============

    function inlineNodes(text) {
        const nodes = [];
        let rest = String(text ?? '');
        let buffer = '';

        const flush = () => {
            if (buffer) {
                nodes.push(document.createTextNode(buffer));
                buffer = '';
            }
        };

        while (rest) {
            let matched = false;
            for (const rule of INLINE_RULES) {
                const match = rule.re.exec(rest);
                if (match && match[0].length) {
                    flush();
                    const node = rule.make(match);
                    if (node) nodes.push(node);
                    rest = rest.slice(match[0].length);
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                buffer += rest[0];
                rest = rest.slice(1);
            }
        }
        flush();
        return nodes;
    }

    function appendInline(parent, text) {
        for (const node of inlineNodes(text)) parent.appendChild(node);
        return parent;
    }

    function wrap(tag) {
        return (match) => appendInline(element(tag), match[1]);
    }

    function codeSpan(match) {
        const code = element('code');
        const value = match[2].replace(/^ (.*) $/, '$1');
        code.textContent = value;
        return code;
    }

    function link(match) {
        const href = safeUrl(match[2]);
        if (!href) return document.createTextNode(match[0]);
        const a = element('a');
        a.href = href;
        a.rel = 'noreferrer noopener';
        if (/^https?:/i.test(href)) a.target = '_blank';
        if (match[3]) a.title = match[3];
        appendInline(a, match[1]);
        return a;
    }

    function image(match) {
        const src = safeUrl(match[2]);
        if (!src || !/^(?:https?:|data:image\/)/i.test(src)) {
            return document.createTextNode(match[0]);
        }
        const img = element('img');
        img.src = src;
        img.alt = match[1] || '';
        img.loading = 'lazy';
        if (match[3]) img.title = match[3];
        return img;
    }

    const INLINE_RULES = [
        // Backslash escapes: \* -> *
        { re: /^\\([\\`*_{}\[\]()#+\-.!>~|])/, make: (m) => document.createTextNode(m[1]) },
        // Inline code
        { re: /^(`+)([\s\S]*?)\1(?!`)/, make: codeSpan },
        // Images before links
        { re: /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+["']([^"']*)["'])?\s*\)/, make: image },
        { re: /^\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+["']([^"']*)["'])?\s*\)/, make: link },
        // Autolinks
        {
            re: /^<((?:https?|mailto):[^\s>]+)>/,
            make: (m) => link([m[0], m[1], m[1], null])
        },
        // Bold, then italic
        { re: /^\*\*([\s\S]+?)\*\*/, make: wrap('strong') },
        { re: /^__([\s\S]+?)__/, make: wrap('strong') },
        { re: /^~~([\s\S]+?)~~/, make: wrap('del') },
        { re: /^\*(?!\s)([^*\n]+?)\*/, make: wrap('em') },
        { re: /^(?<![\p{L}\p{N}_])_(?!\s)([^_\n]+?)_(?![\p{L}\p{N}_])/u, make: wrap('em') }
    ];

    // ============ BLOCK HELPERS ============

    function isBlank(line) {
        return /^[ \t]*$/.test(line);
    }

    function isThematicBreak(line) {
        return /^[ \t]{0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
    }

    function isTableDelimiter(line) {
        if (!line.includes('|')) return false;
        return /^[ \t]{0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/.test(line);
    }

    const LIST_ITEM = /^([ \t]{0,3})([-*+]|\d{1,9}[.)])([ \t]+)([\s\S]*)$/;
    const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})([\s\S]*)$/;
    const HEADING = /^[ \t]{0,3}(#{1,6})[ \t]+([\s\S]*?)(?:[ \t]+#+[ \t]*)?$/;
    const BLOCKQUOTE = /^[ \t]{0,3}>/;

    function isBlockStart(line) {
        return HEADING.test(line)
            || FENCE.test(line)
            || BLOCKQUOTE.test(line)
            || isThematicBreak(line)
            || LIST_ITEM.test(line)
            || isTableDelimiter(line);
    }

    function splitTableRow(line) {
        let row = line.trim();
        if (row.startsWith('|')) row = row.slice(1);
        if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);

        const cells = [];
        let cell = '';
        for (let i = 0; i < row.length; i++) {
            const char = row[i];
            if (char === '\\' && row[i + 1] === '|') {
                cell += '\\|';
                i++;
                continue;
            }
            if (char === '|') {
                cells.push(cell.trim());
                cell = '';
                continue;
            }
            cell += char;
        }
        cells.push(cell.trim());
        return cells;
    }

    function tableAlignments(delimiterLine) {
        return splitTableRow(delimiterLine).map((cell) => {
            const left = cell.startsWith(':');
            const right = cell.endsWith(':');
            if (left && right) return 'center';
            if (right) return 'right';
            if (left) return 'left';
            return '';
        });
    }

    // ============ BLOCK PARSING ============

    function renderBlocks(lines) {
        const fragment = document.createDocumentFragment();
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            if (isBlank(line)) {
                i++;
                continue;
            }

            // Fenced code block
            const fence = FENCE.exec(line);
            if (fence) {
                const marker = fence[1][0];
                const length = fence[1].length;
                const info = fence[2].trim();
                const close = new RegExp('^[ \\t]{0,3}' + (marker === '`' ? '`' : '~') + '{' + length + ',}[ \\t]*$');
                const codeLines = [];
                i++;
                while (i < lines.length && !close.test(lines[i])) {
                    codeLines.push(lines[i]);
                    i++;
                }
                if (i < lines.length) i++;

                const pre = document.createElement('pre');
                const code = document.createElement('code');
                const language = info.split(/\s+/)[0];
                if (language) code.className = 'language-' + language.replace(/[^a-z0-9_+-]/gi, '');
                code.textContent = codeLines.join('\n');
                pre.appendChild(code);
                fragment.appendChild(pre);
                continue;
            }

            // Horizontal rule
            if (isThematicBreak(line)) {
                fragment.appendChild(document.createElement('hr'));
                i++;
                continue;
            }

            // ATX heading
            const heading = HEADING.exec(line);
            if (heading) {
                const node = appendInline(document.createElement('h' + heading[1].length), heading[2]);
                fragment.appendChild(node);
                i++;
                continue;
            }

            // Setext heading (paragraph underlined with === or ---)
            if (i + 1 < lines.length && /^[ \t]{0,3}(=+|-+)[ \t]*$/.test(lines[i + 1]) && !isBlockStart(line)) {
                const level = lines[i + 1].trim().startsWith('=') ? 1 : 2;
                fragment.appendChild(appendInline(document.createElement('h' + level), line.trim()));
                i += 2;
                continue;
            }

            // Blockquote
            if (BLOCKQUOTE.test(line)) {
                const quoteLines = [];
                while (i < lines.length && (BLOCKQUOTE.test(lines[i]) || (!isBlank(lines[i]) && !isBlockStart(lines[i]) && quoteLines.length > 0))) {
                    quoteLines.push(lines[i].replace(/^[ \t]{0,3}>[ \t]?/, ''));
                    i++;
                }
                const quote = document.createElement('blockquote');
                quote.appendChild(renderBlocks(quoteLines));
                fragment.appendChild(quote);
                continue;
            }

            // GFM table
            if (line.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
                const alignments = tableAlignments(lines[i + 1]);
                const table = document.createElement('table');
                const thead = document.createElement('thead');
                const headRow = document.createElement('tr');
                for (const [index, cell] of splitTableRow(line).entries()) {
                    const th = appendInline(document.createElement('th'), cell);
                    if (alignments[index]) th.style.textAlign = alignments[index];
                    headRow.appendChild(th);
                }
                thead.appendChild(headRow);
                table.appendChild(thead);

                const tbody = document.createElement('tbody');
                i += 2;
                while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
                    const tr = document.createElement('tr');
                    const cells = splitTableRow(lines[i]);
                    for (let c = 0; c < alignments.length; c++) {
                        const td = appendInline(document.createElement('td'), cells[c] || '');
                        if (alignments[c]) td.style.textAlign = alignments[c];
                        tr.appendChild(td);
                    }
                    tbody.appendChild(tr);
                    i++;
                }
                if (tbody.children.length) table.appendChild(tbody);
                fragment.appendChild(table);
                continue;
            }

            // Lists
            if (LIST_ITEM.test(line)) {
                const list = parseList(lines, i);
                fragment.appendChild(list.node);
                i = list.next;
                continue;
            }

            // Paragraph
            const paragraphLines = [];
            while (i < lines.length && !isBlank(lines[i]) && !(paragraphLines.length > 0 && isBlockStart(lines[i]))) {
                paragraphLines.push(lines[i]);
                i++;
            }
            const paragraph = document.createElement('p');
            appendParagraph(paragraph, paragraphLines.join('\n'));
            fragment.appendChild(paragraph);
        }

        return fragment;
    }

    function appendParagraph(parent, text) {
        // Two trailing spaces or a trailing backslash force a line break.
        const segments = text.split(/(?:[ \t]{2,}|\\)\n/);
        segments.forEach((segment, index) => {
            if (index > 0) parent.appendChild(document.createElement('br'));
            appendInline(parent, segment.replace(/\n/g, ' '));
        });
        return parent;
    }

    function unwrapParagraph(item) {
        const paragraph = Array.from(item.children).find((child) => child.tagName === 'P');
        if (!paragraph) return;
        while (paragraph.firstChild) item.insertBefore(paragraph.firstChild, paragraph);
        paragraph.remove();
    }

    function parseList(lines, start) {
        const first = LIST_ITEM.exec(lines[start]);
        const ordered = /\d/.test(first[2]);
        const list = document.createElement(ordered ? 'ol' : 'ul');
        if (ordered) {
            const startNumber = parseInt(first[2], 10);
            if (startNumber > 1) list.start = startNumber;
        }

        let i = start;
        while (i < lines.length) {
            const item = LIST_ITEM.exec(lines[i]);
            if (!item || /\d/.test(item[2]) !== ordered) break;

            const itemLines = [item[4]];
            let tight = true;
            i++;

            while (i < lines.length) {
                const current = lines[i];
                if (isBlank(current)) {
                    let lookahead = i;
                    while (lookahead < lines.length && isBlank(lines[lookahead])) lookahead++;
                    const isNested = lookahead < lines.length && /^[ \t]{2,}\S/.test(lines[lookahead]);
                    if (!isNested) break;
                    itemLines.push('');
                    tight = false;
                    i = lookahead;
                    continue;
                }
                if (LIST_ITEM.test(current) && !/^[ \t]{2,}/.test(current)) break;
                if (isBlockStart(current) && !LIST_ITEM.test(current)) break;
                itemLines.push(current.replace(/^[ \t]{2,}/, ''));
                i++;
            }

            const li = document.createElement('li');
            const task = /^\[([ xX])\][ \t]+([\s\S]*)$/.exec(itemLines[0]);
            if (task) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.disabled = true;
                checkbox.checked = task[1].toLowerCase() === 'x';
                li.appendChild(checkbox);
                li.appendChild(document.createTextNode(' '));
                itemLines[0] = task[2];
            }

            li.appendChild(renderBlocks(itemLines));
            if (tight) unwrapParagraph(li);
            list.appendChild(li);
        }

        return { node: list, next: i };
    }

    // ============ DETECTION ============

    /**
     * Heuristic used to decide whether the "Preview" toggle is worth showing.
     * Documents created from uploads carry `metadata.fileExtension`; documents
     * added through the API do not, so the content is inspected instead.
     */
    function isMarkdownDocument(doc) {
        if (!doc) return false;
        const metadata = doc.metadata || {};
        const extension = String(metadata.fileExtension || '').toLowerCase();
        const filename = String(metadata.originalFilename || '').toLowerCase();

        if (extension === '.md' || extension === '.markdown') return true;
        if (extension || /\.(txt|pdf)$/.test(filename)) return false;
        if (/\.(md|markdown|mdx)$/.test(filename)) return true;

        return looksLikeMarkdown(String(doc.content ?? ''));
    }

    function looksLikeMarkdown(content) {
        if (!content) return false;
        const lines = content.split(/\r?\n/);
        let score = 0;

        if (/^ {0,3}(`{3,}|~{3,})/m.test(content)) score += 2;
        if (/^ {0,3}#{1,6}[ \t]+\S/m.test(content)) score += 2;
        if (/^ {0,3}>\s+\S/m.test(content)) score += 1;
        if (/^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+\S/m.test(content)) score += 1;
        if (/\[[^\]\n]+\]\([^)\s]+\)/.test(content)) score += 1;
        if (/\*\*[^*\n]+\*\*/.test(content)) score += 1;
        if (lines.some((line, index) => line.includes('|') && isTableDelimiter(lines[index + 1] || ''))) score += 2;

        return score >= 2;
    }

    // ============ PUBLIC API ============

    function render(markdown) {
        const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
        return renderBlocks(lines);
    }

    global.MarkdownPreview = { render, isMarkdownDocument };
})(window);
