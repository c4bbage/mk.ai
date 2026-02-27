/**
 * 导出服务
 * 支持导出 HTML、PDF、图片、复制公众号格式
 */

import { parseMarkdown } from './markdown';
import { isTauri } from './file';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile } from '@tauri-apps/plugin-fs';

/**
 * 生成完整的 HTML 文档（包含样式和图片）
 */
export function generateFullHTML(
  content: string,
  theme: string,
  title: string = 'Markdown Document'
): string {
  const html = parseMarkdown(content);

  // 获取 KaTeX 样式
  const katexCSS = document.querySelector('link[href*="katex"]')?.outerHTML || '';

  // 获取当前主题的样式
  const themeStyles = getThemeStyles(theme);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${katexCSS}
  <style>
    ${getBaseStyles()}
    ${themeStyles}
  </style>
</head>
<body>
  <div class="markdown-body">
    ${html}
  </div>
</body>
</html>`;
}

/**
 * 复制为微信公众号格式（带内联样式的 HTML，可直接粘贴到公众号编辑器）
 */
export async function copyForWeChat(
  content: string,
  theme: string
): Promise<boolean> {
  const html = parseMarkdown(content);
  const themeConfig = getWeChatInlineTheme(theme);

  // 将 CSS class 样式转为内联样式，微信编辑器不支持 <style> 标签
  const inlinedHtml = applyInlineStyles(html, themeConfig);

  const wrappedHtml = `<section style="max-width:780px;margin:0 auto;padding:20px 15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;font-size:16px;line-height:1.8;color:${themeConfig.text};">${inlinedHtml}</section>`;

  try {
    // 使用 Clipboard API 写入 HTML 格式
    const blob = new Blob([wrappedHtml], { type: 'text/html' });
    const textBlob = new Blob([content], { type: 'text/plain' });
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': textBlob,
      }),
    ]);
    return true;
  } catch {
    // 降级：使用 execCommand
    const container = document.createElement('div');
    container.innerHTML = wrappedHtml;
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const ok = document.execCommand('copy');
    selection?.removeAllRanges();
    document.body.removeChild(container);
    return ok;
  }
}

/** 微信主题内联样式配置 */
interface WeChatThemeConfig {
  text: string;
  accent: string;
  bgSecondary: string;
  bgCode: string;
  border: string;
}

function getWeChatInlineTheme(theme: string): WeChatThemeConfig {
  const themes: Record<string, WeChatThemeConfig> = {
    'wechat-elegant': { text: '#3f3f3f', accent: '#ff6827', bgSecondary: '#f7f7f7', bgCode: '#fff5f5', border: '#eee' },
    'wechat-green': { text: '#333', accent: '#07c160', bgSecondary: '#f8fdf8', bgCode: '#f0f9f0', border: '#e0e0e0' },
    'wechat-blue': { text: '#2c3e50', accent: '#409eff', bgSecondary: '#f5f7fa', bgCode: '#ecf5ff', border: '#dcdfe6' },
  };
  return themes[theme] || { text: '#24292e', accent: '#0366d6', bgSecondary: '#f6f8fa', bgCode: '#f6f8fa', border: '#e1e4e8' };
}

/** 将 HTML 标签转为带内联样式的版本（微信公众号兼容） */
function applyInlineStyles(html: string, t: WeChatThemeConfig): string {
  return html
    // 标题
    .replace(/<h1([^>]*)>([\s\S]*?)<\/h1>/g, `<h1$1 style="font-size:1.8em;font-weight:700;text-align:center;color:${t.accent};margin:24px 0 16px;line-height:1.4;border-bottom:2px solid ${t.accent};padding-bottom:12px;">$2</h1>`)
    .replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/g, `<h2$1 style="font-size:1.3em;font-weight:600;color:#fff;background:${t.accent};padding:6px 14px;border-radius:4px;margin:24px 0 12px;display:inline-block;line-height:1.4;">$2</h2>`)
    .replace(/<h3([^>]*)>([\s\S]*?)<\/h3>/g, `<h3$1 style="font-size:1.1em;font-weight:600;color:${t.accent};border-left:3px solid ${t.accent};padding-left:10px;margin:20px 0 10px;line-height:1.4;">$2</h3>`)
    .replace(/<h([4-6])([^>]*)>([\s\S]*?)<\/h\1>/g, `<h$1$2 style="font-weight:600;color:${t.text};margin:16px 0 8px;line-height:1.4;">$3</h$1>`)
    // 段落
    .replace(/<p([^>]*)>/g, `<p$1 style="margin:0 0 16px;line-height:1.8;color:${t.text};">`)
    // 引用
    .replace(/<blockquote([^>]*)>/g, `<blockquote$1 style="border-left:4px solid ${t.accent};background:${t.bgSecondary};padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;color:${t.text};">`)
    // 行内代码
    .replace(/<code(?![^>]*class="hljs)([^>]*)>/g, `<code$1 style="background:${t.bgCode};color:${t.accent};padding:2px 6px;border-radius:4px;font-size:0.9em;font-family:Menlo,Monaco,Consolas,monospace;">`)
    // 代码块
    .replace(/<pre([^>]*)>/g, `<pre$1 style="background:#2b2b2b;padding:16px;border-radius:8px;overflow-x:auto;margin:16px 0;">`)
    .replace(/<pre[^>]*>\s*<code([^>]*)>/g, `<pre style="background:#2b2b2b;padding:16px;border-radius:8px;overflow-x:auto;margin:16px 0;"><code$1 style="color:#a9b7c6;background:transparent;padding:0;font-size:14px;line-height:1.5;font-family:Menlo,Monaco,Consolas,monospace;">`)
    // 表格
    .replace(/<table([^>]*)>/g, `<table$1 style="border-collapse:collapse;width:100%;margin:16px 0;">`)
    .replace(/<th([^>]*)>/g, `<th$1 style="background:${t.accent};color:#fff;font-weight:600;padding:8px 12px;border:1px solid ${t.border};text-align:left;">`)
    .replace(/<td([^>]*)>/g, `<td$1 style="padding:8px 12px;border:1px solid ${t.border};">`)
    // 链接
    .replace(/<a ([^>]*)>/g, `<a $1 style="color:${t.accent};text-decoration:none;">`)
    // 加粗
    .replace(/<strong([^>]*)>/g, `<strong$1 style="color:${t.accent};font-weight:600;">`)
    // 列表
    .replace(/<ul([^>]*)>/g, `<ul$1 style="padding-left:2em;margin:0 0 16px;">`)
    .replace(/<ol([^>]*)>/g, `<ol$1 style="padding-left:2em;margin:0 0 16px;">`)
    .replace(/<li([^>]*)>/g, `<li$1 style="margin-bottom:4px;line-height:1.8;">`)
    // 分割线
    .replace(/<hr([^>]*)\/?>/g, `<hr$1 style="border:none;height:1px;background:linear-gradient(to right,transparent,${t.accent},transparent);margin:24px 0;" />`)
    // 图片
    .replace(/<img ([^>]*)>/g, `<img $1 style="max-width:100%;height:auto;border-radius:6px;margin:16px auto;display:block;">`);
}

/**
 * 导出为 HTML 文件
 */
export async function exportHTML(
  content: string,
  theme: string,
  fileName: string = 'document.html'
): Promise<void> {
  const fullHTML = generateFullHTML(content, theme, fileName.replace('.html', ''));
  
  if (isTauri()) {
    const filePath = await save({
      filters: [{ name: 'HTML', extensions: ['html'] }],
      defaultPath: fileName
    });
    
    if (filePath) {
      await writeTextFile(filePath, fullHTML);
    }
  } else {
    downloadFile(fullHTML, fileName, 'text/html');
  }
}

/**
 * 导出为图片 (PNG)
 */
export async function exportImage(
  previewElement: HTMLElement,
  fileName: string = 'document.png'
): Promise<void> {
  // 动态导入 html2canvas
  const html2canvas = (await import('html2canvas')).default;
  
  // 创建一个克隆元素用于截图
  const clone = previewElement.cloneNode(true) as HTMLElement;
  clone.style.width = `${previewElement.scrollWidth}px`;
  clone.style.height = 'auto';
  clone.style.position = 'absolute';
  clone.style.left = '-9999px';
  clone.style.background = '#ffffff';
  document.body.appendChild(clone);
  
  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
    
    const dataUrl = canvas.toDataURL('image/png');
    
    if (isTauri()) {
      const filePath = await save({
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
        defaultPath: fileName
      });
      
      if (filePath) {
        // 将 base64 转为二进制
        const base64Data = dataUrl.split(',')[1];
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        await writeFile(filePath, binaryData);
      }
    } else {
      downloadDataUrl(dataUrl, fileName);
    }
  } finally {
    document.body.removeChild(clone);
  }
}

/**
 * 导出为 PDF（使用浏览器打印功能）
 */
export async function exportPDF(
  content: string,
  theme: string,
  title: string = 'document'
): Promise<void> {
  const fullHTML = generateFullHTML(content, theme, title);
  
  // 创建一个隐藏的 iframe 用于打印
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);
  
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(fullHTML);
    doc.close();
    
    // 等待资源加载
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 触发打印
    iframe.contentWindow?.print();
  }
  
  // 延迟移除 iframe
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 1000);
}

/**
 * 下载文件（Web 环境）
 */
function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 下载 Data URL（Web 环境）
 */
function downloadDataUrl(dataUrl: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * 获取基础样式
 */
function getBaseStyles(): string {
  return `
    body {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #24292e;
    }
    
    .markdown-body {
      font-size: 16px;
    }
    
    .markdown-body h1, .markdown-body h2, .markdown-body h3,
    .markdown-body h4, .markdown-body h5, .markdown-body h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }
    
    .markdown-body h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    .markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    .markdown-body h3 { font-size: 1.25em; }
    
    .markdown-body p { margin-top: 0; margin-bottom: 16px; }
    
    .markdown-body code {
      background: #f6f8fa;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-size: 85%;
    }
    
    .markdown-body pre {
      background: #f6f8fa;
      padding: 16px;
      overflow: auto;
      border-radius: 6px;
    }
    
    .markdown-body pre code {
      background: none;
      padding: 0;
    }
    
    .markdown-body blockquote {
      border-left: 4px solid #dfe2e5;
      margin: 0;
      padding: 0 16px;
      color: #6a737d;
    }
    
    .markdown-body table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 16px;
    }
    
    .markdown-body table th,
    .markdown-body table td {
      border: 1px solid #dfe2e5;
      padding: 8px 12px;
    }
    
    .markdown-body table th {
      background: #f6f8fa;
      font-weight: 600;
    }
    
    .markdown-body img {
      max-width: 100%;
      height: auto;
    }
    
    .markdown-body ul, .markdown-body ol {
      padding-left: 2em;
      margin-bottom: 16px;
    }
    
    .markdown-body hr {
      border: none;
      border-top: 1px solid #eaecef;
      margin: 24px 0;
    }
    
    @media print {
      body { margin: 0; padding: 20px; }
      .markdown-body { font-size: 12pt; }
    }
  `;
}

/**
 * 获取主题样式
 */
function getThemeStyles(theme: string): string {
  const themes: Record<string, string> = {
    'github': '',
    'wechat-elegant': `
      .markdown-body { color: #3f3f3f; }
      .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: #ff6827; }
      .markdown-body a { color: #ff6827; }
      .markdown-body blockquote { border-left-color: #ff6827; }
    `,
    'wechat-green': `
      .markdown-body { color: #3f3f3f; }
      .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: #07c160; }
      .markdown-body a { color: #07c160; }
      .markdown-body blockquote { border-left-color: #07c160; }
    `,
    'wechat-blue': `
      .markdown-body { color: #3f3f3f; }
      .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: #409eff; }
      .markdown-body a { color: #409eff; }
      .markdown-body blockquote { border-left-color: #409eff; }
    `,
  };
  
  return themes[theme] || '';
}
