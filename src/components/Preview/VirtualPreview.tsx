import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle, memo, useMemo } from 'react';
import { estimateBlockHeight } from '../../lib/markdown-blocks';

import { renderMathInElement } from '../../lib/math';
import { renderMermaidInElement } from '../../lib/mermaid';
import { resolveImagePathsInDom } from '../../lib/image-path';
import { enhancePreviewDom } from '../../lib/preview-enhance';
import { usePipelineWorker, type RenderBlock } from '../../hooks/usePipelineWorker';
import { THEMES, getCodeThemeClass } from '../../themes';
import 'katex/dist/katex.min.css';
import './Preview.css';
import { applyHtmlPatch, isHtmlDifferent } from '../../lib/dom-patch';
import { perfMark, perfMeasure } from '../../lib/performance';
import { useRuntimeStore } from '../../stores/runtime';
import type { PreviewRef } from './Preview';

interface VirtualPreviewProps {
  content: string;
  theme: string;
  codeTheme?: string;
  fontSize?: number;
  filePath?: string;
  isComposing?: boolean;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  onTaskToggle?: (taskIndex: number, checked: boolean) => void;
}

// 渲染缓存 (LRU)
const renderCache = new Map<string, string>();
const CACHE_SIZE = 200;

function getCachedRender(block: RenderBlock): string | null {
  const key = block.contentHash || `${block.type}:${block.content}`;
  const hit = renderCache.get(key);
  if (hit) {
    renderCache.delete(key);
    renderCache.set(key, hit);
  }
  return hit || null;
}

function setCachedRender(block: RenderBlock, html: string): void {
  const key = block.contentHash || `${block.type}:${block.content}`;
  if (renderCache.size >= CACHE_SIZE) {
    const firstKey = renderCache.keys().next().value;
    if (firstKey) renderCache.delete(firstKey);
  }
  renderCache.set(key, html);
}

// 单个块的渲染组件 — memoized to skip re-renders when block hasn't changed
const BlockRenderer = memo(function BlockRenderer({
  block,
  filePath,
  requestHighlight,
}: {
  block: RenderBlock;
  filePath?: string;
  requestHighlight: (block: RenderBlock) => void;
}) {
  const { disableHighlight } = useRuntimeStore();
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const currentHtmlRef = useRef<string>('');
  const lastFilePathRef = useRef<string | undefined>(undefined);

  // 渲染内容
  useEffect(() => {
    const container = contentRef.current;
    const nextHtml = getCachedRender(block) ?? (block.html || '');
    const htmlChanged = isHtmlDifferent(currentHtmlRef.current, nextHtml);
    const filePathChanged = lastFilePathRef.current !== filePath;

    if (container && (htmlChanged || filePathChanged)) {
      perfMark('preview_commit_start');
      const metrics = applyHtmlPatch(container, nextHtml);
      perfMark('preview_commit_end');
      const commitMs = perfMeasure('preview_commit', 'preview_commit_start', 'preview_commit_end');
      currentHtmlRef.current = nextHtml;
      lastFilePathRef.current = filePath;
      setCachedRender(block, nextHtml);
      resolveImagePathsInDom(container, filePath);
      enhancePreviewDom(container);
      if (!disableHighlight) {
        requestHighlight(block);
      }
      if (import.meta.env.DEV) {
        console.debug('[VirtualPreview] patch', { blockId: block.id, commitMs, ...metrics });
      }
    }
  }, [block, disableHighlight, requestHighlight, filePath]);

  // 渲染公式和图表（按需 + 异步）
  useEffect(() => {
    const html = currentHtmlRef.current;
    if (!html || !ref.current) return;

    const container = contentRef.current || ref.current;
    const hasMath = block.type === 'math' || html.includes('math-');
    const hasMermaid = block.type === 'mermaid' || html.includes('mermaid-');

    if (!hasMath && !hasMermaid) return;

    const rafId = requestAnimationFrame(async () => {
      if (container) {
        if (hasMath) await renderMathInElement(container);
        if (hasMermaid) await renderMermaidInElement(container);
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [block.html, block.type]);

  return (
    <div
      ref={ref}
      className={`preview-block preview-block-${block.type}`}
      data-block-id={block.id}
    >
      <div ref={contentRef} />
    </div>
  );
}, (prev, next) => {
  return prev.block.id === next.block.id
    && prev.block.html === next.block.html
    && prev.block.contentHash === next.block.contentHash
    && prev.filePath === next.filePath;
});

// Overscan: render extra blocks above/below viewport for smooth scrolling
const OVERSCAN = 3;

export const VirtualPreview = forwardRef<PreviewRef, VirtualPreviewProps>(function VirtualPreview({
  content,
  theme,
  codeTheme,
  fontSize = 16,
  filePath,
  isComposing = false,
  onScroll,
  onTaskToggle,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // 组合输入期间：冻结解析内容，避免频繁更新
  const lastStableContentRef = useRef(content);
  useEffect(() => {
    if (!isComposing) {
      lastStableContentRef.current = content;
    }
  }, [content, isComposing]);

  const effectiveContent = isComposing ? lastStableContentRef.current : content;

  // 使用 Worker 解析 (大文档自动启用)
  const { blocks, isRendering: isParsing, renderTime: parseTime, requestHighlight } = usePipelineWorker({
    content: effectiveContent,
  });

  // 获取主题类名
  const themeConfig = THEMES.find(t => t.id === theme);
  const themeClass = themeConfig?.className || 'theme-github';
  const codeThemeClass = getCodeThemeClass(codeTheme ?? '');

  // 预计算每个块的估算高度和累计偏移量
  const layout = useMemo(() => {
    const heights: number[] = [];
    const offsets: number[] = [];
    let total = 0;
    for (let i = 0; i < blocks.length; i++) {
      const h = estimateBlockHeight({ id: blocks[i].id, type: blocks[i].type, content: blocks[i].content, level: blocks[i].level }, fontSize);
      heights.push(h);
      offsets.push(total);
      total += h;
    }
    return { heights, offsets, total };
  }, [blocks, fontSize]);

  // 计算可见范围
  const visibleRange = useMemo(() => {
    if (blocks.length === 0) return { start: 0, end: 0 };
    const top = scrollTop;
    const bottom = scrollTop + viewportHeight;

    // Binary search for first block whose bottom is below `top - overscan`
    let lo = 0, hi = blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const blockBottom = layout.offsets[mid] + layout.heights[mid];
      if (blockBottom < top) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const start = Math.max(0, lo - OVERSCAN);

    // Binary search for last block whose top is above `bottom + overscan`
    lo = start; hi = blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (layout.offsets[mid] > bottom) {
        hi = mid - 1;
      } else {
        lo = mid;
      }
    }
    const end = Math.min(blocks.length - 1, lo + OVERSCAN);

    return { start, end };
  }, [scrollTop, viewportHeight, blocks.length, layout]);

  // 滚动事件 (rAF 节流)
  const rafPendingRef = useRef(false);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (rafPendingRef.current) return;
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
        if (containerRef.current) {
          const st = containerRef.current.scrollTop;
          setScrollTop(st);
          if (onScroll) {
            onScroll(st, containerRef.current.scrollHeight, containerRef.current.clientHeight);
          }
        }
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    // Initial measurement
    setViewportHeight(container.clientHeight);
    setScrollTop(container.scrollTop);

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        setViewportHeight(containerRef.current.clientHeight);
      }
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, []);

  // 暴露滚动控制，便于从编辑器跳转到光标位置
  useImperativeHandle(ref, () => ({
    getScrollContainer: () => containerRef.current,
    scrollTo: (top: number) => {
      if (containerRef.current) {
        containerRef.current.scrollTop = top;
      }
    },
  }));

  // 监听 task-toggle 事件（来自 preview-enhance 的 checkbox 点击）
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onTaskToggle) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) onTaskToggle(detail.taskIndex, detail.checked);
    };
    container.addEventListener('task-toggle', handler);
    return () => container.removeEventListener('task-toggle', handler);
  }, [onTaskToggle]);

  // Stable highlight callback — avoids breaking BlockRenderer memo
  const deferredHighlight = useCallback((b: RenderBlock) => {
    requestAnimationFrame(() => requestHighlight(b));
  }, [requestHighlight]);

  const visibleBlocks = blocks.slice(visibleRange.start, visibleRange.end + 1);

  return (
    <div ref={containerRef} className={`preview-container virtual-preview ${themeClass} ${codeThemeClass}`}>
      {/* 解析中指示器 */}
      {isParsing && (
        <div className="parse-indicator">
          <div className="parse-spinner" />
          <span>解析中...</span>
        </div>
      )}

      {/* 性能指标 (开发模式) */}
      {parseTime > 0 && import.meta.env.DEV && (
        <div className="perf-stats">
          解析: {parseTime.toFixed(1)}ms | 块: {blocks.length} | 可见: {visibleRange.start}-{visibleRange.end}
        </div>
      )}

      <div
        className="markdown-body virtual-scroll-container"
        style={{ fontSize: `${fontSize}px` }}
      >
        {/* Spacer div with total estimated height to maintain scrollbar */}
        <div style={{ height: layout.total, position: 'relative' }}>
          {/* Offset to position visible blocks correctly */}
          <div style={{ transform: `translateY(${layout.offsets[visibleRange.start] || 0}px)` }}>
            {visibleBlocks.map((block, i) => {
              const blockIndex = visibleRange.start + i;
              return (
                <div
                  key={block.id}
                  style={{ minHeight: layout.heights[blockIndex] }}
                >
                  <BlockRenderer
                    block={block}
                    filePath={filePath}
                    requestHighlight={deferredHighlight}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {blocks.length === 0 && (
          <div className="preview-empty">
            <span>开始输入 Markdown...</span>
          </div>
        )}
      </div>
    </div>
  );
});
