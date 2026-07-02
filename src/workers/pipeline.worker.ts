/**
 * Pipeline Worker: Render Markdown to sanitized HTML per block
 * Moves parsing and syntax highlighting off the main thread.
 */

import { parseMarkdownToBlocks, type MarkdownBlock } from '../lib/markdown-blocks';
import { parseMarkdown as parseMarkdownFull } from '../lib/markdown';
import { marked, Renderer } from 'marked';
import { sanitizeMarkdownHtml } from '../lib/sanitize';
import { protectSpecialBlocks, restoreSpecialBlocks } from '../lib/placeholders';

// naive code fence language detection
function detectCodeLanguage(content: string): string | undefined {
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.startsWith('```')) {
    const lang = firstLine.slice(3).trim();
    return lang || undefined;
  }
  return undefined;
}

// lightweight string hash for caching keys
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `h${hash}`;
}

export interface PipelineRequest {
  type: 'render' | 'highlight';
  id: string; // sequence id
  content: string;
  blockId?: string; // for highlight requests
  language?: string; // for highlight requests
}

export interface BlockRender {
  id: string;
  type: MarkdownBlock['type'];
  content: string; // original markdown content of the block
  level?: number; // for headings
  html: string; // sanitized HTML
  startLine: number;
  endLine: number;
  language?: string;
  contentHash?: string;
}

export interface PipelineResponse {
  type: 'rendered';
  id: string;
  blocks: BlockRender[];
  renderTime: number;
}

/**
 * Minimal sanitizer for worker-side sanitization
 * Uses the shared sanitize-html config from sanitize.ts
 */

function handleRender(id: string, content: string) {
  const t0 = performance.now();
  try {
    const blocks = parseMarkdownToBlocks(content);
    let cursor = 0;

    // Reuse a single Renderer instance with custom image/link rendering
    // matching markdown.ts to keep virtual preview consistent
    const fastRenderer = new Renderer();
    fastRenderer.image = ({ href, title, text }) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<img src="${href}" alt="${text || ''}"${titleAttr} loading="lazy" decoding="async" class="md-image" />`;
    };
    fastRenderer.link = ({ href, title, text }) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    const rendered: BlockRender[] = blocks.map((block) => {
      const blockLines = block.content.split('\n').length;
      const startLine = cursor;
      const endLine = cursor + blockLines - 1;
      cursor = endLine + 1;

      const { processed, mathBlocks, mermaidBlocks } = protectSpecialBlocks(block.content);

      const rawHtmlFast = marked.parse(processed, { renderer: fastRenderer, gfm: true, breaks: true }) as string;

      const restoredHtml = restoreSpecialBlocks(rawHtmlFast, mathBlocks, mermaidBlocks);

      const safeHtmlFast = sanitizeMarkdownHtml(restoredHtml);
      const language = (block.type === 'code' && detectCodeLanguage(block.content)) || undefined;
      const contentHash = simpleHash(block.content);

      return {
        id: block.id,
        type: block.type,
        content: block.content,
        level: block.level,
        html: safeHtmlFast,
        startLine,
        endLine,
        language,
        contentHash,
      };
    });

    const renderTime = performance.now() - t0;
    const response: PipelineResponse = {
      type: 'rendered',
      id,
      blocks: rendered,
      renderTime,
    };

    self.postMessage(response);
  } catch (error) {
    console.error('[PipelineWorker] error:', error);
    const response: PipelineResponse = {
      type: 'rendered',
      id,
      blocks: [],
      renderTime: 0,
    };
    self.postMessage(response);
  }
}

function handleHighlight(id: string, blockId: string, content: string, _language?: string) {
  void _language; // reserved for future language-specific highlight
  const t0 = performance.now();
  try {
    const htmlFull = parseMarkdownFull(content);
    const safeHtml = sanitizeMarkdownHtml(htmlFull);
    const contentHash = simpleHash(content);
    self.postMessage({
      type: 'highlighted',
      id,
      blockId,
      html: safeHtml,
      time: performance.now() - t0,
      contentHash,
    });
  } catch (e) {
    console.warn('[PipelineWorker] highlight failed, fallback to fast HTML:', e);
    const htmlFallback = sanitizeMarkdownHtml(marked.parse(content) as string);
    self.postMessage({
      type: 'highlighted',
      id,
      blockId,
      html: htmlFallback,
      time: performance.now() - t0,
      contentHash: simpleHash(content),
    });
  }
}

// Unified dispatcher
self.addEventListener('message', (event: MessageEvent) => {
  const data = event.data || {};
  switch (data.type) {
    case 'render':
      handleRender(data.id, data.content);
      break;
    case 'highlight':
      handleHighlight(data.id, data.blockId, data.content, data.language);
      break;
    default:
      break;
  }
});

export {};
