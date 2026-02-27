/**
 * BDD tests for export module
 */
import { describe, it, expect } from 'vitest';
import { generateFullHTML } from './export';

describe('generateFullHTML', () => {
  it('produces a valid HTML document', () => {
    const html = generateFullHTML('# Hello', 'github');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('</html>');
  });

  it('includes the markdown content rendered as HTML', () => {
    const html = generateFullHTML('**bold text**', 'github');
    expect(html).toContain('<strong>bold text</strong>');
  });

  it('includes the title in the head', () => {
    const html = generateFullHTML('# Test', 'github', 'My Document');
    expect(html).toContain('<title>My Document</title>');
  });

  it('escapes HTML in the title', () => {
    const html = generateFullHTML('# Test', 'github', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes base styles', () => {
    const html = generateFullHTML('test', 'github');
    expect(html).toContain('.markdown-body');
    expect(html).toContain('font-family');
  });

  it('includes theme-specific styles for wechat-elegant', () => {
    const html = generateFullHTML('test', 'wechat-elegant');
    expect(html).toContain('#ff6827');
  });

  it('includes theme-specific styles for wechat-green', () => {
    const html = generateFullHTML('test', 'wechat-green');
    expect(html).toContain('#07c160');
  });

  it('includes theme-specific styles for wechat-blue', () => {
    const html = generateFullHTML('test', 'wechat-blue');
    expect(html).toContain('#409eff');
  });

  it('handles unknown theme gracefully', () => {
    const html = generateFullHTML('test', 'nonexistent-theme');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('.markdown-body');
  });

  it('handles empty content', () => {
    const html = generateFullHTML('', 'github');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<div class="markdown-body">');
  });

  it('renders tables in exported HTML', () => {
    const html = generateFullHTML('| A | B |\n|---|---|\n| 1 | 2 |', 'github');
    expect(html).toContain('<table');
    expect(html).toContain('<th');
  });

  it('renders code blocks in exported HTML', () => {
    const html = generateFullHTML('```javascript\nconst x = 1;\n```', 'github');
    expect(html).toContain('<code');
    expect(html).toContain('const');
  });

  it('includes print media query', () => {
    const html = generateFullHTML('test', 'github');
    expect(html).toContain('@media print');
  });

  it('uses default title when not provided', () => {
    const html = generateFullHTML('test', 'github');
    expect(html).toContain('<title>Markdown Document</title>');
  });
});
