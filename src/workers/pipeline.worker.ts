/**
 * Pipeline Worker: Render Markdown to sanitized HTML per block
 * Moves parsing and syntax highlighting off the main thread.
 */

import { parseMarkdownToBlocks, type MarkdownBlock } from '../lib/markdown-blocks';
import { parseMarkdown as parseMarkdownFull } from '../lib/markdown';
import { marked, Renderer } from 'marked';

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
  type: 'render';
  id: string; // sequence id
  content: string;
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
 * - Neutralize <script> tags
 * - Remove on* event handler attributes
 * - Strip javascript: URLs in href/src
 */
import sanitizeHtmlLib from 'sanitize-html'

function sanitizeHtml(html: string): string {
  try {
    return sanitizeHtmlLib(html, {
      allowedTags: [
        'p','h1','h2','h3','h4','h5','h6','ul','ol','li','code','pre','blockquote','em','strong','a','img','table','thead','tbody','tr','th','td','span','div','br'
      ],
      allowedAttributes: {
        a: ['href','title','target','rel'],
        img: ['src','alt','title'],
        div: ['class','data-code'],
        span: ['class','data-tex']
      },
      allowedSchemes: ['http', 'https', 'mailto', 'data'],
      allowVulnerableTags: false,
      transformTags: {
        'a': (tagName: string, attribs: Record<string, string>) => {
          const href = attribs.href || ''
          if (/^\s*javascript:/i.test(href)) {
            return { tagName: 'a', attribs: { ...attribs, href: '#' } }
          }
          return { tagName, attribs }
        }
      }
    })
  } catch {
    // Fallback: return original HTML if sanitize-html fails in Worker
    return html
  }
}

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

      const fastRenderer = new Renderer();

      const mathBlocks: string[] = [];
      const mermaidBlocks: string[] = [];
      const codeBlocks: string[] = [];

      let processed = block.content;
      processed = processed.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
        mermaidBlocks.push(`<div class=\"mermaid-block\" data-code=\"${encodeURIComponent(code.trim())}\"></div>`);
        return `%%MERMAID_BLOCK_${mermaidBlocks.length - 1}%%`;
      });
      processed = processed.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, (m) => {
        codeBlocks.push(m);
        return `%%CODE_BLOCK_${codeBlocks.length - 1}%%`;
      });
      processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
        mathBlocks.push(`<div class=\"math-block\" data-tex=\"${encodeURIComponent(tex.trim())}\"></div>`);
        return `%%MATH_BLOCK_${mathBlocks.length - 1}%%`;
      });
      processed = processed.replace(/\$([^\$\n]+?)\$/g, (_, tex) => {
        mathBlocks.push(`<span class=\"math-inline\" data-tex=\"${encodeURIComponent(tex.trim())}\"></span>`);
        return `%%MATH_BLOCK_${mathBlocks.length - 1}%%`;
      });
      codeBlocks.forEach((blockSrc, i) => {
        processed = processed.replace(`%%CODE_BLOCK_${i}%%`, blockSrc);
      });

      const rawHtmlFast = marked.parse(processed, { renderer: fastRenderer, gfm: true, breaks: true }) as string;

      let restoredHtml = rawHtmlFast;
      mathBlocks.forEach((placeholder, i) => {
        restoredHtml = restoredHtml.replace(`%%MATH_BLOCK_${i}%%`, placeholder);
        restoredHtml = restoredHtml.replace(`<p>%%MATH_BLOCK_${i}%%</p>`, placeholder);
      });
      mermaidBlocks.forEach((placeholder, i) => {
        restoredHtml = restoredHtml.replace(`%%MERMAID_BLOCK_${i}%%`, placeholder);
        restoredHtml = restoredHtml.replace(`<p>%%MERMAID_BLOCK_${i}%%</p>`, placeholder);
      });

      const safeHtmlFast = sanitizeHtml(restoredHtml);
      const language = (block.type === 'code' && detectCodeLanguage(block.content)) || undefined;
      const contentHash = simpleHash(block.content);

      return {
        id: block.id,
        type: block.type,
        content: block.content,
        level: (block as any).level,
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
    const safeHtml = sanitizeHtml(htmlFull);
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
    const htmlFallback = sanitizeHtml(marked.parse(content) as string);
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
self.addEventListener('message', (event: MessageEvent<any>) => {
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
