/**
 * 导出服务
 * 支持导出 HTML、PDF、图片
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
