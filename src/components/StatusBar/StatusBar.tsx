import { memo, useMemo } from 'react';
import { useEditorStore } from '../../stores/editor';
import { THEMES, CODE_THEMES } from '../../themes';

interface StatusBarProps {
  content: string;
  isComposing: boolean;
  onCycleTheme: () => void;
  onCycleCodeTheme: () => void;
  onSwitchView: (mode: 'edit' | 'split' | 'preview') => void;
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
  isComposing,
  onCycleTheme,
  onCycleCodeTheme,
  onSwitchView,
}: StatusBarProps) {
  const stats = useMemo(() => computeStats(content), [content]);

  // Read live state directly from the store — avoids re-rendering App on cursor moves
  const filePath = useEditorStore((s) => s.filePath);
  const isModified = useEditorStore((s) => s.isModified);
  const vimMode = useEditorStore((s) => s.vimMode);
  const theme = useEditorStore((s) => s.theme);
  const codeTheme = useEditorStore((s) => s.codeTheme);
  const cursor = useEditorStore((s) => s.cursor);
  const selection = useEditorStore((s) => s.selection);
  const showEditor = useEditorStore((s) => s.showEditor);
  const showPreview = useEditorStore((s) => s.showPreview);

  const fileName = filePath ? filePath.split(/[/\\]/).pop() : 'untitled.md';
  const themeName = THEMES.find(t => t.id === theme)?.name ?? theme;
  const codeThemeName = CODE_THEMES.find(t => t.id === codeTheme)?.name ?? codeTheme;
  const encoding = 'UTF-8';
  const hasSelection = selection.chars > 0;
  const viewMode: 'edit' | 'split' | 'preview' = showEditor && showPreview ? 'split' : showEditor ? 'edit' : 'preview';

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <span
          className={`status-save ${isModified ? 'status-modified' : 'status-saved'}`}
          title={isModified ? '未保存' : (filePath ? '已保存' : '未保存')}
        >{isModified ? '●' : '✓'}</span>
        <span className="status-item status-filename" title={filePath || '未保存'}>{fileName}</span>
        <span className="status-sep">|</span>
        <span className="status-view-switcher">
          {(['edit', 'split', 'preview'] as const).map((mode, i) => (
            <span key={mode}>
              {i > 0 && <span className="status-view-sep">/</span>}
              <span
                className={`status-view-btn ${viewMode === mode ? 'active' : ''}`}
                title={mode === 'edit' ? '仅编辑' : mode === 'split' ? '分屏' : '仅预览'}
                onClick={() => onSwitchView(mode)}
              >{mode === 'edit' ? '编辑' : mode === 'split' ? '分屏' : '预览'}</span>
            </span>
          ))}
        </span>
        <span className="status-sep">|</span>
        <span className="status-item" title="光标位置">行 {cursor.line} 列 {cursor.col}</span>
        {hasSelection && (
          <>
            <span className="status-sep">|</span>
            <span className="status-item status-sel" title="选中字数">选中 {selection.chars} 字 · {selection.words} 词</span>
          </>
        )}
      </div>
      <div className="status-bar-right">
        {isComposing && <span className="status-item status-composing">IME</span>}
        {vimMode && <span className="status-item status-vim">VIM</span>}
        <span
          className="status-item status-theme"
          title="点击切换文章主题"
          onClick={onCycleTheme}
        >{themeName}</span>
        <span className="status-sep">·</span>
        <span
          className="status-item status-theme"
          title="点击切换代码主题"
          onClick={onCycleCodeTheme}
        >{codeThemeName}</span>
        <span className="status-sep">|</span>
        <span className="status-item" title="总字符数">{stats.chars} 字符</span>
        <span className="status-item status-optional" title="不含空格字符数">{stats.charsNoSpace}(no space)</span>
        <span className="status-item" title="字数 / 词数">{stats.wordCount} 字</span>
        <span className="status-item" title="行数">{stats.lines} 行</span>
        <span className="status-item status-optional" title="预计阅读时间">{stats.readingMinutes} 分</span>
        <span className="status-item status-optional">{encoding}</span>
      </div>
    </footer>
  );
});
