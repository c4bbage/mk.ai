import { useEffect, useRef, useCallback } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { getImageFromClipboard, processImage } from '../../lib/image';
import type { ImageStorageStrategy } from '../../types';
import './Editor.css';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  fontSize?: number;
  imageStorage?: ImageStorageStrategy;
  filePath?: string;
}

export function Editor({ 
  value, 
  onChange, 
  fontSize = 16,
  imageStorage = 'assets',
  filePath,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const isInternalChange = useRef(false);

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
        isInternalChange.current = true;
        onChange(update.state.doc.toString());
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
            fontSize: `${fontSize}px`,
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
      ],
    });

    editorRef.current = new EditorView({
      state,
      parent: containerRef.current,
    });

    // 添加粘贴事件监听
    containerRef.current.addEventListener('paste', handlePaste);

    return () => {
      containerRef.current?.removeEventListener('paste', handlePaste);
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, [fontSize, handlePaste]);

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

  return (
    <div className="editor-container" ref={containerRef} />
  );
}
