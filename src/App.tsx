import { useRef, useCallback, useEffect, startTransition, useMemo, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore } from './stores/editor';
import { Editor, type EditorRef } from './components/Editor';
import { Preview, type PreviewRef, VirtualPreview } from './components/Preview';
import { Outline } from './components/Outline';
import { FileTree } from './components/FileTree';
import { openFile, saveFile, saveFileAs, getFileName, isTauri } from './lib/file';
import { revokeObjectUrls, extractAndSaveImages, processImage } from './lib/image';
import { exportHTML, exportPDF, copyForWeChat, copyHTML, copyMarkdown, getMarkdownBodyHtml, copyImageToClipboard } from './lib/export';
import { DEFAULT_MARKDOWN } from './lib/markdown';
import { useAutoSave, usePeriodicBackup, getBackupsForRestore, clearBackup } from './hooks/useAutoSave';
import { useToast } from './components/Toast/toast-context';
import { useMenuEvents, type MenuAction } from './hooks/useMenuEvents';
import { useDragDrop } from './hooks/useDragDrop';
import { StatusBar } from './components/StatusBar/StatusBar';
import { TabBar } from './components/TabBar/TabBar';
import { THEMES, CODE_THEMES, getThemeColors, FONT_PRESETS, CODE_FONT_PRESETS, getCodeThemeClass } from './themes';
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
  const codeTheme = useEditorStore((s) => s.codeTheme);
  const setCodeTheme = useEditorStore((s) => s.setCodeTheme);
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
  const setCursor = useEditorStore((s) => s.setCursor);
  const setSelection = useEditorStore((s) => s.setSelection);
  const recentFiles = useEditorStore((s) => s.recentFiles);
  const addRecentFile = useEditorStore((s) => s.addRecentFile);
  const clearRecentFiles = useEditorStore((s) => s.clearRecentFiles);
  const themeUsage = useEditorStore((s) => s.themeUsage);
  const recordThemeUsage = useEditorStore((s) => s.recordThemeUsage);

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
      addRecentFile(result.path);
    }
  }, [openTab, addRecentFile]);

  // ─── Open a file by path (for recent files menu) ───
  const handleOpenPath = useCallback(async (path: string) => {
    if (!isTauri()) return;
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const fileContent = await fs.readTextFile(path);
      revokeObjectUrls();
      openTab({
        content: fileContent,
        fileName: getFileName(path),
        filePath: path,
      });
      addRecentFile(path);
    } catch (e) {
      console.error('[App] Failed to open recent file:', e);
      showToast('无法打开文件，可能已被移动或删除');
    }
  }, [openTab, addRecentFile, showToast]);

  // ─── Drag-and-drop file open ───
  const handleDropFiles = useCallback(async (files: { path: string; isImage: boolean }[]) => {
    if (!isTauri()) return;
    const mdFiles = files.filter(f => !f.isImage);
    const imageFiles = files.filter(f => f.isImage);

    // Open markdown files as tabs
    if (mdFiles.length > 0) {
      try {
        const fs = await import('@tauri-apps/plugin-fs');
        for (const f of mdFiles) {
          try {
            const fileContent = await fs.readTextFile(f.path);
            revokeObjectUrls();
            openTab({
              content: fileContent,
              fileName: getFileName(f.path),
              filePath: f.path,
            });
            addRecentFile(f.path);
          } catch (e) {
            console.error('[App] Failed to open dropped file:', f.path, e);
          }
        }
        showToast(`已打开 ${mdFiles.length} 个文件`);
      } catch (e) {
        console.error('[App] Drag-drop error:', e);
      }
    }

    // Insert images into editor
    if (imageFiles.length > 0) {
      // If editor is hidden, toggle it on first
      const needShowEditor = !showEditor;
      if (needShowEditor) {
        toggleEditor();
        await new Promise(r => requestAnimationFrame(() => r(null)));
      }
      try {
        const fs = await import('@tauri-apps/plugin-fs');
        for (const img of imageFiles) {
          try {
            const bytes = await fs.readFile(img.path);
            const fileName = getFileName(img.path);
            const mime = fileName.match(/\.(png)$/i) ? 'image/png'
              : fileName.match(/\.(jpe?g)$/i) ? 'image/jpeg'
              : fileName.match(/\.(gif)$/i) ? 'image/gif'
              : fileName.match(/\.(webp)$/i) ? 'image/webp'
              : fileName.match(/\.(svg)$/i) ? 'image/svg+xml'
              : 'image/png';
            const file = new File([bytes], fileName, { type: mime });
            const imageMarkdown = await processImage(file, imageStorage, filePath);
            editorRef.current?.insertAtCursor(imageMarkdown);
          } catch (e) {
            console.error('[App] Failed to insert dropped image:', img.path, e);
          }
        }
        if (imageFiles.length > 0) {
          showToast(`已插入 ${imageFiles.length} 张图片`);
        }
      } catch (e) {
        console.error('[App] Image drag-drop error:', e);
      }
    }
  }, [openTab, addRecentFile, showToast, imageStorage, filePath, showEditor, toggleEditor]);

  const { isDragOver } = useDragDrop({ onDropFiles: handleDropFiles });

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
      addRecentFile(savedPath);
    } else if (!filePath) {
      showToast('未保存：请使用 Cmd+Shift+S 另存为');
    }
  }, [content, filePath, setFilePath, setFileName, setIsModified, showToast, addRecentFile]);

  const handleSaveFileAs = useCallback(async () => {
    const savedPath = await saveFileAs(content);
    if (savedPath) {
      setFilePath(savedPath);
      setFileName(getFileName(savedPath));
      setIsModified(false);
      showToast(`已保存到 ${savedPath}`);
      addRecentFile(savedPath);
    }
  }, [content, setFilePath, setFileName, setIsModified, showToast, addRecentFile]);

  const handleExportHTML = useCallback(async () => {
    recordThemeUsage(theme);
    showToast('正在导出 HTML…');
    const htmlFileName = fileName.replace(/\.(md|markdown)$/i, '.html') || 'document.html';
    try {
      await exportHTML(content, theme, htmlFileName, codeTheme);
      showToast('HTML 已导出');
    } catch {
      showToast('导出失败，请重试');
    }
  }, [content, theme, codeTheme, fileName, recordThemeUsage, showToast]);

  const handleExportPDF = useCallback(async () => {
    recordThemeUsage(theme);
    showToast('正在生成 PDF…');
    const pdfTitle = fileName.replace(/\.(md|markdown)$/i, '') || 'document';
    try {
      await exportPDF(content, theme, pdfTitle, codeTheme);
      showToast('PDF 打印窗口已打开');
    } catch {
      showToast('导出失败，请重试');
    }
  }, [content, theme, codeTheme, fileName, recordThemeUsage, showToast]);

  const handleExportImage = useCallback(async () => {
    recordThemeUsage(theme);
    showToast('正在生成图片…');
    const themeConfig = THEMES.find(t => t.id === theme);
    const themeClass = themeConfig?.className || 'theme-github';
    const codeThemeClass = getCodeThemeClass(codeTheme);

    // 离屏全量渲染，带主题样式
    // 注意：必须包含 preview-container class，否则 code-base.css 的
    // .preview-container[class*="code-theme-"] 选择器不生效，
    // pre 背景不会被置为 transparent，导致代码主题背景被遮挡
    const wrapper = document.createElement('div');
    wrapper.className = `preview-container ${themeClass} ${codeThemeClass}`;
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
  }, [content, theme, codeTheme, showToast, recordThemeUsage]);

  const handleCopyWeChat = useCallback(async () => {
    recordThemeUsage(theme);
    const ok = await copyForWeChat(content, theme, codeTheme, filePath);
    if (ok) {
      showToast('已复制公众号格式');
    }
  }, [content, theme, codeTheme, filePath, showToast, recordThemeUsage]);

  const handleCopyHTML = useCallback(async () => {
    recordThemeUsage(theme);
    const ok = await copyHTML(content, theme, fileName.replace(/\.(md|markdown)$/i, '') || 'document', codeTheme);
    if (ok) {
      showToast('已复制 HTML');
    }
  }, [content, theme, codeTheme, fileName, showToast, recordThemeUsage]);

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

  // ─── Editor content change ───
  const handleContentChange = useCallback((val: string) => {
    startTransition(() => setContent(val));
  }, [setContent]);

  // ─── Cursor / selection reporting → store (StatusBar subscribes; App stays cheap) ───
  const handleCursorChange = useCallback((line: number, col: number, selChars: number, selWords: number) => {
    setCursor({ line, col });
    setSelection({ chars: selChars, words: selWords });
  }, [setCursor, setSelection]);

  // ─── Theme cycle (status-bar quick switch) ───
  const handleCycleTheme = useCallback(() => {
    const idx = THEMES.findIndex(t => t.id === theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next.id);
    showToast(`主题: ${next.name}`);
  }, [theme, setTheme, showToast]);

  const handleCycleCodeTheme = useCallback(() => {
    const idx = CODE_THEMES.findIndex(t => t.id === codeTheme);
    const next = CODE_THEMES[(idx + 1) % CODE_THEMES.length];
    setCodeTheme(next.id);
    showToast(`代码主题: ${next.name}`);
  }, [codeTheme, setCodeTheme, showToast]);

  // ─── Outline panel: sync colors with the active article theme ───
  const outlineVars = useMemo<Record<string, string>>(() => {
    const c = getThemeColors(theme);
    return {
      '--outline-panel-bg': c.bgSecondary,
      '--outline-fg': c.text,
      '--outline-accent': c.accent,
      '--outline-border': c.border,
    };
  }, [theme]);

  // ─── Sync scroll refs (declared early for use in outline + scroll handlers) ───
  const syncLockRef = useRef<'editor' | 'preview' | 'both' | null>(null);
  const syncRafRef = useRef<number | null>(null);

  // ─── Outline click: jump to heading ───
  const handleOutlineClick = useCallback((id: string) => {
    const match = id.match(/^heading-(\d+)$/);
    if (!match) return;
    const headingIndex = parseInt(match[1]);

    // 锁定双向 sync-scroll，防止编辑器/预览滚动事件互相覆盖
    syncLockRef.current = 'both';
    if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current);

    // 1) Editor: scroll to line
    if (showEditor) {
      const lines = content.split('\n');
      let count = 0;
      let inCodeBlock = false;
      let inMathBlock = false;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
        if (trimmed === '$$') { inMathBlock = !inMathBlock; continue; }
        if (inCodeBlock || inMathBlock) continue;
        if (/^#{1,6}\s+/.test(lines[i])) {
          if (count === headingIndex) {
            editorRef.current?.focus();
            editorRef.current?.scrollToLine(i);
            break;
          }
          count++;
        }
      }
    }

    // 2) Preview: find Nth heading element and scrollIntoView
    //    延迟到下一帧，确保预览 DOM 已渲染最新内容
    syncLockRef.current = 'both';
    requestAnimationFrame(() => {
      const previewContainer = previewScrollRef.current?.getScrollContainer();
      if (previewContainer) {
        const headingEls = previewContainer.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
        const target = headingEls[headingIndex];
        if (target) {
          target.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      }
    });

    // 延迟释放锁（等所有 scroll 事件处理完）
    setTimeout(() => {
      syncLockRef.current = null;
    }, 200);
  }, [content, showEditor]);

  // ─── Outline heading level change (undo-friendly via editor dispatch) ───
  const handleHeadingLevelChange = useCallback((lineIndex: number, newPrefix: string) => {
    if (editorRef.current) {
      editorRef.current.setHeadingAtLine(lineIndex, newPrefix);
    } else {
      // Editor not visible — fall back to direct content modification
      const lines = content.split('\n');
      if (lineIndex >= 0 && lineIndex < lines.length) {
        const stripped = lines[lineIndex].replace(/^#{1,6}\s*/, '');
        lines[lineIndex] = newPrefix ? `${newPrefix} ${stripped}` : stripped;
        handleContentChange(lines.join('\n'));
      }
    }
  }, [content, handleContentChange]);

  // ─── Outline drag reorder (undo-friendly via editor dispatch) ───
  const handleHeadingMove = useCallback((fromStart: number, fromEnd: number, insertAt: number) => {
    if (editorRef.current) {
      editorRef.current.moveLines(fromStart, fromEnd, insertAt);
    } else {
      const lines = content.split('\n');
      const movedBlock = lines.slice(fromStart, fromEnd);
      const remaining = lines.slice(0, fromStart).concat(lines.slice(fromEnd));
      const insertPos = insertAt > fromStart ? insertAt - (fromEnd - fromStart) : insertAt;
      const clampedPos = Math.max(0, Math.min(insertPos, remaining.length));
      const newLines = remaining.slice(0, clampedPos).concat(movedBlock, remaining.slice(clampedPos));
      handleContentChange(newLines.join('\n'));
    }
  }, [content, handleContentChange]);

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
      addRecentFile(path);
    } catch (e) {
      console.error('[App] Failed to open file from tree:', e);
    }
  }, [openTab, addRecentFile]);

  // ─── File tree rename: update store if current file was renamed ───
  const handleFileTreeRename = useCallback((_oldPath: string, newPath: string) => {
    setFilePath(newPath);
    setFileName(getFileName(newPath));
  }, [setFilePath, setFileName]);

  // ─── File tree delete: reset current tab if the deleted file was open ───
  const handleFileTreeDelete = useCallback(() => {
    setContent(DEFAULT_MARKDOWN);
    setFileName('untitled.md');
    setFilePath(undefined);
    setIsModified(false);
  }, [setContent, setFileName, setFilePath, setIsModified]);

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

  // ─── Sync menu state (recent files + favorite themes) to native menu ───
  useEffect(() => {
    if (!isTauri()) return;
    const favorites = Object.entries(themeUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => ({ id, count }));
    invoke('update_menu_state', {
      update: {
        recents: recentFiles,
        favorites,
        currentTheme: theme,
        currentCodeTheme: codeTheme,
      },
    }).catch(console.error);
  }, [recentFiles, themeUsage, theme, codeTheme]);

  // ─── IME composition ───
  const handleCompositionStart = useCallback(() => setIsComposing(true), []);
  const handleCompositionEnd = useCallback(() => setIsComposing(false), []);

  // ─── Sync scroll: bidirectional proportional with lock ───
  // 锁用 timeout 释放（覆盖 macOS 触控板惯性滚动 ~300ms）
  const syncReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const releaseSyncLock = useCallback(() => {
    if (syncReleaseTimerRef.current) clearTimeout(syncReleaseTimerRef.current);
    syncReleaseTimerRef.current = setTimeout(() => {
      syncLockRef.current = null;
    }, 250);
  }, []);

  const handleEditorScroll = useCallback((scrollTop: number, scrollHeight: number, clientHeight: number) => {
    if (syncLockRef.current === 'preview' || syncLockRef.current === 'both') return;
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
    });
    releaseSyncLock();
  }, [releaseSyncLock]);

  const handlePreviewScroll = useCallback((scrollTop: number, scrollHeight: number, clientHeight: number) => {
    if (syncLockRef.current === 'editor' || syncLockRef.current === 'both') return;
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
    });
    releaseSyncLock();
  }, [releaseSyncLock]);

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

  // ─── View mode switcher (status bar): edit / split / preview ───
  const handleSwitchView = useCallback((mode: 'edit' | 'split' | 'preview') => {
    if (mode === 'edit') {
      switchToEditMode();
    } else if (mode === 'preview') {
      switchToPreviewMode();
    } else {
      if (!showEditor) toggleEditor();
      if (!showPreview) togglePreview();
      focusEditor();
    }
  }, [switchToEditMode, switchToPreviewMode, showEditor, showPreview, toggleEditor, togglePreview, focusEditor]);

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
        const idx = FONT_PRESETS.findIndex(f => f.id === fontId);
        const next = FONT_PRESETS[(idx + 1) % FONT_PRESETS.length];
        setFontId(next.id);
        showToast(`字体: ${next.name}`);
        break;
      }
      case 'view:cycle_codefont': {
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
        // Handle recent files, favorite themes, and checkable submenu items
        if (action.startsWith('recent:')) {
          if (action === 'recent:clear') {
            clearRecentFiles();
          } else if (action !== 'recent:empty') {
            const idx = parseInt(action.slice(7));
            const path = recentFiles[idx];
            if (path) handleOpenPath(path);
          }
        } else if (action.startsWith('favtheme:')) {
          setTheme(action.slice(9));
        } else if (action.startsWith('font:')) {
          const id = action.slice(5);
          const preset = FONT_PRESETS.find(f => f.id === id);
          if (preset) { setFontId(id); showToast(`字体: ${preset.name}`); }
        } else if (action.startsWith('codefont:')) {
          const id = action.slice(9);
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
        } else if (action.startsWith('codetheme:')) {
          const id = action.slice(10);
          const preset = CODE_THEMES.find(t => t.id === id);
          if (preset) { setCodeTheme(id); showToast(`代码主题: ${preset.name}`); }
        }
        break;
    }
  }, [
    handleNewFile, handleOpenFile, handleSaveFile, handleSaveFileAs,
    handleExportHTML, handleExportPDF, handleExportImage, handleCopyWeChat,
    handleCopyHTML, handleCopyMarkdown,
    toggleSourcePreview, toggleOutline, toggleFileTree,
    setFontSize, adjustFontSize, setAutoSave, autoSave, setAutoSaveDelay,
    cycleColorMode, colorMode, toggleVimMode, vimMode, fontId, setFontId, codeFontId, setCodeFontId,
    setImageStorage, handleExtractImages, setTheme, setCodeTheme, showToast,
    recentFiles, handleOpenPath, clearRecentFiles,
  ]);

  useMenuEvents(handleMenuAction);

  // ─── Listen for file-open events (double-click .md in Finder/Explorer) ───
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      if (cancelled) return;
      unlisten = await listen<string>('open-file', (event) => {
        handleOpenPath(event.payload);
      });
      if (cancelled && unlisten) {
        unlisten();
        unlisten = null;
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [handleOpenPath]);

  // ─── Web-mode keyboard shortcuts (fallback when no native menu) ───
  // In Tauri mode, native menu accelerators handle these — skip to avoid double-fire
  useEffect(() => {
    if (isTauri()) return;

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
    handleCopyWeChat, toggleOutline, toggleFileTree,
    showEditor, showPreview, adjustFontSize, cycleColorMode, toggleVimMode,
  ]);

  return (
    <div className="app app-typora" style={outlineVars as unknown as CSSProperties}>
      {isDragOver && (
        <div className="drag-drop-overlay">
          <div className="drag-drop-card">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>拖放 Markdown 或图片以打开</span>
          </div>
        </div>
      )}
      <TabBar />
      <div className="app-content">
        {showFileTree && (
          <div className="file-tree-panel">
            <FileTree currentFilePath={filePath} onFileSelect={handleFileTreeSelect} onFolderOpen={() => {}} onFileRename={handleFileTreeRename} onFileDelete={handleFileTreeDelete} />
          </div>
        )}

        {showOutline && (
          <div className="outline-panel">
            <Outline
              content={content}
              onItemClick={handleOutlineClick}
              onHeadingLevelChange={handleHeadingLevelChange}
              onHeadingMove={handleHeadingMove}
              canEdit
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
              onCursorChange={handleCursorChange}
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
                codeTheme={codeTheme}
                fontSize={fontSize}
                filePath={filePath}
                isComposing={isComposing}
                onScroll={handlePreviewScroll}
              />
            ) : (
              <Preview
                ref={previewScrollRef}
                content={content}
                theme={theme}
                codeTheme={codeTheme}
                fontSize={fontSize}
                filePath={filePath}
                isComposing={isComposing}
                onScroll={handlePreviewScroll}
              />
            )}
          </div>
        )}
      </div>

      <StatusBar
        content={content}
        isComposing={isComposing}
        onCycleTheme={handleCycleTheme}
        onCycleCodeTheme={handleCycleCodeTheme}
        onSwitchView={handleSwitchView}
      />
    </div>
  );
}

export default App;
