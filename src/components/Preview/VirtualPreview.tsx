import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle, memo } from 'react';
import { estimateBlockHeight } from '../../lib/markdown-blocks';

import { renderMathInElement } from '../../lib/math';
import { renderMermaidInElement } from '../../lib/mermaid';
import { usePipelineWorker, type RenderBlock } from '../../hooks/usePipelineWorker';
import { THEMES } from '../../themes';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import './Preview.css';
import { applyHtmlPatch, isHtmlDifferent } from '../../lib/dom-patch';
import { perfMark, perfMeasure } from '../../lib/performance';
import { useRuntimeStore } from '../../stores/runtime';
import type { PreviewRef } from './Preview';

interface VirtualPreviewProps {
  content: string;
  theme: string;
  fontSize?: number;
  // IME 组合输入期间暂停预览解析
  isComposing?: boolean;
}

// 渲染缓存 (LRU)
const renderCache = new Map<string, string>();
const CACHE_SIZE = 200;

function getCachedRender(block: RenderBlock): string | null {
  const key = block.contentHash || `${block.type}:${block.content}`;
  const hit = renderCache.get(key);
  if (hit) {
    // Refresh LRU order
    renderCache.delete(key);
    renderCache.set(key, hit);
  }
  return hit || null;
}

function setCachedRender(block: RenderBlock, html: string): void {
  const key = block.contentHash || `${block.type}:${block.content}`;

  // LRU: 超过限制时删除最早的
  if (renderCache.size >= CACHE_SIZE) {
    const firstKey = renderCache.keys().next().value;
    if (firstKey) renderCache.delete(firstKey);
  }

  renderCache.set(key, html);
}

// ─── Shared IntersectionObserver ───
// Instead of creating one observer per block, we share a single observer
// and dispatch visibility callbacks via a WeakMap lookup.
type VisibilityCallback = () => void;
const observerCallbacks = new WeakMap<Element, VisibilityCallback>();
let sharedObserver: IntersectionObserver | null = null;
let observedCount = 0;

function getSharedObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cb = observerCallbacks.get(entry.target);
            if (cb) {
              cb();
              // Once visible, stop observing
              sharedObserver!.unobserve(entry.target);
              observerCallbacks.delete(entry.target);
              observedCount--;
            }
          }
        }
        // Cleanup observer when nothing is being observed
        if (observedCount <= 0 && sharedObserver) {
          sharedObserver.disconnect();
          sharedObserver = null;
          observedCount = 0;
        }
      },
      { rootMargin: '200px', threshold: 0 }
    );
  }
  return sharedObserver;
}

function observeElement(el: Element, cb: VisibilityCallback) {
  observerCallbacks.set(el, cb);
  observedCount++;
  getSharedObserver().observe(el);
}

function unobserveElement(el: Element) {
  if (sharedObserver) {
    sharedObserver.unobserve(el);
  }
  if (observerCallbacks.has(el)) {
    observerCallbacks.delete(el);
    observedCount--;
  }
}

// 单个块的渲染组件 — memoized to skip re-renders when block hasn't changed
const BlockRenderer = memo(function BlockRenderer({
  block,
  fontSize,
  onVisible,
  requestHighlight,
}: {
  block: RenderBlock;
  fontSize: number;
  onVisible: () => void;
  requestHighlight: (block: RenderBlock) => void;
}) {
  const { disableHighlight } = useRuntimeStore();
  const ref = useRef<HTMLDivElement>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [html, setHtml] = useState<string>('');
  const contentRef = useRef<HTMLDivElement | null>(null);
  const currentHtmlRef = useRef<string>('');

  // Shared IntersectionObserver 懒加载
  useEffect(() => {
    const element = ref.current;
    if (!element || isRendered) return;

    observeElement(element, () => {
      setIsRendered(true);
      onVisible();
    });

    return () => unobserveElement(element);
  }, [isRendered, onVisible]);

  // 渲染内容
  useEffect(() => {
    if (!isRendered) return;

    const container = contentRef.current;
    const nextHtml = getCachedRender(block) ?? (block.html || '');

    if (container && isHtmlDifferent(currentHtmlRef.current, nextHtml)) {
      perfMark('preview_commit_start');
      const metrics = applyHtmlPatch(container, nextHtml);
      perfMark('preview_commit_end');
      const commitMs = perfMeasure('preview_commit', 'preview_commit_start', 'preview_commit_end');
      currentHtmlRef.current = nextHtml;
      setCachedRender(block, nextHtml);
      if (!disableHighlight) {
        requestHighlight(block);
      }
      if (import.meta.env.DEV) {
        console.debug('[VirtualPreview] patch', { blockId: block.id, commitMs, ...metrics });
      }
    }

    setHtml(nextHtml);
  }, [isRendered, block, disableHighlight, requestHighlight]);

  // 渲染公式和图表（按需 + 异步）
  useEffect(() => {
    if (!isRendered || !html || !ref.current) return;

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
  }, [html, isRendered, block.type]);

  const estimatedHeight = estimateBlockHeight({ id: block.id, type: block.type as any, content: block.content, level: block.level }, fontSize);

  return (
    <div
      ref={ref}
      className={`preview-block preview-block-${block.type}`}
      data-block-id={block.id}
      style={{
        minHeight: isRendered ? undefined : `${estimatedHeight}px`,
      }}
    >
      {isRendered ? (
        <div ref={contentRef} />
      ) : (
        <div className="preview-block-placeholder" style={{ height: estimatedHeight }}>
          <div className="placeholder-shimmer" />
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  // Only re-render if the block's html or content actually changed
  return prev.block.id === next.block.id
    && prev.block.html === next.block.html
    && prev.block.contentHash === next.block.contentHash
    && prev.fontSize === next.fontSize;
});

export const VirtualPreview = forwardRef<PreviewRef, VirtualPreviewProps>(function VirtualPreview({
  content,
  theme,
  fontSize = 16,
  isComposing = false,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderedCount, setRenderedCount] = useState(0);

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

  // 块可见回调
  const handleBlockVisible = useCallback(() => {
    setRenderedCount(c => c + 1);
  }, []);

  // 文档统计
  const totalBlocks = blocks.length;
  const progress = totalBlocks > 0 ? Math.round((renderedCount / totalBlocks) * 100) : 100;

  // 暴露滚动控制，便于从编辑器跳转到光标位置
  useImperativeHandle(ref, () => ({
    getScrollContainer: () => containerRef.current,
    scrollTo: (top: number) => {
      if (containerRef.current) {
        containerRef.current.scrollTop = top;
      }
    },
  }));

  // Stable highlight callback — avoids breaking BlockRenderer memo
  const deferredHighlight = useCallback((b: RenderBlock) => {
    requestAnimationFrame(() => requestHighlight(b));
  }, [requestHighlight]);

  return (
    <div className={`preview-container virtual-preview ${themeClass}`}>
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
          解析: {parseTime.toFixed(1)}ms | 块: {totalBlocks}
        </div>
      )}

      {/* 渲染进度指示器 (大文档时显示) */}
      {totalBlocks > 50 && progress < 100 && !isParsing && (
        <div className="render-progress">
          <div className="render-progress-bar" style={{ width: `${progress}%` }} />
          <span className="render-progress-text">
            渲染中 {renderedCount}/{totalBlocks}
          </span>
        </div>
      )}

      <div
        ref={containerRef}
        className="markdown-body virtual-scroll-container"
        style={{ fontSize: `${fontSize}px` }}
      >
        {blocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            fontSize={fontSize}
            onVisible={handleBlockVisible}
            requestHighlight={deferredHighlight}
          />
        ))}
        
        {blocks.length === 0 && (
          <div className="preview-empty">
            <span>开始输入 Markdown...</span>
          </div>
        )}
      </div>
    </div>
  );
});
