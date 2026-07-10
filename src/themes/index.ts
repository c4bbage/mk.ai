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
import './mdnice-default.css';
import './mdnice-smartisan.css';
import './mdnice-yanqi.css';
import './mdnice-wechat-format.css';
import './mdnice-minimal-black.css';
import './mdnice-shanchui.css';
import './mdnice-hongfei.css';
import './mdnice-lvyi.css';
import './mdnice-nenqing.css';
import './mdnice-chazi.css';
import './mdnice-chengxin.css';
import './code-atom-one-dark.css';
import './code-atom-one-light.css';
import './code-monokai.css';
import './code-github.css';
import './code-vs2015.css';
import './code-xcode.css';
import './code-mac.css';
import './code-base.css';

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
  'mdnice-default': { text: '#3f3f3f', accent: '#1e6bb8', bgSecondary: '#f6f8fa', bgCode: '#f6f8fa', border: '#ccc' },
  'mdnice-smartisan': { text: '#635753', accent: '#ebdfd5', bgSecondary: '#f6f8fa', bgCode: '#f6f8fa', border: '#ccc' },
  'mdnice-yanqi': { text: '#2c3e50', accent: 'rgb(37,132,181)', bgSecondary: '#f6f8fa', bgCode: '#f6f8fa', border: '#ccc' },
  'mdnice-wechat-format': { text: '#3f3f3f', accent: '#ff3502', bgSecondary: 'rgba(158, 158, 158, 0.1)', bgCode: '#f8f5ec', border: '#ccc' },
  'mdnice-minimal-black': { text: '#3f3f3f', accent: '#1f1f1f', bgSecondary: 'rgb(249, 249, 249)', bgCode: '#ff6441', border: '#ccc' },
  'mdnice-shanchui': { text: '#3a3a3a', accent: '#dda52d', bgSecondary: '#fff5e3', bgCode: '#fff5e3', border: '#ccc' },
  'mdnice-hongfei': { text: '#353535', accent: 'rgb(248, 57, 41)', bgSecondary: '#f5f5f5', bgCode: '#1e6bb8', border: '#ccc' },
  'mdnice-lvyi': { text: '#3f3f3f', accent: '#35b378', bgSecondary: '#f6f8fa', bgCode: '#35b378', border: '#ccc' },
  'mdnice-nenqing': { text: 'rgb(89,89,89)', accent: 'rgb(71, 193, 168)', bgSecondary: '#f6f8fa', bgCode: 'rgb(71, 193, 168)', border: '#ccc' },
  'mdnice-chazi': { text: '#3f3f3f', accent: '#773098', bgSecondary: '#f6f8fa', bgCode: '#9654B5', border: '#ccc' },
  'mdnice-chengxin': { text: '#3f3f3f', accent: 'rgb(239, 112, 96)', bgSecondary: '#fff9f9', bgCode: 'rgb(239, 112, 96)', border: '#ccc' },
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
  { id: 'mdnice-default', name: 'Mdnice · 默认', className: 'theme-mdnice-default' },
  { id: 'mdnice-smartisan', name: 'Mdnice · 锤子便签', className: 'theme-mdnice-smartisan' },
  { id: 'mdnice-yanqi', name: 'Mdnice · 雁栖湖', className: 'theme-mdnice-yanqi' },
  { id: 'mdnice-wechat-format', name: 'Mdnice · WeChat格式', className: 'theme-mdnice-wechat-format' },
  { id: 'mdnice-minimal-black', name: 'Mdnice · 极简黑', className: 'theme-mdnice-minimal-black' },
  { id: 'mdnice-shanchui', name: 'Mdnice · 山吹', className: 'theme-mdnice-shanchui' },
  { id: 'mdnice-hongfei', name: 'Mdnice · 红绯', className: 'theme-mdnice-hongfei' },
  { id: 'mdnice-lvyi', name: 'Mdnice · 绿意', className: 'theme-mdnice-lvyi' },
  { id: 'mdnice-nenqing', name: 'Mdnice · 嫩青', className: 'theme-mdnice-nenqing' },
  { id: 'mdnice-chazi', name: 'Mdnice · 姹紫', className: 'theme-mdnice-chazi' },
  { id: 'mdnice-chengxin', name: 'Mdnice · 橙心', className: 'theme-mdnice-chengxin' },
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

// 代码主题列表（与文章主题正交，可任意搭配；源自 wechat.jeffjade.com / mdnice）
export const CODE_THEMES: Theme[] = [
  { id: 'atom-one-dark', name: 'Atom One Dark', className: 'code-theme-atom-one-dark' },
  { id: 'atom-one-light', name: 'Atom One Light', className: 'code-theme-atom-one-light' },
  { id: 'monokai', name: 'Monokai', className: 'code-theme-monokai' },
  { id: 'github', name: 'GitHub', className: 'code-theme-github' },
  { id: 'vs2015', name: 'VS2015', className: 'code-theme-vs2015' },
  { id: 'xcode', name: 'XCode', className: 'code-theme-xcode' },
  { id: 'mac', name: 'Mac 风格', className: 'code-theme-mac' },
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

// 获取代码主题配置
export function getCodeTheme(id: string): Theme | undefined {
  return CODE_THEMES.find(t => t.id === id);
}

// 获取代码主题类名（兜底 atom-one-dark）
export function getCodeThemeClass(id: string): string {
  return getCodeTheme(id)?.className || 'code-theme-atom-one-dark';
}

// 获取字体配置
export function getFont(id: string): FontConfig | undefined {
  return FONT_PRESETS.find(f => f.id === id);
}
