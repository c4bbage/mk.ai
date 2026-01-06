import { useRef, useCallback, useEffect } from 'react';
import { useEditorStore } from './stores/editor';
import { Editor } from './components/Editor';
import { Preview, VirtualPreview } from './components/Preview';
import { Toolbar } from './components/Toolbar';
import { Outline } from './components/Outline';
import { openFile, saveFile, saveFileAs, getFileName } from './lib/file';
import { exportHTML, exportPDF, exportImage } from './lib/export';
import { useAutoSave, getLocalBackup, clearLocalBackup } from './hooks/useAutoSave';
import './App.css';

function App() {
  const previewRef = useRef<HTMLDivElement>(null);
  
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
    toggleEditor,
    togglePreview,
    toggleOutline,
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

  // 自动保存
  useAutoSave({
    enabled: autoSave,
    delay: autoSaveDelay,
    content,
    filePath,
    isModified,
    onSave: handleSaveFile,
  });

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

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      
      if (isMod && e.key === 'o') {
        e.preventDefault();
        handleOpenFile();
      } else if (isMod && e.shiftKey && e.key === 's') {
        e.preventDefault();
        handleSaveFileAs();
      } else if (isMod && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleOpenFile, handleSaveFile, handleSaveFileAs]);

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
        onToggleEditor={toggleEditor}
        onTogglePreview={togglePreview}
        onToggleOutline={toggleOutline}
        fileName={fileName}
        isModified={isModified}
        onOpenFile={handleOpenFile}
        onSaveFile={handleSaveFile}
        onSaveFileAs={handleSaveFileAs}
        onExportHTML={handleExportHTML}
        onExportPDF={handleExportPDF}
        onExportImage={handleExportImage}
        imageStorage={imageStorage}
        onImageStorageChange={setImageStorage}
        autoSave={autoSave}
        onAutoSaveChange={setAutoSave}
      />
      
      <div className="app-content">
        {/* 大纲面板 */}
        {showOutline && (
          <div className="outline-panel">
            <Outline content={content} />
          </div>
        )}
        
        {showEditor && (
          <div className="editor-panel">
            <Editor
              value={content}
              onChange={setContent}
              fontSize={fontSize}
              imageStorage={imageStorage}
              filePath={filePath}
            />
          </div>
        )}
        
        {showEditor && showPreview && <div className="panel-divider" />}
        
        {showPreview && (
          <div className="preview-panel" ref={previewRef}>
            {/* 大文档 (>50KB) 使用虚拟滚动 */}
            {content.length > 50000 ? (
              <VirtualPreview
                content={content}
                theme={theme}
                fontSize={fontSize}
              />
            ) : (
              <Preview
                content={content}
                theme={theme}
                fontSize={fontSize}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
