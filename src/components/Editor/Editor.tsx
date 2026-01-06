import { useEffect, useRef, useCallback } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { getImageFromClipboard, processImage } from '../../lib/image';
import './Editor.css';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  fontSize?: number;
}

export function Editor({ value, onChange, fontSize = 16 }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const isInternalChange = useRef(false);

  // 处理图片粘贴
  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const imageFile = getImageFromClipboard(event);
    if (imageFile && editorRef.current) {
      event.preventDefault();
      try {
        const imageMarkdown = await processImage(imageFile, 'base64');
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
        history(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap]),
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
