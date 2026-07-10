import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MARKDOWN } from '../lib/markdown';
import type { ImageStorageStrategy } from '../types';

interface Doc {
  id: string;
  content: string;
  fileName: string;
  filePath: string | undefined;
  isModified: boolean;
}

interface EditorStore {
  // ─── Tabs ───
  tabs: Doc[];
  activeTabId: string;
  openTab: (doc: { content: string; fileName: string; filePath?: string }) => string;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  reorderTabs: (fromId: string, toId: string) => void;

  // ─── Active document (shadow fields, kept in sync with active tab) ───
  content: string;
  fileName: string;
  filePath: string | undefined;
  isModified: boolean;
  setContent: (content: string) => void;
  setFileName: (name: string) => void;
  setFilePath: (path: string | undefined) => void;
  setIsModified: (modified: boolean) => void;

  // ─── Theme ───
  theme: string;
  setTheme: (theme: string) => void;
  // ─── Code Theme (与文章主题正交，控制代码块高亮) ───
  codeTheme: string;
  setCodeTheme: (codeTheme: string) => void;

  // ─── Font ───
  fontSize: number;
  setFontSize: (size: number) => void;
  adjustFontSize: (delta: number) => void;
  fontId: string;
  codeFontId: string;
  setFontId: (id: string) => void;
  setCodeFontId: (id: string) => void;

  // ─── Image ───
  imageStorage: ImageStorageStrategy;
  setImageStorage: (strategy: ImageStorageStrategy) => void;

  // ─── Vim ───
  vimMode: boolean;
  toggleVimMode: () => void;

  // ─── Color mode ───
  colorMode: 'auto' | 'light' | 'dark';
  setColorMode: (mode: 'auto' | 'light' | 'dark') => void;
  cycleColorMode: () => void;

  // ─── Auto-save ───
  autoSave: boolean;
  autoSaveDelay: number;
  setAutoSave: (enabled: boolean) => void;
  setAutoSaveDelay: (delay: number) => void;

  // ─── View ───
  showEditor: boolean;
  showPreview: boolean;
  showOutline: boolean;
  showFileTree: boolean;
  toggleEditor: () => void;
  togglePreview: () => void;
  toggleOutline: () => void;
  toggleFileTree: () => void;

  // ─── Cursor / selection (runtime, not persisted) ───
  cursor: { line: number; col: number };
  selection: { chars: number; words: number };
  setCursor: (cursor: { line: number; col: number }) => void;
  setSelection: (selection: { chars: number; words: number }) => void;

  // ─── Recent files & theme usage (persisted) ───
  recentFiles: string[];
  themeUsage: Record<string, number>;
  addRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
  recordThemeUsage: (theme: string) => void;

  // ─── Reset ───
  reset: () => void;
}

let tabIdCounter = 0;
function genTabId() { return `tab-${Date.now()}-${tabIdCounter++}`; }

function patchTab(tabs: Doc[], tabId: string, patch: Partial<Doc>): Doc[] {
  return tabs.map(t => t.id === tabId ? { ...t, ...patch } : t);
}

function findTab(tabs: Doc[], tabId: string): Doc | undefined {
  return tabs.find(t => t.id === tabId);
}

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => {
      const initialId = genTabId();
      const initialDoc: Doc = {
        id: initialId,
        content: DEFAULT_MARKDOWN,
        fileName: 'untitled.md',
        filePath: undefined,
        isModified: false,
      };

      // Helper to sync shadow fields from active tab
      const syncShadow = (tabs: Doc[], activeTabId: string) => {
        const t = findTab(tabs, activeTabId) || tabs[0];
        return { content: t.content, fileName: t.fileName, filePath: t.filePath, isModified: t.isModified };
      };

      return {
      tabs: [initialDoc],
      activeTabId: initialId,
      content: initialDoc.content,
      fileName: initialDoc.fileName,
      filePath: initialDoc.filePath,
      isModified: initialDoc.isModified,

      openTab: (doc) => {
        const { tabs } = get();
        if (doc.filePath) {
          const existing = tabs.find(t => t.filePath === doc.filePath);
          if (existing) {
            set({ activeTabId: existing.id, ...syncShadow(tabs, existing.id) });
            return existing.id;
          }
        }
        const id = genTabId();
        const newTab: Doc = {
          id,
          content: doc.content,
          fileName: doc.fileName,
          filePath: doc.filePath,
          isModified: false,
        };
        set({ tabs: [...tabs, newTab], activeTabId: id, ...syncShadow([...tabs, newTab], id) });
        return id;
      },

      closeTab: (id) => {
        const { tabs, activeTabId } = get();
        const idx = tabs.findIndex(t => t.id === id);
        if (idx === -1) return;
        const newTabs = tabs.filter(t => t.id !== id);
        if (newTabs.length === 0) {
          const freshId = genTabId();
          const freshTab: Doc = {
            id: freshId,
            content: DEFAULT_MARKDOWN,
            fileName: 'untitled.md',
            filePath: undefined,
            isModified: false,
          };
          set({ tabs: [freshTab], activeTabId: freshId, ...syncShadow([freshTab], freshId) });
          return;
        }
        const newActiveId = id === activeTabId
          ? newTabs[Math.min(idx, newTabs.length - 1)].id
          : activeTabId;
        set({ tabs: newTabs, activeTabId: newActiveId, ...syncShadow(newTabs, newActiveId) });
      },

      switchTab: (id) => {
        const { tabs } = get();
        if (findTab(tabs, id)) {
          set({ activeTabId: id, ...syncShadow(tabs, id) });
        }
      },

      reorderTabs: (fromId, toId) => {
        const { tabs } = get();
        if (fromId === toId) return;
        const fromIdx = tabs.findIndex(t => t.id === fromId);
        const toIdx = tabs.findIndex(t => t.id === toId);
        if (fromIdx === -1 || toIdx === -1) return;
        const newTabs = [...tabs];
        const [moved] = newTabs.splice(fromIdx, 1);
        newTabs.splice(toIdx, 0, moved);
        set({ tabs: newTabs });
      },

      // ─── Document setters (write to active tab + sync shadow) ───
      setContent: (content) => {
        const { activeTabId, tabs } = get();
        const current = findTab(tabs, activeTabId);
        if (current && current.content === content) return;
        const newTabs = patchTab(tabs, activeTabId, { content, isModified: true });
        set({ tabs: newTabs, content, isModified: true });
      },
      setFileName: (fileName) => {
        const { activeTabId, tabs } = get();
        const newTabs = patchTab(tabs, activeTabId, { fileName });
        set({ tabs: newTabs, fileName });
      },
      setFilePath: (filePath) => {
        const { activeTabId, tabs } = get();
        const newTabs = patchTab(tabs, activeTabId, { filePath });
        set({ tabs: newTabs, filePath });
      },
      setIsModified: (isModified) => {
        const { activeTabId, tabs } = get();
        const newTabs = patchTab(tabs, activeTabId, { isModified });
        set({ tabs: newTabs, isModified });
      },

      // ─── Theme ───
      theme: 'github',
      setTheme: (theme) => set({ theme }),
      // ─── Code Theme ───
      codeTheme: 'atom-one-dark',
      setCodeTheme: (codeTheme) => set({ codeTheme }),

      // ─── Font ───
      fontSize: 16,
      setFontSize: (fontSize) => set({ fontSize }),
      adjustFontSize: (delta) => set((state) => ({ fontSize: Math.min(24, Math.max(12, state.fontSize + delta)) })),
      fontId: 'system',
      codeFontId: 'jetbrains',
      setFontId: (fontId) => set({ fontId }),
      setCodeFontId: (codeFontId) => set({ codeFontId }),

      // ─── Image ───
      imageStorage: 'assets',
      setImageStorage: (imageStorage) => set({ imageStorage }),

      // ─── Vim ───
      vimMode: false,
      toggleVimMode: () => set((state) => ({ vimMode: !state.vimMode })),

      // ─── Color mode ───
      colorMode: 'auto',
      setColorMode: (colorMode) => set({ colorMode }),
      cycleColorMode: () => set((state) => {
        const order: ('auto' | 'light' | 'dark')[] = ['auto', 'light', 'dark'];
        const idx = order.indexOf(state.colorMode);
        return { colorMode: order[(idx + 1) % order.length] };
      }),

      // ─── Auto-save ───
      autoSave: true,
      autoSaveDelay: 2000,
      setAutoSave: (autoSave) => set({ autoSave }),
      setAutoSaveDelay: (autoSaveDelay) => set({ autoSaveDelay }),

      // ─── View ───
      showEditor: true,
      showPreview: true,
      showOutline: false,
      showFileTree: false,
      toggleEditor: () => set((state) => ({ showEditor: !state.showEditor })),
      togglePreview: () => set((state) => ({ showPreview: !state.showPreview })),
      toggleOutline: () => set((state) => ({ showOutline: !state.showOutline })),
      toggleFileTree: () => set((state) => ({ showFileTree: !state.showFileTree })),

      // ─── Cursor / selection (runtime) ───
      cursor: { line: 1, col: 1 },
      selection: { chars: 0, words: 0 },
      setCursor: (cursor) => set({ cursor }),
      setSelection: (selection) => set({ selection }),

      // ─── Recent files & theme usage ───
      recentFiles: [],
      themeUsage: {},
      addRecentFile: (path) => set((state) => {
        const filtered = state.recentFiles.filter(p => p !== path);
        return { recentFiles: [path, ...filtered].slice(0, 15) };
      }),
      clearRecentFiles: () => set({ recentFiles: [] }),
      recordThemeUsage: (theme) => set((state) => ({
        themeUsage: { ...state.themeUsage, [theme]: (state.themeUsage[theme] || 0) + 1 },
      })),

      // ─── Reset (reset active tab) ───
      reset: () => {
        const { activeTabId, tabs } = get();
        const newTabs = patchTab(tabs, activeTabId, {
          content: DEFAULT_MARKDOWN,
          fileName: 'untitled.md',
          filePath: undefined,
          isModified: false,
        });
        set({
          tabs: newTabs,
          content: DEFAULT_MARKDOWN,
          fileName: 'untitled.md',
          filePath: undefined,
          isModified: false,
        });
      },
      };
    },
    {
      name: 'md-ai-settings-v2',
      partialize: (state) => ({
        theme: state.theme,
        codeTheme: state.codeTheme,
        fontSize: state.fontSize,
        fontId: state.fontId,
        codeFontId: state.codeFontId,
        colorMode: state.colorMode,
        vimMode: state.vimMode,
        imageStorage: state.imageStorage,
        autoSave: state.autoSave,
        autoSaveDelay: state.autoSaveDelay,
        showEditor: state.showEditor,
        showPreview: state.showPreview,
        showOutline: state.showOutline,
        showFileTree: state.showFileTree,
        recentFiles: state.recentFiles,
        themeUsage: state.themeUsage,
      }),
    }
  )
);
