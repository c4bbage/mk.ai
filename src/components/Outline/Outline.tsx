import { useMemo, useCallback, useRef, useState } from 'react';
import { parseMarkdownToBlocks } from '../../lib/markdown-blocks';
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
  onHeadingsChange?: (newContent: string) => void;
}

function extractHeadings(content: string): OutlineItem[] {
  const blocks = parseMarkdownToBlocks(content);
  const headings: OutlineItem[] = [];
  let idCounter = 0;
  let lineCursor = 0;

  for (const block of blocks) {
    const blockLines = block.content.split('\n').length;
    if (block.type === 'heading') {
      const match = block.content.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          id: `heading-${idCounter++}`,
          lineIndex: lineCursor,
        });
      }
    }
    lineCursor += blockLines;
  }

  return headings;
}

export function Outline({ content, onItemClick, onHeadingsChange }: OutlineProps) {
  const headings = useMemo(() => extractHeadings(content), [content]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragCounter = useRef(0);

  const modifyHeadingLine = useCallback((lineIdx: number, newPrefix: string) => {
    if (!onHeadingsChange) return;
    const lines = content.split('\n');
    if (lineIdx >= lines.length) return;
    const line = lines[lineIdx];
    const stripped = line.replace(/^#{1,6}\s*/, '');
    lines[lineIdx] = newPrefix ? `${newPrefix} ${stripped}` : stripped;
    onHeadingsChange(lines.join('\n'));
  }, [content, onHeadingsChange]);

  const handlePromote = useCallback((e: React.MouseEvent, h: OutlineItem) => {
    e.stopPropagation();
    const newLevel = Math.max(1, h.level - 1);
    modifyHeadingLine(h.lineIndex, '#'.repeat(newLevel));
  }, [modifyHeadingLine]);

  const handleDemote = useCallback((e: React.MouseEvent, h: OutlineItem) => {
    e.stopPropagation();
    const newLevel = Math.min(6, h.level + 1);
    modifyHeadingLine(h.lineIndex, '#'.repeat(newLevel));
  }, [modifyHeadingLine]);

  // Drag reorder: move the heading block (all its lines) to a new position
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
    if (dragIndex === null || dragIndex === index || !onHeadingsChange) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const lines = content.split('\n');
    const fromHeading = headings[dragIndex];
    const toHeading = headings[index];

    const fromStart = fromHeading.lineIndex;
    const fromEnd = headings[dragIndex + 1]?.lineIndex ?? lines.length;

    const movedBlock = lines.slice(fromStart, fromEnd);
    const blockLen = movedBlock.length;

    const newLines = [...lines];
    newLines.splice(fromStart, blockLen);

    const insertAt = toHeading.lineIndex > fromStart
      ? toHeading.lineIndex - blockLen
      : toHeading.lineIndex;

    newLines.splice(insertAt, 0, ...movedBlock);

    onHeadingsChange(newLines.join('\n'));
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, headings, content, onHeadingsChange]);

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
        {onHeadingsChange && (
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
            draggable={!!onHeadingsChange}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={(e) => { e.preventDefault(); handleDrop(index); }}
            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
          >
            <span className="outline-bullet">•</span>
            <span className="outline-text">{heading.text}</span>
            {onHeadingsChange && (
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
