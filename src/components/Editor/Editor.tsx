import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { vim } from '@replit/codemirror-vim';
import { getImageFromClipboard, processImage, getImageFromDrop } from '../../lib/image';
import { buildFontFamily, FONT_PRESETS, CODE_FONT_PRESETS } from '../../themes';
import type { ImageStorageStrategy } from '../../types';
import './Editor.css';
import { perfMark } from '../../lib/performance';

/** CJK-aware word count (matches StatusBar computeStats logic) */
function countWords(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const nonCjkWords = text
    .replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return cjk + nonCjkWords;
}

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  fontSize?: number;
  fontId?: string;
  codeFontId?: string;
  vimMode?: boolean;
  imageStorage?: ImageStorageStrategy;
  filePath?: string;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  onCompositionStart?: () => void;
  onCompositionEnd?: () => void;
  onCursorChange?: (line: number, col: number, selectionChars: number, selectionWords: number) => void;
}

export interface EditorRef {
  getScrollContainer: () => HTMLElement | null;
  scrollTo: (top: number) => void;
  getSelectionLine: () => number | null;
  getLineCount: () => number;
  focus: () => void;
  /** Wrap current selection with prefix/suffix (e.g. bold, italic) */
  wrapSelection: (prefix: string, suffix: string) => void;
  /** Set heading level for current line (1-6), 0 to remove */
  setHeadingLevel: (level: number) => void;
  /** Set heading prefix at a specific line (undo-friendly) */
  setHeadingAtLine: (lineIndex: number, newPrefix: string) => void;
  /** Move lines [fromStart, fromEnd) to insertAt (undo-friendly) */
  moveLines: (fromStart: number, fromEnd: number, insertAt: number) => void;
  /** Scroll to a specific 0-based line index */
  scrollToLine: (lineIndex: number) => void;
  /** Insert text at cursor */
  insertAtCursor: (text: string) => void;
}

export const Editor = forwardRef<EditorRef, EditorProps>(function Editor({
  value,
  onChange,
  fontSize = 16,
  fontId = 'system',
  codeFontId = 'jetbrains',
  vimMode = false,
  imageStorage = 'assets',
  filePath,
  onScroll,
  onCompositionStart,
  onCompositionEnd,
  onCursorChange,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const isInternalChange = useRef(false);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const fontSizeCompartmentRef = useRef(new Compartment());
  const vimCompartmentRef = useRef(new Compartment());
  const fontSizeRef = useRef(fontSize);
  useEffect(() => { fontSizeRef.current = fontSize; }, [fontSize]);

  // Keep latest callbacks in refs to avoid stale closures in the init effect
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const onScrollRef = useRef(onScroll);
  useEffect(() => { onScrollRef.current = onScroll; }, [onScroll]);
  const onCompositionStartRef = useRef(onCompositionStart);
  useEffect(() => { onCompositionStartRef.current = onCompositionStart; }, [onCompositionStart]);
  const onCompositionEndRef = useRef(onCompositionEnd);
  useEffect(() => { onCompositionEndRef.current = onCompositionEnd; }, [onCompositionEnd]);
  const onCursorChangeRef = useRef(onCursorChange);
  useEffect(() => { onCursorChangeRef.current = onCursorChange; }, [onCursorChange]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    getScrollContainer: () => scrollContainerRef.current,
    scrollTo: (top: number) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = top;
      }
    },
    getSelectionLine: () => {
      const view = editorRef.current;
      if (!view) return null;
      const pos = view.state.selection.main.head;
      return view.state.doc.lineAt(pos).number;
    },
    getLineCount: () => {
      const view = editorRef.current;
      return view ? view.state.doc.lines : 0;
    },
    focus: () => {
      editorRef.current?.focus();
    },
    wrapSelection: (prefix: string, suffix: string) => {
      const view = editorRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to);
      // If already wrapped, unwrap
      if (selected.startsWith(prefix) && selected.endsWith(suffix)) {
        const unwrapped = selected.slice(prefix.length, selected.length - suffix.length);
        view.dispatch({ changes: { from, to, insert: unwrapped }, selection: { anchor: from, head: from + unwrapped.length } });
      } else {
        const wrapped = prefix + selected + suffix;
        view.dispatch({ changes: { from, to, insert: wrapped }, selection: { anchor: from + prefix.length, head: from + prefix.length + selected.length } });
      }
      view.focus();
    },
    setHeadingLevel: (level: number) => {
      const view = editorRef.current;
      if (!view) return;
      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;
      // Remove existing heading prefix
      const stripped = lineText.replace(/^#{1,6}\s*/, '');
      const newPrefix = level > 0 ? '#'.repeat(level) + ' ' : '';
      const newText = newPrefix + stripped;
      view.dispatch({ changes: { from: line.from, to: line.to, insert: newText } });
      view.focus();
    },
    setHeadingAtLine: (lineIndex: number, newPrefix: string) => {
      const view = editorRef.current;
      if (!view) return;
      const lineCount = view.state.doc.lines;
      if (lineIndex < 0 || lineIndex >= lineCount) return;
      const line = view.state.doc.line(lineIndex + 1);
      const stripped = line.text.replace(/^#{1,6}\s*/, '');
      const newText = newPrefix ? `${newPrefix} ${stripped}` : stripped;
      view.dispatch({ changes: { from: line.from, to: line.to, insert: newText } });
      view.focus();
    },
    moveLines: (fromStart: number, fromEnd: number, insertAt: number) => {
      const view = editorRef.current;
      if (!view) return;
      const doc = view.state.doc;
      const lineCount = doc.lines;
      if (fromStart < 0 || fromEnd > lineCount || fromStart >= fromEnd) return;

      const lines = doc.toString().split('\n');
      const movedBlock = lines.slice(fromStart, fromEnd);
      const remaining = lines.slice(0, fromStart).concat(lines.slice(fromEnd));
      const insertPos = insertAt > fromStart ? insertAt - (fromEnd - fromStart) : insertAt;
      const clampedPos = Math.max(0, Math.min(insertPos, remaining.length));
      const newLines = remaining.slice(0, clampedPos).concat(movedBlock, remaining.slice(clampedPos));

      const rangeStart = Math.min(fromStart, clampedPos);
      const rangeEnd = Math.max(fromEnd, clampedPos + movedBlock.length);
      const newText = newLines.slice(rangeStart, rangeEnd).join('\n');

      const startLine = doc.line(rangeStart + 1);
      const endLine = doc.line(rangeEnd);
      view.dispatch({
        changes: { from: startLine.from, to: endLine.to, insert: newText },
      });
      view.focus();
    },
    insertAtCursor: (text: string) => {
      const view = editorRef.current;
      if (!view) return;
      const pos = view.state.selection.main.head;
      view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
      view.focus();
    },
    scrollToLine: (lineIndex: number) => {
      const view = editorRef.current;
      if (!view) return;
      const lineCount = view.state.doc.lines;
      if (lineIndex < 0 || lineIndex >= lineCount) return;
      const line = view.state.doc.line(lineIndex + 1);
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
      });
      view.focus();
    },
  }));

  // 处理图片粘贴 — 使用 ref 避免 imageStorage/filePath 变化时重建编辑器
  const imageStorageRef = useRef(imageStorage);
  useEffect(() => { imageStorageRef.current = imageStorage; }, [imageStorage]);
  const filePathRef = useRef(filePath);
  useEffect(() => { filePathRef.current = filePath; }, [filePath]);

  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const imageFile = getImageFromClipboard(event);
    if (imageFile && editorRef.current) {
      event.preventDefault();
      try {
        const currentImageStorage = imageStorageRef.current;
        const currentFilePath = filePathRef.current;
        if (!currentFilePath && currentImageStorage !== 'base64') {
          console.warn('Document not saved, using base64 for image');
        }

        const imageMarkdown = await processImage(imageFile, currentImageStorage, currentFilePath);
        const view = editorRef.current;
        const { from } = view.state.selection.main;
        view.dispatch({
          changes: { from, insert: imageMarkdown },
          selection: { anchor: from + imageMarkdown.length },
        });
      } catch (error) {
        console.error('Failed to process image:', error);
      }
    }
  }, []);

  // 初始化编辑器
  useEffect(() => {
    const container = containerRef.current;
    if (!container || editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        perfMark('editor_input');
        isInternalChange.current = true;
        onChangeRef.current(update.state.doc.toString());
        perfMark('editor_input_applied');
      }
      // Report cursor position + selection stats on doc / selection changes
      if (update.docChanged || update.selectionSet) {
        const sel = update.state.selection.main;
        const line = update.state.doc.lineAt(sel.head);
        const selText = update.state.sliceDoc(sel.from, sel.to);
        onCursorChangeRef.current?.(
          line.number,
          sel.head - line.from + 1,
          sel.to - sel.from,
          countWords(selText),
        );
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        history(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        // 搜索功能
        search({
          top: true, // 搜索框在顶部
        }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        updateListener,
        EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            height: '100%',
          },
          '.cm-scroller': {
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            overflow: 'auto',
          },
          '.cm-content': {
            padding: '16px 0',
          },
          '.cm-line': {
            padding: '0 16px',
          },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            border: 'none',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
          },
          // 搜索面板样式
          '.cm-panels': {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
          },
          '.cm-panel.cm-search': {
            padding: '8px 12px',
          },
          '.cm-panel.cm-search input': {
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid rgba(0, 0, 0, 0.15)',
            fontSize: '13px',
            outline: 'none',
            marginRight: '4px',
          },
          '.cm-panel.cm-search input:focus': {
            borderColor: '#667eea',
            boxShadow: '0 0 0 2px rgba(102, 126, 234, 0.2)',
          },
          '.cm-panel.cm-search button': {
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid rgba(0, 0, 0, 0.15)',
            background: 'rgba(255, 255, 255, 0.8)',
            cursor: 'pointer',
            fontSize: '13px',
            marginRight: '4px',
          },
          '.cm-panel.cm-search button:hover': {
            background: 'rgba(102, 126, 234, 0.1)',
          },
          '.cm-panel.cm-search label': {
            fontSize: '13px',
            marginRight: '8px',
          },
          // 搜索高亮
          '.cm-selectionMatch': {
            backgroundColor: 'rgba(255, 235, 59, 0.4)',
          },
          '.cm-searchMatch': {
            backgroundColor: 'rgba(255, 193, 7, 0.3)',
          },
          '.cm-searchMatch.cm-searchMatch-selected': {
            backgroundColor: 'rgba(255, 152, 0, 0.5)',
          },
        }),
        fontSizeCompartmentRef.current.of(EditorView.theme({
          '&': {
            fontSize: `${fontSizeRef.current}px`,
          },
          '.cm-scroller': {
            fontFamily: buildFontFamily(FONT_PRESETS.find(f => f.id === fontId) || FONT_PRESETS[0]),
          },
          '.cm-content .cm-code, .cm-line .cm-code': {
            fontFamily: buildFontFamily(CODE_FONT_PRESETS.find(f => f.id === codeFontId) || CODE_FONT_PRESETS[0]),
          },
        })),
        vimCompartmentRef.current.of(vimMode ? vim() : []),
      ],
    });

    editorRef.current = new EditorView({
      state,
      parent: container,
    });

    // Report initial cursor position + selection
    {
      const sel = state.selection.main;
      const line = state.doc.lineAt(sel.head);
      const selText = state.sliceDoc(sel.from, sel.to);
      onCursorChangeRef.current?.(
        line.number,
        sel.head - line.from + 1,
        sel.to - sel.from,
        countWords(selText),
      );
    }

    // 暂存 handlePaste 供 cleanup 使用
    const pasteHandler = handlePaste;
    // First interactive: editor ready to accept input
    perfMark('first_interactive');

    // 获取滚动容器 (.cm-scroller)
    const scrollContainer = container.querySelector('.cm-scroller') as HTMLElement | null;
    scrollContainerRef.current = scrollContainer;

    // 添加粘贴事件监听
    container.addEventListener('paste', handlePaste, true);
    // 添加拖拽事件监听（图片插入）— 使用 ref 读取最新值
    const handleDrop = async (event: DragEvent) => {
      const imageFile = getImageFromDrop(event);
      if (imageFile && editorRef.current) {
        event.preventDefault();
        event.stopPropagation();
        try {
          const imageMarkdown = await processImage(imageFile, imageStorageRef.current, filePathRef.current);
          const view = editorRef.current;
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
          view.dispatch({
            changes: { from: pos, insert: imageMarkdown },
            selection: { anchor: pos + imageMarkdown.length },
          });
        } catch (error) {
          console.error('Failed to process dropped image:', error);
        }
      }
    };
    container.addEventListener('drop', handleDrop, true);
    const handleDragOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    container.addEventListener('dragover', handleDragOver);

    // 监听 IME 组合输入，通知外层暂停预览更新
    const handleCompositionStart = () => {
      if (typeof onCompositionStartRef.current === 'function') onCompositionStartRef.current();
    };
    const handleCompositionEnd = () => {
      if (typeof onCompositionEndRef.current === 'function') onCompositionEndRef.current();
    };
    container.addEventListener('compositionstart', handleCompositionStart);
    container.addEventListener('compositionend', handleCompositionEnd);

    // 添加滚动事件监听
    const currentOnScroll = onScrollRef.current;
    let handleScroll: (() => void) | null = null;
    if (scrollContainer && currentOnScroll) {
      handleScroll = () => {
        if (scrollContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
          currentOnScroll(scrollTop, scrollHeight, clientHeight);
        }
      };
      scrollContainer.addEventListener('scroll', handleScroll);
    }

    return () => {
      container.removeEventListener('paste', pasteHandler, true);
      container.removeEventListener('drop', handleDrop, true);
      container.removeEventListener('dragover', handleDragOver);
      container.removeEventListener('compositionstart', handleCompositionStart);
      container.removeEventListener('compositionend', handleCompositionEnd);
      if (handleScroll && scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [handlePaste]);
  // handlePaste is stable (useCallback with []), so this runs once.

  // 同步外部值变化
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      const currentValue = editorRef.current.state.doc.toString();
      if (currentValue !== value) {
        editorRef.current.dispatch({
          changes: {
            from: 0,
            to: currentValue.length,
            insert: value,
          },
        });
      }
    }
    isInternalChange.current = false;
  }, [value]);

  // 运行时字体大小 + 字体族更新
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.dispatch({
        effects: fontSizeCompartmentRef.current.reconfigure(
          EditorView.theme({
            '&': {
              fontSize: `${fontSize}px`,
            },
            '.cm-scroller': {
              fontFamily: buildFontFamily(FONT_PRESETS.find(f => f.id === fontId) || FONT_PRESETS[0]),
            },
            '.cm-content .cm-code, .cm-line .cm-code': {
              fontFamily: buildFontFamily(CODE_FONT_PRESETS.find(f => f.id === codeFontId) || CODE_FONT_PRESETS[0]),
            },
          })
        ),
      });
    }
  }, [fontSize, fontId, codeFontId]);

  // Vim 模式切换
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.dispatch({
        effects: vimCompartmentRef.current.reconfigure(vimMode ? vim() : []),
      });
    }
  }, [vimMode]);

  return (
    <div className="editor-container" ref={containerRef} />
  );
});
