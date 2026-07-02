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
}

/**
 * 图片存储策略
 * - base64: 内嵌到文档（默认，小图片推荐）
 * - assets: Typora 风格，保存到 ./文档名.assets/
 * - images: 保存到 ./images/
 * - url: 临时 URL（仅会话有效）
 * - absolute: 绝对路径（仅 Tauri 环境）
 */
export type ImageStorageStrategy =
  | 'base64'    // 内嵌 Base64
  | 'assets'    // ./文档名.assets/ (Typora 风格)
  | 'images'    // ./images/
  | 'absolute'  // 绝对路径（仅 Tauri）
  | 'url';      // 临时 URL（仅会话有效）
