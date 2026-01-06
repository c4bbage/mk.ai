import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { parseMarkdown } from '../../lib/markdown';
import { renderMathInElement } from '../../lib/math';
import { renderMermaidInElement } from '../../lib/mermaid';
import { THEMES } from '../../themes';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import './Preview.css';

interface PreviewProps {
  content: string;
  theme: string;
  fontSize?: number;
}

// 根据内容长度计算防抖延迟
function getDebounceDelay(contentLength: number): number {
  if (contentLength < 1000) return 150;      // 小文档
  if (contentLength < 5000) return 250;      // 中等文档
  if (contentLength < 20000) return 400;     // 较大文档
  return 600;                                 // 大文档
}

export function Preview({ content, theme, fontSize = 16 }: PreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedContent, setDebouncedContent] = useState(content);
  const lastContentRef = useRef(content);
  
  // 所有文档都使用防抖，根据大小调整延迟
  useEffect(() => {
    // 清除之前的定时器
    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
    }
    
    const delay = getDebounceDelay(content.length);
    
    renderTimerRef.current = setTimeout(() => {
      setDebouncedContent(content);
      lastContentRef.current = content;
    }, delay);
    
    return () => {
      if (renderTimerRef.current) {
        clearTimeout(renderTimerRef.current);
      }
    };
  }, [content]);
  
  // 解析 Markdown - 使用 useMemo 缓存
  const html = useMemo(() => {
    return parseMarkdown(debouncedContent);
  }, [debouncedContent]);
  
  // 获取主题类名
  const themeClass = useMemo(() => {
    const themeConfig = THEMES.find(t => t.id === theme);
    return themeConfig?.className || 'theme-github';
  }, [theme]);

  // 渲染特殊元素 (KaTeX, Mermaid)
  const renderSpecialElements = useCallback(async () => {
    if (!containerRef.current) return;

    // 渲染数学公式
    renderMathInElement(containerRef.current);

    // 渲染 Mermaid 图表
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
