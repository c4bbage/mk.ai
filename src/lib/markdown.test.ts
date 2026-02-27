import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('renders headings', () => {
    const html = parseMarkdown('# Hello');
    expect(html).toContain('<h1');
    expect(html).toContain('Hello');
  });

  it('renders bold text', () => {
    const html = parseMarkdown('**bold**');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders italic text', () => {
    const html = parseMarkdown('*italic*');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders code blocks with language', () => {
    const html = parseMarkdown('```javascript\nconst x = 1;\n```');
    expect(html).toContain('<code');
    expect(html).toContain('const');
  });

  it('renders inline code', () => {
    const html = parseMarkdown('use `npm install`');
    expect(html).toContain('<code>npm install</code>');
  });

  it('renders links with target=_blank', () => {
    const html = parseMarkdown('[link](http://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('renders images with lazy loading', () => {
    const html = parseMarkdown('![alt](http://example.com/img.png)');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });

  it('protects math blocks from markdown parsing', () => {
    const html = parseMarkdown('$$\nx^2\n$$');
    expect(html).toContain('math-block');
    expect(html).toContain('data-tex');
  });

  it('protects inline math', () => {
    const html = parseMarkdown('The formula $E=mc^2$ is famous');
    expect(html).toContain('math-inline');
    expect(html).toContain('data-tex');
  });

  it('protects mermaid blocks', () => {
    const html = parseMarkdown('```mermaid\ngraph TD\nA-->B\n```');
    expect(html).toContain('mermaid-block');
    expect(html).toContain('data-code');
  });

  it('renders tables', () => {
    const html = parseMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html).toContain('<td');
  });

  it('renders blockquotes', () => {
    const html = parseMarkdown('> quote');
    expect(html).toContain('<blockquote');
  });

  it('renders lists', () => {
    const html = parseMarkdown('- item 1\n- item 2');
    expect(html).toContain('<ul');
    expect(html).toContain('<li');
  });

  it('handles empty content', () => {
    const html = parseMarkdown('');
    expect(html).toBe('');
  });

  it('does not render math inside code blocks', () => {
    const html = parseMarkdown('```\n$x^2$\n```');
    // The $ inside code should NOT become a math-inline
    expect(html).not.toContain('math-inline');
  });

  it('renders GFM line breaks', () => {
    const html = parseMarkdown('line1\nline2');
    expect(html).toContain('<br');
  });
});
