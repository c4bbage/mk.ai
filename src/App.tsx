import { useRef, useCallback, useEffect, startTransition, useState } from 'react';
import { useEditorStore } from './stores/editor';
import { Editor, type EditorRef } from './components/Editor';
import { Preview, type PreviewRef, VirtualPreview } from './components/Preview';
import { Outline } from './components/Outline';
import { FileTree } from './components/FileTree';
import { openFile, saveFile, saveFileAs, getFileName, isTauri } from './lib/file';
import { revokeObjectUrls } from './lib/image';
import { exportHTML, exportPDF, copyForWeChat, copyHTML, copyMarkdown } from './lib/export';
import { DEFAULT_MARKDOWN } from './lib/markdown';
import { useAutoSave, usePeriodicBackup, getBackupsForRestore, clearBackup } from './hooks/useAutoSave';
import { useToast } from './components/Toast/toast-context';
import { useMenuEvents, type MenuAction } from './hooks/useMenuEvents';
import { StatusBar } from './components/StatusBar/StatusBar';
import { TabBar } from './components/TabBar/TabBar';
import './App.css';

function App() {
  const previewRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorRef>(null);
  const previewScrollRef = useRef<PreviewRef>(null);
  const [isComposing, setIsComposing] = useState(false);
  const showToast = useToast();

  const content = useEditorStore((s) => s.content);
  const setContent = useEditorStore((s) => s.setContent);
  const fileName = useEditorStore((s) => s.fileName);
  const filePath = useEditorStore((s) => s.filePath);
  const isModified = useEditorStore((s) => s.isModified);
  const setFileName = useEditorStore((s) => s.setFileName);
  const setFilePath = useEditorStore((s) => s.setFilePath);
  const setIsModified = useEditorStore((s) => s.setIsModified);
  const theme = useEditorStore((s) => s.theme);
  const setTheme = useEditorStore((s) => s.setTheme);
  const fontSize = useEditorStore((s) => s.fontSize);
  const setFontSize = useEditorStore((s) => s.setFontSize);
  const adjustFontSize = useEditorStore((s) => s.adjustFontSize);
  const fontId = useEditorStore((s) => s.fontId);
  const setFontId = useEditorStore((s) => s.setFontId);
  const codeFontId = useEditorStore((s) => s.codeFontId);
  const setCodeFontId = useEditorStore((s) => s.setCodeFontId);
  const vimMode = useEditorStore((s) => s.vimMode);
  const toggleVimMode = useEditorStore((s) => s.toggleVimMode);
  const imageStorage = useEditorStore((s) => s.imageStorage);
  const setImageStorage = useEditorStore((s) => s.setImageStorage);
  const autoSave = useEditorStore((s) => s.autoSave);
  const autoSaveDelay = useEditorStore((s) => s.autoSaveDelay);
  const setAutoSave = useEditorStore((s) => s.setAutoSave);
  const setAutoSaveDelay = useEditorStore((s) => s.setAutoSaveDelay);
  const cycleColorMode = useEditorStore((s) => s.cycleColorMode);
  const colorMode = useEditorStore((s) => s.colorMode);
  const showEditor = useEditorStore((s) => s.showEditor);
  const showPreview = useEditorStore((s) => s.showPreview);
  const showOutline = useEditorStore((s) => s.showOutline);
  const showFileTree = useEditorStore((s) => s.showFileTree);
  const toggleEditor = useEditorStore((s) => s.toggleEditor);
  const togglePreview = useEditorStore((s) => s.togglePreview);
  const toggleOutline = useEditorStore((s) => s.toggleOutline);
  const toggleFileTree = useEditorStore((s) => s.toggleFileTree);
  const openTab = useEditorStore((s) => s.openTab);
  const activeTabId = useEditorStore((s) => s.activeTabId);

  // ─── Revoke object URLs when switching tabs (prevents memory leak) ───
  const prevTabIdRef = useRef(activeTabId);
  useEffect(() => {
    if (prevTabIdRef.current !== activeTabId) {
      revokeObjectUrls();
      prevTabIdRef.current = activeTabId;
    }
  }, [activeTabId]);

  // ─── File operations ───
  const handleOpenFile = useCallback(async () => {
    const result = await openFile();
    if (result) {
      revokeObjectUrls();
      openTab({
        content: result.content,
        fileName: getFileName(result.path),
        filePath: result.path,
      });
    }
  }, [openTab]);

  const handleNewFile = useCallback(() => {
    openTab({
      content: DEFAULT_MARKDOWN,
      fileName: 'untitled.md',
    });
  }, [openTab]);

  const handleSaveFile = useCallback(async () => {
    const savedPath = await saveFile(content, filePath);
    if (savedPath) {
      setFilePath(savedPath);
      setFileName(getFileName(savedPath));
      setIsModified(false);
      showToast(`已保存到 ${savedPath}`);
    } else if (!filePath) {
      showToast('未保存：请使用 Cmd+Shift+S 另存为');
    }
  }, [content, filePath, setFilePath, setFileName, setIsModified, showToast]);

  const handleSaveFileAs = useCallback(async () => {
    const savedPath = await saveFileAs(content);
    if (savedPath) {
      setFilePath(savedPath);
      setFileName(getFileName(savedPath));
      setIsModified(false);
      showToast(`已保存到 ${savedPath}`);
    }
  }, [content, setFilePath, setFileName, setIsModified, showToast]);

  const handleExportHTML = useCallback(async () => {
    const htmlFileName = fileName.replace(/\.(md|markdown)$/i, '.html') || 'document.html';
    await exportHTML(content, theme, htmlFileName);
  }, [content, theme, fileName]);

  const handleExportPDF = useCallback(async () => {
    const pdfTitle = fileName.replace(/\.(md|markdown)$/i, '') || 'document';
    await exportPDF(content, theme, pdfTitle);
  }, [content, theme, fileName]);

  const handleExportImage = useCallback(async () => {
    const { THEMES } = await import('./themes');
    const { getMarkdownBodyHtml, copyImageToClipboard } = await import('./lib/export');
    const themeConfig = THEMES.find(t => t.id === theme);
    const themeClass = themeConfig?.className || 'theme-github';

    // 离屏全量渲染，带主题样式
    const wrapper = document.createElement('div');
    wrapper.className = themeClass;
    wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;padding:40px;';
    const body = document.createElement('div');
    body.className = 'markdown-body';
    body.innerHTML = getMarkdownBodyHtml(content);
    wrapper.appendChild(body);
    document.body.appendChild(wrapper);

    // 渲染数学公式和 mermaid 后再截图
    try {
      const { renderMathInElement } = await import('./lib/math');
      renderMathInElement(body);
      const { renderMermaidInElement } = await import('./lib/mermaid');
      await renderMermaidInElement(body);
      await new Promise(r => requestAnimationFrame(() => r(null)));
    } catch {
      // 公式/图表渲染失败不影响截图
    }

    try {
      const ok = await copyImageToClipboard(body);
      if (ok) {
        showToast('图片已复制到剪贴板');
      } else {
        showToast('复制失败，请重试');
      }
    } finally {
      document.body.removeChild(wrapper);
    }
  }, [content, theme, showToast]);

  const handleCopyWeChat = useCallback(async () => {
    const ok = await copyForWeChat(content, theme);
    if (ok) {
      showToast('已复制公众号格式');
    }
  }, [content, theme, showToast]);

  const handleCopyHTML = useCallback(async () => {
    const ok = await copyHTML(content, theme, fileName.replace(/\.(md|markdown)$/i, '') || 'document');
    if (ok) {
      showToast('已复制 HTML');
    }
  }, [content, theme, fileName, showToast]);

  const handleCopyMarkdown = useCallback(async () => {
    const ok = await copyMarkdown(content);
    if (ok) {
      showToast('已复制 Markdown');
    }
  }, [content, showToast]);

  // ─── Extract base64 images to files ───
  const handleExtractImages = useCallback(async () => {
    if (!isTauri() || !filePath) {
      showToast('需要先保存文件');
      return;
    }
    const { extractAndSaveImages } = await import('./lib/image');
    const newContent = await extractAndSaveImages(content, filePath, imageStorage === 'base64' ? 'assets' : imageStorage as 'assets' | 'images');
    if (newContent !== content) {
      setContent(newContent);
      showToast('图片已提取为文件');
    } else {
      showToast('未找到内嵌图片');
    }
  }, [content, filePath, imageStorage, setContent, showToast]);

  // ─── Auto save ───
  useAutoSave({
    enabled: autoSave,
    delay: autoSaveDelay,
    content,
    filePath,
    isModified,
    onSave: handleSaveFile,
  });

  // ─── Periodic backup (all tabs, every 8s) ───
  usePeriodicBackup(autoSave);

  // ─── Restore backups on startup ───
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const backups = getBackupsForRestore();
    if (backups.length === 0) return;

    // If only one backup and it matches the current untitled tab, restore inline
    if (backups.length === 1) {
      const b = backups[0];
      if (window.confirm(
        `检测到未保存的内容（${new Date(b.timestamp).toLocaleString()}）\n文件: ${b.fileName}\n\n是否恢复？`
      )) {
        if (b.filePath) {
          setFilePath(b.filePath);
          setFileName(getFileName(b.filePath));
        }
        setContent(b.content);
        showToast('已恢复未保存的内容');
      } else {
        clearBackup(b.tabId);
      }
      return;
    }

    // Multiple backups — restore each as a new tab
    const confirmed = window.confirm(
      `检测到 ${backups.length} 个未保存的文档：\n` +
      backups.map((b, i) => `  ${i + 1}. ${b.fileName}（${new Date(b.timestamp).toLocaleTimeString()}）`).join('\n') +
      `\n\n是否全部恢复为新标签页？`
    );

    if (confirmed) {
      for (const b of backups) {
        openTab({
          content: b.content,
          fileName: b.fileName,
          filePath: b.filePath,
        });
        clearBackup(b.tabId);
      }
      showToast(`已恢复 ${backups.length} 个文档`);
    } else {
      for (const b of backups) {
        clearBackup(b.tabId);
      }
    }
  }, [setContent, setFilePath, setFileName, openTab, showToast]);

  // ─── Outline click: jump to heading ───
  const handleOutlineClick = useCallback((id: string) => {
    const match = id.match(/^heading-(\d+)$/);
    if (!match) return;
    const headingIndex = parseInt(match[1]);
    const lines = content.split('\n');
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,6}\s+/.test(lines[i])) {
        if (count === headingIndex) {
          editorRef.current?.focus();
          const scrollContainer = editorRef.current?.getScrollContainer();
          if (scrollContainer) {
            scrollContainer.scrollTop = i * 24;
          }
          const totalLines = lines.length;
          const ratio = totalLines > 1 ? i / (totalLines - 1) : 0;
          const previewContainer = previewScrollRef.current?.getScrollContainer();
          if (previewContainer) {
            const scrollable = Math.max(previewContainer.scrollHeight - previewContainer.clientHeight, 0);
            previewScrollRef.current?.scrollTo(ratio * scrollable);
          }
          break;
        }
        count++;
      }
    }
  }, [content]);

  // ─── File tree selection ───
  const handleFileTreeSelect = useCallback(async (path: string) => {
    if (!isTauri()) return;
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const fileContent = await fs.readTextFile(path);
      openTab({
        content: fileContent,
        fileName: getFileName(path),
        filePath: path,
      });
    } catch (e) {
      console.error('[App] Failed to open file from tree:', e);
    }
  }, [openTab]);

  // ─── Color mode: compute effective mode and set on <html> ───
  useEffect(() => {
    const root = document.documentElement;

    if (colorMode !== 'auto') {
      root.setAttribute('data-color-mode', colorMode);
      return;
    }

    // Auto: follow system, listen for changes
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      root.setAttribute('data-color-mode', mql.matches ? 'dark' : 'light');
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [colorMode]);

  // ─── IME composition ───
  const handleCompositionStart = useCallback(() => setIsComposing(true), []);
  const handleCompositionEnd = useCallback(() => setIsComposing(false), []);

  // ─── Editor content change ───
  const handleContentChange = useCallback((val: string) => {
    startTransition(() => setContent(val));
  }, [setContent]);

  // ─── Sync scroll: bidirectional proportional with lock ───
  const syncLockRef = useRef<'editor' | 'preview' | null>(null);
  const syncRafRef = useRef<number | null>(null);

  const handleEditorScroll = useCallback((scrollTop: number, scrollHeight: number, clientHeight: number) => {
    if (syncLockRef.current === 'preview') return;
    syncLockRef.current = 'editor';
    const scrollable = Math.max(scrollHeight - clientHeight, 0);
    const ratio = scrollable > 0 ? scrollTop / scrollable : 0;
    if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current);
    syncRafRef.current = requestAnimationFrame(() => {
      const previewContainer = previewScrollRef.current?.getScrollContainer();
      if (previewContainer) {
        const previewScrollable = Math.max(previewContainer.scrollHeight - previewContainer.clientHeight, 0);
        previewScrollRef.current?.scrollTo(ratio * previewScrollable);
      }
      syncLockRef.current = null;
    });
  }, []);

  const handlePreviewScroll = useCallback((scrollTop: number, scrollHeight: number, clientHeight: number) => {
    if (syncLockRef.current === 'editor') return;
    syncLockRef.current = 'preview';
    const scrollable = Math.max(scrollHeight - clientHeight, 0);
    const ratio = scrollable > 0 ? scrollTop / scrollable : 0;
    if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current);
    syncRafRef.current = requestAnimationFrame(() => {
      const editorContainer = editorRef.current?.getScrollContainer();
      if (editorContainer) {
        const editorScrollable = Math.max(editorContainer.scrollHeight - editorContainer.clientHeight, 0);
        editorContainer.scrollTop = ratio * editorScrollable;
      }
      syncLockRef.current = null;
    });
  }, []);

  // ─── View mode switching (Typora-style) ───
  const scrollPreviewToCursor = useCallback(() => {
    const line = editorRef.current?.getSelectionLine();
    const totalLines = editorRef.current?.getLineCount() || 0;
    const container = previewScrollRef.current?.getScrollContainer();
    if (line == null || totalLines === 0 || !container) return;
    const ratio = totalLines > 1 ? (line - 1) / (totalLines - 1) : 0;
    const scrollable = Math.max(container.scrollHeight - container.clientHeight, 0);
    previewScrollRef.current?.scrollTo(ratio * scrollable);
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

  const toggleSourcePreview = useCallback(() => {
    if (showEditor && showPreview) {
      switchToPreviewMode();
    } else if (showPreview && !showEditor) {
      switchToEditMode();
    } else {
      if (!showPreview) togglePreview();
      focusEditor();
    }
  }, [showEditor, showPreview, togglePreview, switchToPreviewMode, switchToEditMode, focusEditor]);

  // ─── Window title: show filename like Typora ───
  useEffect(() => {
    const modified = isModified ? '● ' : '';
    document.title = `${modified}${fileName} — MD.AI`;
  }, [fileName, isModified]);

  // ─── Native menu event handler ───
  const handleMenuAction = useCallback(async (action: MenuAction) => {
    switch (action) {
      case 'file:new': handleNewFile(); break;
      case 'file:open': handleOpenFile(); break;
      case 'file:save': handleSaveFile(); break;
      case 'file:save_as': handleSaveFileAs(); break;
      case 'file:export_html': handleExportHTML(); break;
      case 'file:export_pdf': handleExportPDF(); break;
      case 'file:export_image': handleExportImage(); break;
      case 'file:copy_wechat': handleCopyWeChat(); break;
      case 'file:copy_html': handleCopyHTML(); break;
      case 'file:copy_markdown': handleCopyMarkdown(); break;
      case 'edit:find':
        // CodeMirror search is triggered by Cmd+F, which the menu accelerator already sends
        break;
      case 'fmt:bold': editorRef.current?.wrapSelection('**', '**'); break;
      case 'fmt:italic': editorRef.current?.wrapSelection('*', '*'); break;
      case 'fmt:underline': editorRef.current?.wrapSelection('<u>', '</u>'); break;
      case 'fmt:strikethrough': editorRef.current?.wrapSelection('~~', '~~'); break;
      case 'fmt:code': editorRef.current?.wrapSelection('`', '`'); break;
      case 'fmt:link': editorRef.current?.wrapSelection('[', '](url)'); break;
      case 'fmt:h1': editorRef.current?.setHeadingLevel(1); break;
      case 'fmt:h2': editorRef.current?.setHeadingLevel(2); break;
      case 'fmt:h3': editorRef.current?.setHeadingLevel(3); break;
      case 'fmt:h4': editorRef.current?.setHeadingLevel(4); break;
      case 'fmt:h5': editorRef.current?.setHeadingLevel(5); break;
      case 'fmt:h6': editorRef.current?.setHeadingLevel(6); break;
      case 'fmt:normal': editorRef.current?.setHeadingLevel(0); break;
      case 'view:toggle_source': toggleSourcePreview(); break;
      case 'view:toggle_outline': toggleOutline(); break;
      case 'view:toggle_filetree': toggleFileTree(); break;
      case 'view:zoom_in': adjustFontSize(1); break;
      case 'view:zoom_out': adjustFontSize(-1); break;
      case 'view:zoom_reset': setFontSize(16); break;
      case 'view:toggle_autosave': setAutoSave(!autoSave); break;
      case 'view:toggle_dark_mode': {
        cycleColorMode();
        const next: ('auto' | 'light' | 'dark')[] = ['auto', 'light', 'dark'];
        const labels: Record<string, string> = { auto: '跟随系统', light: '浅色', dark: '深色' };
        const idx = next.indexOf(colorMode);
        const upcoming = next[(idx + 1) % next.length];
        showToast(`外观: ${labels[upcoming]}`);
        break;
      }
      case 'view:toggle_vim': {
        toggleVimMode();
        showToast(vimMode ? 'Vim 模式: 关闭' : 'Vim 模式: 开启');
        break;
      }
      case 'view:cycle_font': {
        const { FONT_PRESETS } = await import('./themes');
        const idx = FONT_PRESETS.findIndex(f => f.id === fontId);
        const next = FONT_PRESETS[(idx + 1) % FONT_PRESETS.length];
        setFontId(next.id);
        showToast(`字体: ${next.name}`);
        break;
      }
      case 'view:cycle_codefont': {
        const { CODE_FONT_PRESETS } = await import('./themes');
        const idx = CODE_FONT_PRESETS.findIndex(f => f.id === codeFontId);
        const next = CODE_FONT_PRESETS[(idx + 1) % CODE_FONT_PRESETS.length];
        setCodeFontId(next.id);
        showToast(`代码字体: ${next.name}`);
        break;
      }
      case 'tools:extract_images':
        handleExtractImages();
        break;
      case 'help:about':
        showToast('MD.AI v1.0.0 — A Typora-style Markdown Editor');
        break;
      default:
        // Handle checkable submenu items: prefix:value
        if (action.startsWith('font:')) {
          const id = action.slice(5);
          const { FONT_PRESETS } = await import('./themes');
          const preset = FONT_PRESETS.find(f => f.id === id);
          if (preset) { setFontId(id); showToast(`字体: ${preset.name}`); }
        } else if (action.startsWith('codefont:')) {
          const id = action.slice(9);
          const { CODE_FONT_PRESETS } = await import('./themes');
          const preset = CODE_FONT_PRESETS.find(f => f.id === id);
          if (preset) { setCodeFontId(id); showToast(`代码字体: ${preset.name}`); }
        } else if (action.startsWith('image:')) {
          const strategy = action.slice(6) as typeof imageStorage;
          const labels: Record<string, string> = { base64: 'Base64 内嵌', assets: 'Assets 文件夹', images: 'Images 文件夹', absolute: '绝对路径' };
          setImageStorage(strategy);
          showToast(`图片存储: ${labels[strategy] || strategy}`);
        } else if (action.startsWith('autosave_delay:')) {
          const delay = parseInt(action.slice(15));
          const labels: Record<number, string> = { 1000: '1秒', 2000: '2秒', 5000: '5秒', 10000: '10秒' };
          setAutoSaveDelay(delay);
          showToast(`自动保存延迟: ${labels[delay] || delay}`);
        } else if (action.startsWith('theme:')) {
          setTheme(action.slice(6));
        }
        break;
    }
  }, [
    handleNewFile, handleOpenFile, handleSaveFile, handleSaveFileAs,
    handleExportHTML, handleExportPDF, handleExportImage, handleCopyWeChat,
    handleCopyHTML, handleCopyMarkdown,
    toggleSourcePreview, toggleOutline, toggleFileTree,
    setFontSize, adjustFontSize, setAutoSave, autoSave, autoSaveDelay, setAutoSaveDelay,
    cycleColorMode, colorMode, toggleVimMode, vimMode, fontId, setFontId, codeFontId, setCodeFontId,
    imageStorage, setImageStorage, handleExtractImages, setTheme, showToast,
  ]);

  useMenuEvents(handleMenuAction);

  // ─── Web-mode keyboard shortcuts (fallback when no native menu) ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'o' && !e.shiftKey) {
        e.preventDefault();
        handleOpenFile();
      } else if (isMod && e.shiftKey && e.key === 's') {
        e.preventDefault();
        handleSaveFileAs();
      } else if (isMod && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        handleSaveFile();
      } else if (isMod && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        handleNewFile();
      } else if (isMod && e.key === '/') {
        e.preventDefault();
        toggleSourcePreview();
      } else if (isMod && e.shiftKey && e.key === '\\') {
        e.preventDefault();
        toggleFileTree();
      } else if (isMod && !e.shiftKey && e.key === '\\') {
        e.preventDefault();
        toggleOutline();
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopyWeChat();
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        cycleColorMode();
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        toggleVimMode();
      } else if (isMod && e.key === '=') {
        e.preventDefault();
        adjustFontSize(1);
      } else if (isMod && e.key === '-') {
        e.preventDefault();
        adjustFontSize(-1);
      } else if (isMod && showEditor && editorRef.current) {
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
        } else if (e.key >= '1' && e.key <= '6') {
          e.preventDefault();
          editorRef.current.setHeadingLevel(parseInt(e.key));
        } else if (e.key === '0' && !e.shiftKey) {
          e.preventDefault();
          editorRef.current.setHeadingLevel(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleOpenFile, handleSaveFile, handleSaveFileAs, handleNewFile,
    handleCopyWeChat, toggleSourcePreview, toggleOutline, toggleFileTree,
    showEditor, showPreview, adjustFontSize, cycleColorMode, toggleVimMode,
  ]);

  return (
    <div className="app app-typora">
      <TabBar />
      <div className="app-content">
        {showFileTree && (
          <div className="file-tree-panel">
            <FileTree currentFilePath={filePath} onFileSelect={handleFileTreeSelect} onFolderOpen={() => {}} />
          </div>
        )}

        {showOutline && (
          <div className="outline-panel">
            <Outline
              content={content}
              onItemClick={handleOutlineClick}
              onHeadingsChange={handleContentChange}
            />
          </div>
        )}

        {showEditor && (
          <div className="editor-panel">
            <Editor
              ref={editorRef}
              value={content}
              onChange={handleContentChange}
              fontSize={fontSize}
              fontId={fontId}
              codeFontId={codeFontId}
              vimMode={vimMode}
              imageStorage={imageStorage}
              filePath={filePath}
              onScroll={handleEditorScroll}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
            />
          </div>
        )}

        {showEditor && showPreview && <div className="panel-divider" />}

        {showPreview && (
          <div className="preview-panel" ref={previewRef}>
            {content.length > 30000 ? (
              <VirtualPreview
                ref={previewScrollRef}
                content={content}
                theme={theme}
                fontSize={fontSize}
                isComposing={isComposing}
                onScroll={handlePreviewScroll}
              />
            ) : (
              <Preview
                ref={previewScrollRef}
                content={content}
                theme={theme}
                fontSize={fontSize}
                isComposing={isComposing}
                onScroll={handlePreviewScroll}
              />
            )}
          </div>
        )}
      </div>

      <StatusBar
        content={content}
        filePath={filePath}
        isModified={isModified}
        isComposing={isComposing}
        vimMode={vimMode}
      />
    </div>
  );
}

export default App;
