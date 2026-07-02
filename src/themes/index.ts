import type { Theme, FontConfig } from '../types';

// 导入所有主题样式
import './base.css';
import './github.css';
import './wechat-elegant.css';
import './wechat-green.css';
import './wechat-blue.css';
import './pure-dark.css';
import './newsprint.css';
import './lavender.css';
import './mdc-light.css';
import './mdc-dark.css';
import './mmd-default.css';
import './mmd-breeze.css';
import './dark.css';

/** 主题颜色配置（用于导出和微信内联样式） */
export interface ThemeColors {
  text: string;
  accent: string;
  bgSecondary: string;
  bgCode: string;
  border: string;
}

export const THEME_COLORS: Record<string, ThemeColors> = {
  'github': { text: '#24292e', accent: '#0366d6', bgSecondary: '#f6f8fa', bgCode: '#f6f8fa', border: '#e1e4e8' },
  'wechat-elegant': { text: '#3f3f3f', accent: '#ff6827', bgSecondary: '#f7f7f7', bgCode: '#fff5f5', border: '#eee' },
  'wechat-green': { text: '#333', accent: '#07c160', bgSecondary: '#f8fdf8', bgCode: '#f0f9f0', border: '#e0e0e0' },
  'wechat-blue': { text: '#2c3e50', accent: '#409eff', bgSecondary: '#f5f7fa', bgCode: '#ecf5ff', border: '#dcdfe6' },
  'pure-dark': { text: '#e6edf3', accent: '#58a6ff', bgSecondary: '#161b22', bgCode: '#1c2333', border: '#30363d' },
  'newsprint': { text: '#4a4239', accent: '#c0392b', bgSecondary: '#f3ede3', bgCode: '#e8dccc', border: '#d4cdbf' },
  'lavender': { text: '#3a3857', accent: '#7c5cbf', bgSecondary: '#f5f0ff', bgCode: '#eee8ff', border: '#ddd6f0' },
  'mdc-light': { text: '#2c2c2c', accent: '#2563eb', bgSecondary: '#f5f5f5', bgCode: '#f6f8fa', border: '#e0e0e0' },
  'mdc-dark': { text: '#e0e0e0', accent: '#4cc9f0', bgSecondary: '#1a1a2e', bgCode: '#161b22', border: '#2a2a4a' },
  'mmd-default': { text: '#2c3e50', accent: '#312c20', bgSecondary: '#f8f9fa', bgCode: '#f6f8fa', border: '#e1e4e8' },
  'mmd-breeze': { text: '#2c3e50', accent: '#312c20', bgSecondary: '#f8f9fa', bgCode: '#f6f8fa', border: '#e1e4e8' },
};

export function getThemeColors(theme: string): ThemeColors {
  return THEME_COLORS[theme] || THEME_COLORS['github'];
}

// 主题列表
export const THEMES: Theme[] = [
  { id: 'github', name: 'GitHub', className: 'theme-github' },
  { id: 'wechat-elegant', name: '微信-优雅橙', className: 'theme-wechat-elegant' },
  { id: 'wechat-green', name: '微信-清新绿', className: 'theme-wechat-green' },
  { id: 'wechat-blue', name: '微信-科技蓝', className: 'theme-wechat-blue' },
  { id: 'pure-dark', name: '纯暗', className: 'theme-pure-dark' },
  { id: 'newsprint', name: '暖纸', className: 'theme-newsprint' },
  { id: 'lavender', name: '薰衣草', className: 'theme-lavender' },
  { id: 'mdc-light', name: 'MDC 清爽', className: 'theme-mdc-light' },
  { id: 'mdc-dark', name: 'MDC 深蓝', className: 'theme-mdc-dark' },
  { id: 'mmd-default', name: 'MMD 渐变', className: 'theme-mmd-default' },
  { id: 'mmd-breeze', name: 'MMD 微风', className: 'theme-mmd-breeze' },
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
