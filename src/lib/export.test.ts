/**
 * BDD tests for export module
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { generateFullHTML, exportPDF } from './export';

vi.mock('./file', () => ({
  isTauri: () => false,
}));

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
    expect(html).toContain('<div class="markdown-body code-theme-atom-one-dark">');
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

describe('exportPDF', () => {
  let createElementMock: Mock<(tag: string) => HTMLElement>;
  const mockIframes: HTMLIFrameElement[] = [];

  beforeEach(() => {
    mockIframes.length = 0;
    const realCreate = document.createElement.bind(document);
    createElementMock = vi.fn((tagName: string) => {
      const el = realCreate(tagName);
      if (tagName === 'iframe') {
        const mockDoc = {
          open: vi.fn(),
          write: vi.fn(),
          close: vi.fn(),
          readyState: 'complete' as const,
        };
        Object.defineProperty(el, 'contentWindow', {
          value: { document: mockDoc, print: vi.fn() },
          writable: true,
        });
        Object.defineProperty(el, 'contentDocument', {
          value: mockDoc,
          writable: true,
        });
        mockIframes.push(el as HTMLIFrameElement);
      }
      return el;
    });
    vi.spyOn(document, 'createElement').mockImplementation(createElementMock);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as never);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as never);
    vi.spyOn(window, 'setTimeout').mockImplementation(((cb: TimerHandler) => {
      if (typeof cb === 'function') (cb as () => void)();
      return 0;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function getLastIframe(): HTMLIFrameElement {
    const iframe = mockIframes[mockIframes.length - 1];
    if (!iframe) throw new Error('No iframe was created');
    return iframe;
  }

  it('creates an iframe and triggers print in web environment', async () => {
    await exportPDF('# Test PDF', 'github', 'test-doc');

    expect(createElementMock).toHaveBeenCalledWith('iframe');
    expect(document.body.appendChild).toHaveBeenCalled();
  });

  it('writes the full HTML content into the iframe document', async () => {
    await exportPDF('# PDF Content', 'github', 'pdf-title');

    const iframe = getLastIframe();
    const doc = (iframe.contentWindow as unknown as { document: { write: Mock } }).document;
    expect(doc.write).toHaveBeenCalled();
    const writtenHtml = doc.write.mock.calls[0][0] as string;
    expect(writtenHtml).toContain('<!DOCTYPE html>');
    expect(writtenHtml).toContain('PDF Content');
    expect(writtenHtml).toContain('<title>pdf-title</title>');
  });

  it('calls print on the iframe contentWindow', async () => {
    await exportPDF('# Print Me', 'github');

    const iframe = getLastIframe();
    const win = iframe.contentWindow as unknown as { print: Mock };
    expect(win.print).toHaveBeenCalled();
  });

  it('sanitizes markdown content in the exported PDF HTML', async () => {
    await exportPDF('<script>alert("xss")</script>\n# Safe Content', 'github');

    const iframe = getLastIframe();
    const doc = (iframe.contentWindow as unknown as { document: { write: Mock } }).document;
    const writtenHtml = doc.write.mock.calls[0][0] as string;
    expect(writtenHtml).not.toContain('<script>alert(');
    expect(writtenHtml).toContain('Safe Content');
  });
});
