/**
 * Pipeline Worker: Render Markdown to sanitized HTML per block
 * Moves parsing and syntax highlighting off the main thread.
 */

import { parseMarkdownToBlocks, type MarkdownBlock } from '../lib/markdown-blocks';
import { parseMarkdownBlock } from '../lib/markdown';
import { sanitizeMarkdownHtml } from '../lib/sanitize';

// naive code fence language detection
function detectCodeLanguage(content: string): string | undefined {
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.startsWith('```')) {
    const lang = firstLine.slice(3).trim();
    return lang || undefined;
  }
  return undefined;
}

// Stronger content hash for caching keys — dual djb2 + length to minimise collisions
function simpleHash(str: string): string {
  if (str.length < 256) return `s:${str}`;
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = ((h2 * 33) ^ c) >>> 0;
  }
  return `h${(h1 >>> 0)}:${h2 >>> 0}:${str.length}`;
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

    const rendered: BlockRender[] = blocks.map((block) => {
      const blockLines = block.content.split('\n').length;
      const startLine = cursor;
      const endLine = cursor + blockLines - 1;
      cursor = endLine + 1;

      const rawHtml = parseMarkdownBlock(block.content);
      const safeHtml = sanitizeMarkdownHtml(rawHtml);
      const language = (block.type === 'code' && detectCodeLanguage(block.content)) || undefined;
      const contentHash = simpleHash(block.content);

      return {
        id: block.id,
        type: block.type,
        content: block.content,
        level: block.level,
        html: safeHtml,
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
    const html = parseMarkdownBlock(content);
    const safeHtml = sanitizeMarkdownHtml(html);
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
    console.warn('[PipelineWorker] highlight failed, fallback to escaped text:', e);
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    self.postMessage({
      type: 'highlighted',
      id,
      blockId,
      html: `<pre><code>${escaped}</code></pre>`,
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
