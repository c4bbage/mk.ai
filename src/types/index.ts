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

/**
 * 图片存储策略
 * - base64: 内嵌到文档（默认，小图片推荐）
 * - assets: Typora 风格，保存到 ./文档名.assets/
 * - images: 保存到 ./images/
 * - absolute: 保存到绝对路径
 */
export type ImageStorageStrategy = 
  | 'base64'    // 内嵌 Base64
  | 'assets'    // ./文档名.assets/ (Typora 风格)
  | 'images'    // ./images/
  | 'absolute'  // 绝对路径
  | 'url';      // 临时 URL（仅会话有效）

export interface ImageConfig {
  strategy: ImageStorageStrategy;
  /** 自定义保存目录（仅 absolute 模式） */
  customPath?: string;
  /** 图片最大尺寸（KB），超过则压缩 */
  maxSize?: number;
  /** 压缩质量 0-1 */
  quality?: number;
}

// 编辑器状态
export interface EditorState {
  content: string;
  fileName: string;
  isModified: boolean;
}
