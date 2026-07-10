import { useMemo, useCallback, useRef, useState } from 'react';
import './Outline.css';

interface OutlineItem {
  level: number;
  text: string;
  id: string;
  lineIndex: number;
}

interface OutlineProps {
  content: string;
  onItemClick?: (id: string) => void;
  onHeadingLevelChange?: (lineIndex: number, newPrefix: string) => void;
  onHeadingMove?: (fromStart: number, fromEnd: number, insertAt: number) => void;
  canEdit?: boolean;
}

function extractHeadings(content: string): OutlineItem[] {
  const lines = content.split('\n');
  const headings: OutlineItem[] = [];
  let idCounter = 0;
  let inCodeBlock = false;
  let inMathBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (trimmed === '$$') {
      inMathBlock = !inMathBlock;
      continue;
    }
    if (inCodeBlock || inMathBlock) continue;

    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const rawText = match[2].trim();
      // Strip Markdown inline syntax for display: *italic*, **bold**, `code`, [text](url)
      const displayText = rawText
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, '');
      headings.push({
        level: match[1].length,
        text: displayText,
        id: `heading-${idCounter++}`,
        lineIndex: i,
      });
    }
  }

  return headings;
}

export function Outline({ content, onItemClick, onHeadingLevelChange, onHeadingMove, canEdit }: OutlineProps) {
  const headings = useMemo(() => extractHeadings(content), [content]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounter = useRef(0);

  const handlePromote = useCallback((e: React.MouseEvent, h: OutlineItem) => {
    e.stopPropagation();
    const newLevel = Math.max(1, h.level - 1);
    onHeadingLevelChange?.(h.lineIndex, '#'.repeat(newLevel));
  }, [onHeadingLevelChange]);

  const handleDemote = useCallback((e: React.MouseEvent, h: OutlineItem) => {
    e.stopPropagation();
    const newLevel = Math.min(6, h.level + 1);
    onHeadingLevelChange?.(h.lineIndex, '#'.repeat(newLevel));
  }, [onHeadingLevelChange]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setDragOverIndex(null);
      dragCounter.current = 0;
    }
  }, []);

  const handleDragEnter = useCallback(() => {
    dragCounter.current++;
  }, []);

  const handleDrop = useCallback((index: number) => {
    if (dragIndex === null || dragIndex === index || !onHeadingMove) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const lines = content.split('\n');
    const fromHeading = headings[dragIndex];
    const toHeading = headings[index];

    const fromStart = fromHeading.lineIndex;
    const fromEnd = headings[dragIndex + 1]?.lineIndex ?? lines.length;
    const blockLen = fromEnd - fromStart;

    const insertAt = toHeading.lineIndex > fromStart
      ? toHeading.lineIndex - blockLen
      : toHeading.lineIndex;

    onHeadingMove(fromStart, fromEnd, insertAt);
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, headings, content, onHeadingMove]);

  if (headings.length === 0) {
    return (
      <div className="outline-empty">
        <span className="outline-empty-icon">📄</span>
        <span className="outline-empty-text">暂无标题</span>
      </div>
    );
  }

  const minLevel = Math.min(...headings.map(h => h.level));

  return (
    <nav className="outline">
      <div className="outline-header">
        <span className="outline-icon">📑</span>
        <span className="outline-title">大纲</span>
        {canEdit && (
          <span className="outline-hint">拖拽排序 · ◀▶ 调级</span>
        )}
      </div>
      <ul className="outline-list">
        {headings.map((heading, index) => (
          <li
            key={heading.id}
            className={`outline-item outline-level-${heading.level} ${dragIndex === index ? 'dragging' : ''} ${dragOverIndex === index && dragIndex !== null && dragIndex !== index ? 'drag-over' : ''}`}
            style={{ paddingLeft: `${(heading.level - minLevel) * 16 + 12}px` }}
            onClick={() => onItemClick?.(heading.id)}
            draggable={!!canEdit}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={(e) => { e.preventDefault(); handleDrop(index); }}
            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
          >
            <span className="outline-bullet">•</span>
            <span className="outline-text">{heading.text}</span>
            {canEdit && (
              <span className="outline-controls">
                <button
                  className="outline-level-btn"
                  title="升级"
                  disabled={heading.level <= 1}
                  onClick={(e) => handlePromote(e, heading)}
                >◀</button>
                <button
                  className="outline-level-btn"
                  title="降级"
                  disabled={heading.level >= 6}
                  onClick={(e) => handleDemote(e, heading)}
                >▶</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
