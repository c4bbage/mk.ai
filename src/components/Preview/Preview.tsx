import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { parseMarkdown } from '../../lib/markdown';
import { renderMathInElement } from '../../lib/math';
import { renderMermaidInElement } from '../../lib/mermaid';
import { THEMES } from '../../themes';
import { getRenderDelay, isLargeDocument } from '../../lib/performance';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import './Preview.css';

interface PreviewProps {
  content: string;
  theme: string;
  fontSize?: number;
}

export function Preview({ content, theme, fontSize = 16 }: PreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedContent, setDebouncedContent] = useState(content);
  
  // 大文档防抖
  useEffect(() => {
    const delay = getRenderDelay(content);
    
    if (isLargeDocument(content)) {
      renderTimerRef.current = setTimeout(() => {
        setDebouncedContent(content);
      }, delay);
      
      return () => {
        if (renderTimerRef.current) {
          clearTimeout(renderTimerRef.current);
        }
      };
    } else {
      setDebouncedContent(content);
    }
  }, [content]);
  
  // 解析 Markdown
  const html = useMemo(() => parseMarkdown(debouncedContent), [debouncedContent]);
  
  // 获取主题类名
  const themeClass = useMemo(() => {
    const themeConfig = THEMES.find(t => t.id === theme);
    return themeConfig?.className || 'theme-github';
  }, [theme]);

  // 渲染特殊元素
  const renderSpecialElements = useCallback(async () => {
    if (!containerRef.current) return;

    // 渲染数学公式（同步）
    renderMathInElement(containerRef.current);

    // 渲染 Mermaid 图表（异步）
    try {
      await renderMermaidInElement(containerRef.current);
    } catch (e) {
      console.error('Mermaid rendering failed:', e);
    }
  }, []);

  // 渲染数学公式和 Mermaid 图表
  useEffect(() => {
    // 使用 requestAnimationFrame 确保 DOM 已更新
    const frameId = requestAnimationFrame(() => {
      renderSpecialElements();
    });

    return () => cancelAnimationFrame(frameId);
  }, [html, renderSpecialElements]);

  return (
    <div className={`preview-container ${themeClass}`}>
      <div
        ref={containerRef}
        className="markdown-body"
        style={{ fontSize: `${fontSize}px` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
