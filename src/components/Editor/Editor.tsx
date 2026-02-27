import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { getImageFromClipboard, processImage } from '../../lib/image';
import type { ImageStorageStrategy } from '../../types';
import './Editor.css';
import { perfMark } from '../../lib/performance';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  fontSize?: number;
  imageStorage?: ImageStorageStrategy;
  filePath?: string;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  onCompositionStart?: () => void;
  onCompositionEnd?: () => void;
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
  /** Insert text at cursor */
  insertAtCursor: (text: string) => void;
}

export const Editor = forwardRef<EditorRef, EditorProps>(function Editor({
  value,
  onChange,
  fontSize = 16,
  imageStorage = 'assets',
  filePath,
  onScroll,
  onCompositionStart,
  onCompositionEnd,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const isInternalChange = useRef(false);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const fontSizeCompartmentRef = useRef(new Compartment());

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
    insertAtCursor: (text: string) => {
      const view = editorRef.current;
      if (!view) return;
      const pos = view.state.selection.main.head;
      view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
      view.focus();
    },
  }));

  // 处理图片粘贴
  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const imageFile = getImageFromClipboard(event);
    if (imageFile && editorRef.current) {
      event.preventDefault();
      try {
        // 如果没有保存文档且不是 base64 模式，提示用户先保存
        if (!filePath && imageStorage !== 'base64') {
          console.warn('Document not saved, using base64 for image');
        }
        
        const imageMarkdown = await processImage(imageFile, imageStorage, filePath);
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
  }, [imageStorage, filePath]);

  // 初始化编辑器
  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        perfMark('editor_input');
        isInternalChange.current = true;
        onChange(update.state.doc.toString());
        perfMark('editor_input_applied');
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
            fontSize: `${fontSize}px`,
          },
        })),
      ],
    });

    editorRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });
    // First interactive: editor ready to accept input
    perfMark('first_interactive');

    // 获取滚动容器 (.cm-scroller)
    scrollContainerRef.current = containerRef.current.querySelector('.cm-scroller');

    // 添加粘贴事件监听
    containerRef.current.addEventListener('paste', handlePaste);

    // 监听 IME 组合输入，通知外层暂停预览更新
    const handleCompositionStart = () => {
      if (typeof onCompositionStart === 'function') onCompositionStart();
    };
    const handleCompositionEnd = () => {
      if (typeof onCompositionEnd === 'function') onCompositionEnd();
    };
    containerRef.current.addEventListener('compositionstart', handleCompositionStart);
    containerRef.current.addEventListener('compositionend', handleCompositionEnd);

    // 添加滚动事件监听
    if (scrollContainerRef.current && onScroll) {
      const handleScroll = () => {
        if (scrollContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
          onScroll(scrollTop, scrollHeight, clientHeight);
        }
      };
      scrollContainerRef.current.addEventListener('scroll', handleScroll);
      
      return () => {
        containerRef.current?.removeEventListener('paste', handlePaste);
        containerRef.current?.removeEventListener('compositionstart', handleCompositionStart);
        containerRef.current?.removeEventListener('compositionend', handleCompositionEnd);
        scrollContainerRef.current?.removeEventListener('scroll', handleScroll);
        editorRef.current?.destroy();
        editorRef.current = null;
      };
    }

    return () => {
      containerRef.current?.removeEventListener('paste', handlePaste);
      containerRef.current?.removeEventListener('compositionstart', handleCompositionStart);
      containerRef.current?.removeEventListener('compositionend', handleCompositionEnd);
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [fontSize, handlePaste, onScroll, onCompositionStart, onCompositionEnd]);

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

  // 运行时字体大小更新：使用 Compartment 重新配置，避免重建 EditorView
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.dispatch({
        effects: fontSizeCompartmentRef.current.reconfigure(
          EditorView.theme({
            '&': {
              fontSize: `${fontSize}px`,
            },
          })
        ),
      });
    }
  }, [fontSize]);

  return (
    <div className="editor-container" ref={containerRef} />
  );
});
