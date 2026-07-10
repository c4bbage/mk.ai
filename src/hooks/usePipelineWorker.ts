/**
 * usePipelineWorker Hook
 * Offload markdown parsing + syntax highlighting to a single pipeline worker.
 * Ensures main thread only mounts results, with version sequencing.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { perfMark, perfMeasure } from '../lib/performance';
import { parseMarkdownToBlocks, type MarkdownBlock } from '../lib/markdown-blocks';
import { parseMarkdownBlock } from '../lib/markdown';
import { sanitizeMarkdownHtml } from '../lib/sanitize';

export interface RenderBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'code' | 'table' | 'list' | 'blockquote' | 'hr' | 'math' | 'mermaid' | 'image';
  html: string;
  startLine: number;
  endLine: number;
  // additional metadata for two-phase rendering & caching
  content: string;
  level?: number;
  language?: string; // for code blocks
  contentHash?: string; // hash of content for caching
}

export interface UsePipelineWorkerOptions {
  content: string;
}

export interface UsePipelineWorkerResult {
  blocks: RenderBlock[];
  isRendering: boolean;
  renderTime: number;
  requestHighlight: (block: RenderBlock) => void;
}

/** Adaptive debounce delay based on content size */
function getWorkerDebounce(len: number): number {
  if (len < 5_000) return 80;
  if (len < 30_000) return 150;
  if (len < 100_000) return 250;
  return 400;
}

export function usePipelineWorker({ content }: UsePipelineWorkerOptions): UsePipelineWorkerResult {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const watchdogRef = useRef<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const lastContentRef = useRef<string>('');
  const [blocks, setBlocks] = useState<RenderBlock[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [renderTime, setRenderTime] = useState(0);

  // Shared message handler (avoids duplication between init and restart)
  const prevBlocksRef = useRef<RenderBlock[]>([]);
  const handleWorkerMessage = useCallback((event: MessageEvent) => {
    const data = event.data || {};
    const { type } = data;
    if (type === 'rendered') {
      const { id, blocks: renderedBlocks, renderTime: rt } = data;
      if (id === requestIdRef.current.toString()) {
        // Incremental merge: preserve html for blocks whose contentHash hasn't changed
        const prev = prevBlocksRef.current;
        const prevByHash = new Map<string, RenderBlock>();
        for (const b of prev) {
          if (b.contentHash) prevByHash.set(b.contentHash, b);
        }
        const merged = (renderedBlocks || []).map((nb: RenderBlock) => {
          const old = nb.contentHash ? prevByHash.get(nb.contentHash) : undefined;
          return old && old.html ? { ...nb, html: old.html } : nb;
        });
        prevBlocksRef.current = merged;
        setBlocks(merged);
        setRenderTime(rt || 0);
        perfMark('worker_parse_end');
        const parseMs = perfMeasure('worker_parse', 'worker_parse_start', 'worker_parse_end');
        setIsRendering(false);
        if (import.meta.env.DEV && parseMs != null) { console.debug('[perf] worker_parse', parseMs?.toFixed?.(1), 'ms'); }
      }
    } else if (type === 'highlighted') {
      const { id, blockId, html, contentHash } = data;
      if (id !== requestIdRef.current.toString()) return;
      setBlocks(prev => prev.map(b => (b.id === blockId && (!b.contentHash || b.contentHash === contentHash))
        ? { ...b, html }
        : b
      ));
    }
  }, []);

  // Create a worker with error/message handlers attached
  const createWorker = useCallback(() => {
    const worker = new Worker(new URL('../workers/pipeline.worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = (e) => {
      console.warn('[usePipelineWorker] worker error, restarting...', e);
      try { worker.terminate(); } catch { /* ignore */ }
      if (workerRef.current === worker) workerRef.current = null;
      setIsRendering(false);
    };
    worker.onmessage = handleWorkerMessage;
    return worker;
  }, [handleWorkerMessage]);

  // Init worker once
  useEffect(() => {
    if (!workerRef.current) {
      try {
        workerRef.current = createWorker();
      } catch (e) {
        console.warn('[usePipelineWorker] failed to init worker, falling back to main thread:', e);
      }
    }

    return () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (workerRef.current) workerRef.current.terminate();
      workerRef.current = null;
    };
  }, [createWorker]);

  // Debounced render dispatch — avoids flooding the worker on rapid keystrokes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!content) {
      lastContentRef.current = '';
      return;
    }

    // Skip if content hasn't actually changed (e.g. re-render from parent)
    if (content === lastContentRef.current) return;

    const delay = getWorkerDebounce(content.length);

    debounceRef.current = window.setTimeout(() => {
      lastContentRef.current = content;
      requestIdRef.current++;
      const id = requestIdRef.current.toString();

      if (workerRef.current) {
        setIsRendering(true);
        perfMark('worker_parse_start');
        workerRef.current.postMessage({ type: 'render', id, content });

        // Watchdog: restart worker if no response within 5s
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        watchdogRef.current = window.setTimeout(() => {
          if (requestIdRef.current.toString() === id) {
            console.warn('[usePipelineWorker] render timeout, restarting worker...');
            try { workerRef.current?.terminate(); } catch { /* ignore */ }
            workerRef.current = createWorker();
            workerRef.current.postMessage({ type: 'render', id, content });
          }
        }, 5000) as unknown as number;
      } else {
        // Fallback: main thread render
        setIsRendering(true);
        try {
          const t0 = performance.now();
          const blocksRaw = parseMarkdownToBlocks(content);
          let cursor = 0;
          const rendered = blocksRaw.map((block: MarkdownBlock) => {
            const blockLines = block.content.split('\n').length;
            const startLine = cursor;
            const endLine = cursor + blockLines - 1;
            cursor = endLine + 1;
            const rawHtml = parseMarkdownBlock(block.content);
            const safeHtml = sanitizeMarkdownHtml(rawHtml);
            const contentHash = block.content; // use raw content as hash (string comparison)
            return { id: block.id, type: block.type, content: block.content, level: block.level, html: safeHtml, startLine, endLine, contentHash } as RenderBlock;
          });
          setBlocks(rendered);
          setRenderTime(performance.now() - t0);
        } catch (e) {
          console.error('[usePipelineWorker] main-thread fallback failed:', e);
          setBlocks([]);
          setRenderTime(0);
        } finally {
          setIsRendering(false);
        }
      }
    }, delay) as unknown as number;

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, createWorker]);

  const requestHighlight = useCallback((block: RenderBlock) => {
    const id = requestIdRef.current.toString();
    if (!workerRef.current) return;
    if (block.type === 'code') {
      workerRef.current.postMessage({
        type: 'highlight',
        id,
        blockId: block.id,
        content: block.content,
        language: block.language,
      });
    }
  }, []);

  return {
    blocks: content ? blocks : [],
    isRendering: content ? isRendering : false,
    renderTime: content ? renderTime : 0,
    requestHighlight,
  };
}
