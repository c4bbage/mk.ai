/**
 * Shared HTML sanitization for Markdown preview.
 * Used by both Preview (main thread) and pipeline.worker (Worker thread).
 */
import sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS: Record<string, unknown> = {
  allowedTags: [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'code', 'pre', 'blockquote',
    'em', 'strong', 'del', 's', 'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span', 'div', 'br', 'hr', 'input', 'label',
    'sup', 'sub', 'u', 'mark', 'abbr', 'details', 'summary',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'loading', 'decoding', 'class'],
    div: ['class', 'data-code', 'data-tex'],
    span: ['class', 'data-tex'],
    code: ['class'],
    pre: ['class'],
    td: ['align'],
    th: ['align'],
    input: ['type', 'checked', 'disabled'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'data'],
  allowVulnerableTags: false,
  transformTags: {
    a: (tagName: string, attribs: Record<string, string>) => {
      const href = attribs.href || '';
      if (/^\s*javascript:/i.test(href)) {
        return { tagName: 'a', attribs: { ...attribs, href: '#' } };
      }
      return { tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } };
    },
  },
};

/**
 * Sanitize HTML produced by parseMarkdown().
 * Safe to call on main thread — fast for typical document sizes.
 */
export function sanitizeMarkdownHtml(html: string): string {
  try {
    return sanitizeHtml(html, SANITIZE_OPTIONS);
  } catch {
    // Fallback: strip all tags
    return html.replace(/<[^>]*>/g, '');
  }
}
