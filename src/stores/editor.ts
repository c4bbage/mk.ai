import { create } from 'zustand';
import { DEFAULT_MARKDOWN } from '../lib/markdown';

interface EditorStore {
  // 内容
  content: string;
  setContent: (content: string) => void;
  
  // 文件信息
  fileName: string;
  setFileName: (name: string) => void;
  
  // 修改状态
  isModified: boolean;
  setIsModified: (modified: boolean) => void;
  
  // 主题
  theme: string;
  setTheme: (theme: string) => void;
  
  // 字体大小
  fontSize: number;
  setFontSize: (size: number) => void;
  
  // 显示设置
  showEditor: boolean;
  showPreview: boolean;
  toggleEditor: () => void;
  togglePreview: () => void;
  
  // 重置
  reset: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  content: DEFAULT_MARKDOWN,
  setContent: (content) => set({ content, isModified: true }),
  
  fileName: 'untitled.md',
  setFileName: (fileName) => set({ fileName }),
  
  isModified: false,
  setIsModified: (isModified) => set({ isModified }),
  
  theme: 'github',
  setTheme: (theme) => set({ theme }),
  
  fontSize: 16,
  setFontSize: (fontSize) => set({ fontSize }),
  
  showEditor: true,
  showPreview: true,
  toggleEditor: () => set((state) => ({ showEditor: !state.showEditor })),
  togglePreview: () => set((state) => ({ showPreview: !state.showPreview })),
  
  reset: () => set({
    content: DEFAULT_MARKDOWN,
    fileName: 'untitled.md',
    isModified: false,
  }),
}));
