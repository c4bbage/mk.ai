import { useEffect, useRef, useState, useCallback } from 'react';
import { estimateBlockHeight, type MarkdownBlock } from '../../lib/markdown-blocks';
import { parseMarkdown } from '../../lib/markdown';
import { renderMathInElement } from '../../lib/math';
import { renderMermaidInElement } from '../../lib/mermaid';
import { useMarkdownWorker } from '../../hooks/useMarkdownWorker';
import { THEMES } from '../../themes';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import './Preview.css';

interface VirtualPreviewProps {
  content: string;
  theme: string;
  fontSize?: number;
}

// 渲染缓存 (LRU)
const renderCache = new Map<string, string>();
const CACHE_SIZE = 100;

function getCachedRender(block: MarkdownBlock): string | null {
  const key = `${block.type}:${block.content}`;
  return renderCache.get(key) || null;
}

function setCachedRender(block: MarkdownBlock, html: string): void {
  const key = `${block.type}:${block.content}`;
  
  // LRU: 超过限制时删除最早的
  if (renderCache.size >= CACHE_SIZE) {
    const firstKey = renderCache.keys().next().value;
    if (firstKey) renderCache.delete(firstKey);
  }
  
  renderCache.set(key, html);
}

// 单个块的渲染组件
function BlockRenderer({ 
  block, 
  fontSize,
  onVisible,
}: { 
  block: MarkdownBlock; 
  fontSize: number;
  onVisible: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [html, setHtml] = useState<string>('');

  // Intersection Observer 懒加载
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isRendered) {
            setIsRendered(true);
            onVisible();
          }
        });
      },
      {
        rootMargin: '200px', // 提前 200px 开始渲染
        threshold: 0,
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [isRendered, onVisible]);

  // 渲染内容
  useEffect(() => {
    if (!isRendered) return;

    // 检查缓存
    const cached = getCachedRender(block);
    if (cached) {
      setHtml(cached);
      return;
    }

    // 渲染 Markdown
    const rendered = parseMarkdown(block.content);
    setCachedRender(block, rendered);
    setHtml(rendered);
  }, [isRendered, block]);

  // 渲染公式和图表
  useEffect(() => {
    if (!isRendered || !html || !ref.current) return;

    const element = ref.current;
    
    // 延迟渲染特殊元素
    requestAnimationFrame(() => {
      if (block.type === 'math' || html.includes('math-')) {
        renderMathInElement(element);
      }
      if (block.type === 'mermaid' || html.includes('mermaid-')) {
        renderMermaidInElement(element);
      }
    });
  }, [html, isRendered, block.type]);

  const estimatedHeight = estimateBlockHeight(block, fontSize);

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
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="preview-block-placeholder" style={{ height: estimatedHeight }}>
          <div className="placeholder-shimmer" />
        </div>
      )}
    </div>
  );
}

export function VirtualPreview({ content, theme, fontSize = 16 }: VirtualPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderedCount, setRenderedCount] = useState(0);

  // 使用 Worker 解析 (大文档自动启用)
  const { blocks, isParsing, parseTime } = useMarkdownWorker({
    content,
    useWorker: true,
    threshold: 30000, // 30KB 以上使用 Worker
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
}
