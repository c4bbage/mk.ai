import { useRef, useCallback, useEffect, startTransition, useState } from 'react';
import { useEditorStore } from './stores/editor';
import { Editor, type EditorRef } from './components/Editor';
import { Preview, type PreviewRef, VirtualPreview } from './components/Preview';
import { Toolbar } from './components/Toolbar';
import { Outline } from './components/Outline';
import { FileTree } from './components/FileTree';
import { openFile, saveFile, saveFileAs, getFileName } from './lib/file';
import { isTauri } from './lib/file';
import { exportHTML, exportPDF, exportImage, copyForWeChat } from './lib/export';
import { useAutoSave, getLocalBackup, clearLocalBackup } from './hooks/useAutoSave';
import './App.css';

function App() {
  const previewRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorRef>(null);
  const previewScrollRef = useRef<PreviewRef>(null);
  const [isComposing, setIsComposing] = useState(false); // IME 组合输入状态
  
  const {
    content,
    setContent,
    theme,
    setTheme,
    fontSize,
    setFontSize,
    showEditor,
    showPreview,
    showOutline,
    showFileTree,
    toggleEditor,
    togglePreview,
    toggleOutline,
    toggleFileTree,
    fileName,
    setFileName,
    filePath,
    setFilePath,
    isModified,
    setIsModified,
    imageStorage,
    setImageStorage,
    autoSave,
    autoSaveDelay,
    setAutoSave,
  } = useEditorStore();

  // 打开文件
  const handleOpenFile = useCallback(async () => {
    const result = await openFile();
    if (result) {
      setContent(result.content);
      setFilePath(result.path);
      setFileName(getFileName(result.path));
      setIsModified(false);
    }
  }, [setContent, setFilePath, setFileName, setIsModified]);

  // 保存文件
  const handleSaveFile = useCallback(async () => {
    const savedPath = await saveFile(content, filePath);
    if (savedPath) {
      setFilePath(savedPath);
      setFileName(getFileName(savedPath));
      setIsModified(false);
    }
  }, [content, filePath, setFilePath, setFileName, setIsModified]);

  // 另存为
  const handleSaveFileAs = useCallback(async () => {
    const savedPath = await saveFileAs(content);
    if (savedPath) {
      setFilePath(savedPath);
      setFileName(getFileName(savedPath));
      setIsModified(false);
    }
  }, [content, setFilePath, setFileName, setIsModified]);

  // 导出 HTML
  const handleExportHTML = useCallback(async () => {
    const htmlFileName = fileName.replace(/\.(md|markdown)$/i, '.html') || 'document.html';
    await exportHTML(content, theme, htmlFileName);
  }, [content, theme, fileName]);

  // 导出 PDF
  const handleExportPDF = useCallback(async () => {
    const pdfTitle = fileName.replace(/\.(md|markdown)$/i, '') || 'document';
    await exportPDF(content, theme, pdfTitle);
  }, [content, theme, fileName]);

  // 导出图片
  const handleExportImage = useCallback(async () => {
    const previewElement = previewRef.current?.querySelector('.markdown-body');
    if (previewElement) {
      const imageFileName = fileName.replace(/\.(md|markdown)$/i, '.png') || 'document.png';
      await exportImage(previewElement as HTMLElement, imageFileName);
    }
  }, [fileName]);

  // 复制公众号格式
  const handleCopyWeChat = useCallback(async () => {
    const ok = await copyForWeChat(content, theme);
    if (ok) {
      // 简单的成功提示（非阻塞）
      const toast = document.createElement('div');
      toast.textContent = '已复制公众号格式';
      toast.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 20px;border-radius:8px;font-size:14px;z-index:9999;pointer-events:none;';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }
  }, [content, theme]);

  // 自动保存
  useAutoSave({
    enabled: autoSave,
    delay: autoSaveDelay,
    content,
    filePath,
    isModified,
    onSave: handleSaveFile,
  });

  // 从文件树选择文件
  const handleFileTreeSelect = useCallback(async (path: string) => {
    if (!isTauri()) return;
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const fileContent = await fs.readTextFile(path);
      setContent(fileContent);
      setFilePath(path);
      setFileName(getFileName(path));
      setIsModified(false);
    } catch (e) {
      console.error('[App] Failed to open file from tree:', e);
    }
  }, [setContent, setFilePath, setFileName, setIsModified]);

  // 开发模式下启用 PerformanceObserver 采样（长任务与布局位移）
  // TODO: Ralph 提到但未实现 startLongTaskObserver 和 startLayoutShiftObserver
  // useEffect(() => {
  //   if (import.meta.env.DEV) {
  //     const stopLT = startLongTaskObserver();
  //     const stopLS = startLayoutShiftObserver();
  //     return () => { stopLT(); stopLS(); };
  //   }
  // }, []);

  // 启动时检查是否有本地备份
  useEffect(() => {
    const backup = getLocalBackup();
    if (backup && backup.timestamp > Date.now() - 24 * 60 * 60 * 1000) {
      // 24小时内的备份
      const restore = window.confirm(
        `检测到未保存的内容备份（${new Date(backup.timestamp).toLocaleString()}）\n\n是否恢复？`
      );
      if (restore) {
        setContent(backup.content);
        if (backup.filePath) {
          setFilePath(backup.filePath);
          setFileName(getFileName(backup.filePath));
        }
      }
      clearLocalBackup();
    }
  }, [setContent, setFilePath, setFileName]);

  // 组合输入状态（传递给 Editor/Preview，需保持回调稳定避免重建 Editor）
  const handleCompositionStart = useCallback(() => setIsComposing(true), []);
  const handleCompositionEnd = useCallback(() => setIsComposing(false), []);

  // 编辑/预览切换：根据光标行跳转预览位置
  const scrollPreviewToCursor = useCallback(() => {
    const line = editorRef.current?.getSelectionLine();
    const totalLines = editorRef.current?.getLineCount() || 0;
    const container = previewScrollRef.current?.getScrollContainer();
    if (line == null || totalLines === 0 || !container) return;

    const ratio = totalLines > 1 ? (line - 1) / (totalLines - 1) : 0;
    const scrollable = Math.max(container.scrollHeight - container.clientHeight, 0);
    const target = ratio * scrollable;
    previewScrollRef.current?.scrollTo(target);
  }, []);

  const focusEditor = useCallback(() => {
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const switchToPreviewMode = useCallback(() => {
    if (!showPreview) togglePreview();
    if (showEditor) toggleEditor();
    requestAnimationFrame(scrollPreviewToCursor);
  }, [showEditor, showPreview, toggleEditor, togglePreview, scrollPreviewToCursor]);

  const switchToEditMode = useCallback(() => {
    if (!showEditor) toggleEditor();
    if (showPreview) togglePreview();
    focusEditor();
  }, [showEditor, showPreview, toggleEditor, togglePreview, focusEditor]);

  // Cmd+/ 切换源码/预览模式（对标 Typora）
  const toggleSourcePreview = useCallback(() => {
    if (showEditor && showPreview) {
      // 双栏 → 纯预览
      switchToPreviewMode();
    } else if (showPreview && !showEditor) {
      // 纯预览 → 纯编辑
      switchToEditMode();
    } else {
      // 纯编辑 → 双栏
      if (!showPreview) togglePreview();
      focusEditor();
    }
  }, [showEditor, showPreview, togglePreview, switchToPreviewMode, switchToEditMode, focusEditor]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // 文件操作
      if (isMod && e.key === 'o') {
        e.preventDefault();
        handleOpenFile();
      } else if (isMod && e.shiftKey && e.key === 's') {
        e.preventDefault();
        handleSaveFileAs();
      } else if (isMod && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      } else if (isMod && e.key === '/') {
        // Cmd+/ 切换源码/预览模式（对标 Typora）
        e.preventDefault();
        toggleSourcePreview();
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === 'v') {
        // 保留旧快捷键兼容
        e.preventDefault();
        if (showPreview && !showEditor) {
          switchToEditMode();
        } else {
          switchToPreviewMode();
        }
      }
      // Markdown 格式化快捷键（仅在编辑器可见时生效）
      else if (isMod && showEditor && editorRef.current) {
        if (e.key === 'b') {
          e.preventDefault();
          editorRef.current.wrapSelection('**', '**');
        } else if (e.key === 'i') {
          e.preventDefault();
          editorRef.current.wrapSelection('*', '*');
        } else if (e.key === 'u') {
          e.preventDefault();
          editorRef.current.wrapSelection('<u>', '</u>');
        } else if (e.key === '`' && !e.shiftKey) {
          e.preventDefault();
          editorRef.current.wrapSelection('`', '`');
        } else if (e.key === 'k') {
          e.preventDefault();
          editorRef.current.wrapSelection('[', '](url)');
        } else if (e.shiftKey && e.key === 'X') {
          e.preventDefault();
          editorRef.current.wrapSelection('~~', '~~');
        }
        // Cmd+1~6 标题级别
        else if (e.key >= '1' && e.key <= '6') {
          e.preventDefault();
          editorRef.current.setHeadingLevel(parseInt(e.key));
        } else if (e.key === '0') {
          e.preventDefault();
          editorRef.current.setHeadingLevel(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleOpenFile, handleSaveFile, handleSaveFileAs, showEditor, showPreview, switchToEditMode, switchToPreviewMode, toggleSourcePreview]);

  return (
    <div className="app">
      <Toolbar
        theme={theme}
        onThemeChange={setTheme}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        showEditor={showEditor}
        showPreview={showPreview}
        showOutline={showOutline}
        showFileTree={showFileTree}
        onToggleEditor={toggleEditor}
        onTogglePreview={togglePreview}
        onToggleOutline={toggleOutline}
        onToggleFileTree={toggleFileTree}
        fileName={fileName}
        isModified={isModified}
        onOpenFile={handleOpenFile}
        onSaveFile={handleSaveFile}
        onSaveFileAs={handleSaveFileAs}
        onExportHTML={handleExportHTML}
        onExportPDF={handleExportPDF}
        onExportImage={handleExportImage}
        onCopyWeChat={handleCopyWeChat}
        imageStorage={imageStorage}
        onImageStorageChange={setImageStorage}
        autoSave={autoSave}
        onAutoSaveChange={setAutoSave}
      />
      
      <div className="app-content">
        {/* 文件树面板 */}
        {showFileTree && (
          <div className="file-tree-panel">
            <FileTree
              currentFilePath={filePath}
              onFileSelect={handleFileTreeSelect}
            />
          </div>
        )}

        {/* 大纲面板 */}
        {showOutline && (
          <div className="outline-panel">
            <Outline content={content} />
          </div>
        )}
        
        {showEditor && (
          <div className="editor-panel">
            <Editor
              ref={editorRef}
              value={content}
              onChange={(val) => startTransition(() => setContent(val))}
              fontSize={fontSize}
              imageStorage={imageStorage}
              filePath={filePath}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
            />
          </div>
        )}
        
        {showEditor && showPreview && <div className="panel-divider" />}
        
        {showPreview && (
          <div className="preview-panel" ref={previewRef}>
            {/* 大文档 (>30KB) 使用虚拟滚动（暂不支持同步滚动） */}
            {content.length > 30000 ? (
              <VirtualPreview
                ref={previewScrollRef}
                content={content}
                theme={theme}
                fontSize={fontSize}
                isComposing={isComposing}
              />
            ) : (
              <Preview
                ref={previewScrollRef}
                content={content}
                theme={theme}
                fontSize={fontSize}
                isComposing={isComposing}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
