import { create } from 'zustand';
import { DEFAULT_MARKDOWN } from '../lib/markdown';
import type { ImageStorageStrategy } from '../types';

interface EditorStore {
  // 内容
  content: string;
  setContent: (content: string) => void;
  
  // 文件信息
  fileName: string;
  setFileName: (name: string) => void;
  filePath: string | undefined;
  setFilePath: (path: string | undefined) => void;
  
  // 修改状态
  isModified: boolean;
  setIsModified: (modified: boolean) => void;
  
  // 主题
  theme: string;
  setTheme: (theme: string) => void;
  
  // 字体大小
  fontSize: number;
  setFontSize: (size: number) => void;
  
  // 图片存储策略
  imageStorage: ImageStorageStrategy;
  setImageStorage: (strategy: ImageStorageStrategy) => void;
  
  // 自动保存
  autoSave: boolean;
  autoSaveDelay: number;
  setAutoSave: (enabled: boolean) => void;
  setAutoSaveDelay: (delay: number) => void;
  
  // 显示设置
  showEditor: boolean;
  showPreview: boolean;
  showOutline: boolean;
  toggleEditor: () => void;
  togglePreview: () => void;
  toggleOutline: () => void;
  
  // 重置
  reset: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  content: DEFAULT_MARKDOWN,
  setContent: (content) => set({ content, isModified: true }),
  
  fileName: 'untitled.md',
  setFileName: (fileName) => set({ fileName }),
  
  filePath: undefined,
  setFilePath: (filePath) => set({ filePath }),
  
  isModified: false,
  setIsModified: (isModified) => set({ isModified }),
  
  theme: 'github',
  setTheme: (theme) => set({ theme }),
  
  fontSize: 16,
  setFontSize: (fontSize) => set({ fontSize }),
  
  // 图片存储：默认使用 assets (Typora 风格)
  imageStorage: 'assets',
  setImageStorage: (imageStorage) => set({ imageStorage }),
  
  // 自动保存：默认开启，2秒延迟
  autoSave: true,
  autoSaveDelay: 2000,
  setAutoSave: (autoSave) => set({ autoSave }),
  setAutoSaveDelay: (autoSaveDelay) => set({ autoSaveDelay }),
  
  showEditor: true,
  showPreview: true,
  showOutline: false,
  toggleEditor: () => set((state) => ({ showEditor: !state.showEditor })),
  togglePreview: () => set((state) => ({ showPreview: !state.showPreview })),
  toggleOutline: () => set((state) => ({ showOutline: !state.showOutline })),
  
  reset: () => set({
    content: DEFAULT_MARKDOWN,
    fileName: 'untitled.md',
    filePath: undefined,
    isModified: false,
  }),
}));
