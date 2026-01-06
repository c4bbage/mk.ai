import { useMemo } from 'react';
import './Outline.css';

interface OutlineItem {
  level: number;
  text: string;
  id: string;
}

interface OutlineProps {
  content: string;
  onItemClick?: (id: string) => void;
}

/**
 * 从 Markdown 内容中提取标题
 */
function extractHeadings(content: string): OutlineItem[] {
  const headings: OutlineItem[] = [];
  const lines = content.split('\n');
  
  let idCounter = 0;
  
  for (const line of lines) {
    // 匹配 # 开头的标题
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = `heading-${idCounter++}`;
      headings.push({ level, text, id });
    }
  }
  
  return headings;
}

export function Outline({ content, onItemClick }: OutlineProps) {
  const headings = useMemo(() => extractHeadings(content), [content]);
  
  if (headings.length === 0) {
    return (
      <div className="outline-empty">
        <span className="outline-empty-icon">📄</span>
        <span className="outline-empty-text">暂无标题</span>
      </div>
    );
  }
  
  // 找到最小的标题级别作为基准
  const minLevel = Math.min(...headings.map(h => h.level));
  
  return (
    <nav className="outline">
      <div className="outline-header">
        <span className="outline-icon">📑</span>
        <span className="outline-title">大纲</span>
      </div>
      <ul className="outline-list">
        {headings.map((heading) => (
          <li
            key={heading.id}
            className={`outline-item outline-level-${heading.level}`}
            style={{ paddingLeft: `${(heading.level - minLevel) * 16 + 12}px` }}
            onClick={() => onItemClick?.(heading.id)}
          >
            <span className="outline-bullet">•</span>
            <span className="outline-text">{heading.text}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
