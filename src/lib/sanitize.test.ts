import { describe, it, expect } from 'vitest';
import { sanitizeMarkdownHtml } from './sanitize';

describe('sanitizeMarkdownHtml', () => {
  it('allows basic markdown HTML tags', () => {
    const html = '<h1>Title</h1><p>Text</p><strong>bold</strong>';
    const result = sanitizeMarkdownHtml(html);
    expect(result).toContain('<h1>');
    expect(result).toContain('<p>');
    expect(result).toContain('<strong>');
  });

  it('strips script tags', () => {
    const html = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeMarkdownHtml(html);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
  });

  it('strips on* event handlers', () => {
    const html = '<img src="x" onerror="alert(1)">';
    const result = sanitizeMarkdownHtml(html);
    expect(result).not.toContain('onerror');
  });

  it('neutralizes javascript: URLs', () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeMarkdownHtml(html);
    expect(result).not.toContain('javascript:');
  });

  it('preserves math-block divs with data-tex', () => {
    const html = '<div class="math-block" data-tex="x%5E2"></div>';
    const result = sanitizeMarkdownHtml(html);
    expect(result).toContain('math-block');
    expect(result).toContain('data-tex');
  });

  it('preserves mermaid-block divs with data-code', () => {
    const html = '<div class="mermaid-block" data-code="graph%20TD"></div>';
    const result = sanitizeMarkdownHtml(html);
    expect(result).toContain('mermaid-block');
    expect(result).toContain('data-code');
  });

  it('preserves code blocks with class', () => {
    const html = '<pre><code class="hljs language-js">const x = 1;</code></pre>';
    const result = sanitizeMarkdownHtml(html);
    expect(result).toContain('<pre>');
    expect(result).toContain('<code');
  });

  it('allows img with src and alt', () => {
    const html = '<img src="http://example.com/img.png" alt="test">';
    const result = sanitizeMarkdownHtml(html);
    expect(result).toContain('src=');
    expect(result).toContain('alt=');
  });

  it('allows data: URLs for images', () => {
    const html = '<img src="data:image/png;base64,abc123" alt="img">';
    const result = sanitizeMarkdownHtml(html);
    expect(result).toContain('data:image');
  });

  it('strips iframe tags', () => {
    const html = '<iframe src="http://evil.com"></iframe>';
    const result = sanitizeMarkdownHtml(html);
    expect(result).not.toContain('<iframe');
  });

  it('handles empty input', () => {
    expect(sanitizeMarkdownHtml('')).toBe('');
  });

  it('adds target=_blank to links', () => {
    const html = '<a href="http://example.com">link</a>';
    const result = sanitizeMarkdownHtml(html);
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });
});
