import { memo, useMemo } from 'react';

interface StatusBarProps {
  content: string;
  filePath?: string;
  isModified: boolean;
  isComposing: boolean;
  vimMode: boolean;
}

function computeStats(content: string) {
  const chars = content.length;
  const charsNoSpace = content.replace(/\s/g, '').length;
  const lines = content ? content.split('\n').length : 0;
  // CJK characters counted individually
  const cjk = (content.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  // Non-CJK words (split by whitespace, excluding pure-CJK tokens)
  const nonCjkWords = content
    .replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  // total "word count": CJK chars + non-CJK words (no double-counting)
  const wordCount = cjk + nonCjkWords;
  // Reading time: CJK chars at 400/min, non-CJK words at 200 wpm
  const readingMinutes = Math.max(1, Math.ceil(cjk / 400 + nonCjkWords / 200));
  return { chars, charsNoSpace, lines, wordCount, readingMinutes };
}

export const StatusBar = memo(function StatusBar({
  content,
  filePath,
  isModified,
  isComposing,
  vimMode,
}: StatusBarProps) {
  const stats = useMemo(() => computeStats(content), [content]);
  const fileName = filePath ? filePath.split(/[/\\]/).pop() : 'untitled.md';
  const encoding = 'UTF-8';

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <span className="status-item" title={filePath || '未保存'}>
          {isModified ? '● ' : ''}{fileName}
        </span>
      </div>
      <div className="status-bar-right">
        {isComposing && <span className="status-item status-composing">IME</span>}
        {vimMode && <span className="status-item status-vim">VIM</span>}
        <span className="status-item" title="总字符数">{stats.chars} chars</span>
        <span className="status-item" title="不含空格字符数">{stats.charsNoSpace} (no space)</span>
        <span className="status-item" title="词数/字数">{stats.wordCount} words</span>
        <span className="status-item" title="行数">{stats.lines} lines</span>
        <span className="status-item" title="预计阅读时间">{stats.readingMinutes} min read</span>
        <span className="status-item">{encoding}</span>
      </div>
    </footer>
  );
}, (prev, next) =>
  prev.content === next.content
  && prev.filePath === next.filePath
  && prev.isModified === next.isModified
  && prev.isComposing === next.isComposing
  && prev.vimMode === next.vimMode
);
