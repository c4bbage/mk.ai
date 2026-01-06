import type { Theme, FontConfig } from '../types';

// 导入所有主题样式
import './base.css';
import './github.css';
import './wechat-elegant.css';
import './wechat-green.css';
import './wechat-blue.css';

// 主题列表
export const THEMES: Theme[] = [
  { id: 'github', name: 'GitHub', className: 'theme-github' },
  { id: 'wechat-elegant', name: '微信-优雅橙', className: 'theme-wechat-elegant' },
  { id: 'wechat-green', name: '微信-清新绿', className: 'theme-wechat-green' },
  { id: 'wechat-blue', name: '微信-科技蓝', className: 'theme-wechat-blue' },
];

// 字体预设
export const FONT_PRESETS: FontConfig[] = [
  {
    id: 'system',
    name: '系统默认',
    family: 'system-ui',
    fallback: ['-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
  },
  {
    id: 'pingfang',
    name: '苹方',
    family: 'PingFang SC',
    fallback: ['Microsoft YaHei', 'sans-serif'],
  },
  {
    id: 'yahei',
    name: '微软雅黑',
    family: 'Microsoft YaHei',
    fallback: ['PingFang SC', 'sans-serif'],
  },
  {
    id: 'source-han-serif',
    name: '思源宋体',
    family: 'Source Han Serif SC',
    fallback: ['Noto Serif SC', 'serif'],
  },
  {
    id: 'optima',
    name: 'Optima',
    family: 'Optima',
    fallback: ['PingFang SC', 'sans-serif'],
  },
];

// 代码字体预设
export const CODE_FONT_PRESETS: FontConfig[] = [
  {
    id: 'jetbrains',
    name: 'JetBrains Mono',
    family: 'JetBrains Mono',
    fallback: ['Fira Code', 'Consolas', 'monospace'],
  },
  {
    id: 'fira',
    name: 'Fira Code',
    family: 'Fira Code',
    fallback: ['Consolas', 'monospace'],
  },
  {
    id: 'consolas',
    name: 'Consolas',
    family: 'Consolas',
    fallback: ['Monaco', 'monospace'],
  },
  {
    id: 'monaco',
    name: 'Monaco',
    family: 'Monaco',
    fallback: ['Consolas', 'monospace'],
  },
];

// 构建字体族字符串
export function buildFontFamily(config: FontConfig): string {
  const fonts = [config.family, ...config.fallback];
  return fonts.map(f => (f.includes(' ') ? `"${f}"` : f)).join(', ');
}

// 获取主题配置
export function getTheme(id: string): Theme | undefined {
  return THEMES.find(t => t.id === id);
}

// 获取字体配置
export function getFont(id: string): FontConfig | undefined {
  return FONT_PRESETS.find(f => f.id === id);
}
