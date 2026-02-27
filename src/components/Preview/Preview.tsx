import { useEffect, useRef, useMemo, useCallback, useState, forwardRef, useImperativeHandle, useDeferredValue, memo } from 'react';
import { parseMarkdown } from '../../lib/markdown';
import { sanitizeMarkdownHtml } from '../../lib/sanitize';
import { lazyLoadKaTeX, lazyLoadMermaid, runWhenIdle } from '../../lib/performance';
import { THEMES } from '../../themes';
// import 'katex/dist/katex.min.css';
// import 'highlight.js/styles/github.css';
import './Preview.css';
import { perfMark } from '../../lib/performance';

interface PreviewProps {
  content: string;
  theme: string;
  fontSize?: number;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  // IME 组合输入期间暂停预览更新
  isComposing?: boolean;
}

export interface PreviewRef {
  getScrollContainer: () => HTMLElement | null;
  scrollTo: (top: number) => void;
}

// 根据内容长度计算防抖延迟（100–200ms 区间）
function getDebounceDelay(contentLength: number): number {
  if (contentLength < 1000) return 100;      // 小文档
  if (contentLength < 20000) return 150;     // 中等/较大文档
  return 200;                                 // 大文档
}

const PreviewComponent = forwardRef<PreviewRef, PreviewProps>(({
  content,
  theme,
  fontSize = 16,
  onScroll,
  isComposing = false,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedContent, setDebouncedContent] = useState(content);
  const lastContentRef = useRef(content);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    getScrollContainer: () => containerRef.current,
    scrollTo: (top: number) => {
      if (containerRef.current) {
        containerRef.current.scrollTop = top;
      }
    },
  }));
  
  // 所有文档都使用防抖，根据大小调整延迟；IME 组合输入期间暂停更新
  useEffect(() => {
    // 清除之前的定时器
    if (renderTimerRef.current) {
      clearTimeout(renderTimerRef.current);
    }

    if (isComposing) {
      // 组合输入中：暂停预览更新
      return;
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
  }, [content, isComposing]);

  // 组合输入结束后，立即触发一次更新
  useEffect(() => {
    if (!isComposing) {
      setDebouncedContent(content);
      lastContentRef.current = content;
    }
  }, [isComposing, content]);
  
  // 解析 Markdown - 使用 useMemo 缓存，并 sanitize 防止 XSS
  const deferredContent = useDeferredValue(debouncedContent);
  const html = useMemo(() => {
    const raw = parseMarkdown(deferredContent);
    return sanitizeMarkdownHtml(raw);
  }, [deferredContent]);
  
  // 获取主题类名
  const themeClass = useMemo(() => {
    const themeConfig = THEMES.find(t => t.id === theme);
    return themeConfig?.className || 'theme-github';
  }, [theme]);

  // 渲染特殊元素 (KaTeX, Mermaid)
  const renderSpecialElements = useCallback(async () => {
    if (!containerRef.current) return;

    const el = containerRef.current;
    const hasMath = /\$|\$\$/m.test(lastContentRef.current);
    const hasMermaid = /```mermaid/m.test(lastContentRef.current);

    if (hasMath) {
      const { renderMathInElement } = await lazyLoadKaTeX();
      renderMathInElement(el);
    }

    if (hasMermaid) {
      try {
        const { renderMermaidInElement } = await lazyLoadMermaid();
        await renderMermaidInElement(el);
      } catch (e) {
        console.error('Mermaid rendering failed:', e);
      }
    }
  }, []);

  // 渲染数学公式和 Mermaid 图表（尽量在空闲期执行，降低抢占）
  useEffect(() => {
    perfMark('preview_commit_start');
    runWhenIdle(() => {
      renderSpecialElements();
      perfMark('preview_commit_end');
    }, 500);
  }, [html, renderSpecialElements]);

  // 监听滚动事件
  useEffect(() => {
    if (!containerRef.current || !onScroll) return;

    const handleScroll = () => {
      if (containerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        onScroll(scrollTop, scrollHeight, clientHeight);
      }
    };

    containerRef.current.addEventListener('scroll', handleScroll);
    return () => {
      containerRef.current?.removeEventListener('scroll', handleScroll);
    };
  }, [onScroll]);

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
});

// 🚀 性能优化：使用 React.memo 避免不必要的重渲染
// 只有当 content、theme 或 fontSize 改变时才重新渲染
export const Preview = memo(PreviewComponent, (prevProps, nextProps) => {
  return (
    prevProps.content === nextProps.content &&
    prevProps.theme === nextProps.theme &&
    prevProps.fontSize === nextProps.fontSize &&
    prevProps.isComposing === nextProps.isComposing
  );
});
