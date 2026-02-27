import { describe, it, expect } from 'vitest';
import { parseMarkdownToBlocks, estimateBlockHeight } from './markdown-blocks';

describe('parseMarkdownToBlocks', () => {
  it('parses headings', () => {
    const blocks = parseMarkdownToBlocks('# Title\n\n## Subtitle');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[0].level).toBe(1);
    expect(blocks[1].type).toBe('heading');
    expect(blocks[1].level).toBe(2);
  });

  it('parses code blocks', () => {
    const blocks = parseMarkdownToBlocks('```js\nconsole.log("hi")\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('code');
    expect(blocks[0].content).toContain('console.log');
  });

  it('parses mermaid blocks as mermaid type', () => {
    const blocks = parseMarkdownToBlocks('```mermaid\ngraph TD\nA-->B\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('mermaid');
  });

  it('parses math blocks', () => {
    const blocks = parseMarkdownToBlocks('$$\nx^2 + y^2 = z^2\n$$');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('math');
  });

  it('parses tables', () => {
    const blocks = parseMarkdownToBlocks('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('table');
  });

  it('parses horizontal rules', () => {
    const blocks = parseMarkdownToBlocks('---');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('hr');
  });

  it('parses blockquotes', () => {
    const blocks = parseMarkdownToBlocks('> quote line 1\n> quote line 2');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('blockquote');
  });

  it('parses lists', () => {
    const blocks = parseMarkdownToBlocks('- item 1\n- item 2\n- item 3');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('list');
  });

  it('parses ordered lists', () => {
    const blocks = parseMarkdownToBlocks('1. first\n2. second');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('list');
  });

  it('parses images', () => {
    const blocks = parseMarkdownToBlocks('![alt](http://example.com/img.png)');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('image');
  });

  it('parses paragraphs', () => {
    const blocks = parseMarkdownToBlocks('Hello world\nthis is a paragraph');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
  });

  it('handles empty content', () => {
    const blocks = parseMarkdownToBlocks('');
    expect(blocks).toHaveLength(0);
  });

  it('handles mixed content', () => {
    const md = `# Title

Some paragraph text.

\`\`\`js
const x = 1;
\`\`\`

- list item

> quote

---`;
    const blocks = parseMarkdownToBlocks(md);
    const types = blocks.map(b => b.type);
    expect(types).toContain('heading');
    expect(types).toContain('paragraph');
    expect(types).toContain('code');
    expect(types).toContain('list');
    expect(types).toContain('blockquote');
    expect(types).toContain('hr');
  });

  it('assigns unique IDs to each block', () => {
    const blocks = parseMarkdownToBlocks('# A\n\n# B\n\n# C');
    const ids = blocks.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('estimateBlockHeight', () => {
  it('returns positive height for all block types', () => {
    const types = ['heading', 'code', 'table', 'image', 'math', 'hr', 'paragraph', 'mermaid', 'blockquote', 'list'] as const;
    for (const type of types) {
      const height = estimateBlockHeight({ id: 'test', type, content: 'test\nline2' }, 16);
      expect(height).toBeGreaterThan(0);
    }
  });

  it('heading height decreases with level', () => {
    const h1 = estimateBlockHeight({ id: 't', type: 'heading', content: '# H1', level: 1 }, 16);
    const h3 = estimateBlockHeight({ id: 't', type: 'heading', content: '### H3', level: 3 }, 16);
    expect(h1).toBeGreaterThan(h3);
  });

  it('code block has minimum height', () => {
    const height = estimateBlockHeight({ id: 't', type: 'code', content: 'x' }, 16);
    expect(height).toBeGreaterThanOrEqual(100);
  });

  it('scales with fontSize', () => {
    const small = estimateBlockHeight({ id: 't', type: 'paragraph', content: 'hello\nworld' }, 12);
    const large = estimateBlockHeight({ id: 't', type: 'paragraph', content: 'hello\nworld' }, 20);
    expect(large).toBeGreaterThan(small);
  });
});
