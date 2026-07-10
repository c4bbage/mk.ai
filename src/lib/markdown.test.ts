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

  it('does not treat dollar amounts as inline math', () => {
    const html = parseMarkdown('The price is $5 and $10 is too much');
    expect(html).not.toContain('math-inline');
  });

  it('does not treat $ inside inline code as math', () => {
    const html = parseMarkdown('Use `$x$` for variables');
    expect(html).not.toContain('math-inline');
  });

  it('strips YAML frontmatter', () => {
    const html = parseMarkdown('---\ntitle: Test\n---\n# Hello');
    expect(html).toContain('Hello');
    expect(html).not.toContain('title');
  });

  it('assigns consistent heading ids across TOC and headings', () => {
    const html = parseMarkdown('[TOC]\n\n# Hello\n\n## World');
    // TOC link href should match heading id
    const tocHref = html.match(/href="#([^"]+)"/);
    const headingId = html.match(/<h1 id="([^"]+)"/);
    expect(tocHref).toBeTruthy();
    expect(headingId).toBeTruthy();
    expect(tocHref![1]).toBe(headingId![1]);
  });

  it('is safe for concurrent parseMarkdown calls with duplicate headings', () => {
    // Two independent calls should each produce id="hello" for the first heading,
    // not id="hello-1" due to shared counter pollution.
    const html1 = parseMarkdown('# Hello');
    const html2 = parseMarkdown('# Hello');
    const id1 = html1.match(/<h1 id="([^"]+)"/)![1];
    const id2 = html2.match(/<h1 id="([^"]+)"/)![1];
    expect(id1).toBe(id2);
    expect(id1).toBe('hello');
  });

  it('renders inline formatting inside headings', () => {
    const html = parseMarkdown('## Hello *italic* **bold**');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('decodes HTML entities in heading slugs', () => {
    const html = parseMarkdown('# A &amp; B');
    const id = html.match(/<h1 id="([^"]+)"/)![1];
    expect(id).not.toContain('amp');
  });
});
