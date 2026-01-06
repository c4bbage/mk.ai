// 主题类型
export interface Theme {
  id: string;
  name: string;
  className: string;
}

// 字体配置
export interface FontConfig {
  id: string;
  name: string;
  family: string;
  fallback: string[];
  webFontUrl?: string;
}

// 编辑器设置
export interface EditorSettings {
  theme: string;
  fontSize: number;
  fontFamily: string;
  codeFontFamily: string;
  lineHeight: number;
  tabSize: number;
  showLineNumbers: boolean;
}

// 图片存储策略
export type ImageStorageStrategy = 'base64' | 'local' | 'url';

export interface ImageConfig {
  strategy: ImageStorageStrategy;
  maxSize?: number;
  quality?: number;
}

// 编辑器状态
export interface EditorState {
  content: string;
  fileName: string;
  isModified: boolean;
}
