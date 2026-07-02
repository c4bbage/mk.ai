/**
 * 导出服务
 * 支持导出 HTML、PDF、图片、复制公众号格式
 */

import { parseMarkdown } from './markdown';
import { sanitizeMarkdownHtml } from './sanitize';
import { isTauri } from './file';
import { getThemeColors, type ThemeColors } from '../themes';

/**
 * 生成完整的 HTML 文档（包含样式和图片）
 */
export function generateFullHTML(
  content: string,
  theme: string,
  title: string = 'Markdown Document'
): string {
  const bodyHtml = getMarkdownBodyHtml(content);
  return wrapFullHTML(bodyHtml, theme, title);
}

/**
 * Parse markdown → sanitize → return body inner HTML only
 */
export function getMarkdownBodyHtml(content: string): string {
  const rawHtml = parseMarkdown(content);
  return sanitizeMarkdownHtml(rawHtml);
}

function getKatexCSS(): string {
  // KaTeX CSS may be loaded as <link> or <style> (via Vite lazy import)
  const link = document.querySelector('link[href*="katex"]');
  if (link) return link.outerHTML;
  // Try to find injected <style> containing katex rules
  const styles = document.querySelectorAll('style');
  for (const s of styles) {
    if (s.textContent && s.textContent.includes('.katex')) {
      return `<style>${s.textContent}</style>`;
    }
  }
  return '';
}

/**
 * Wrap pre-rendered body HTML into a full standalone HTML document
 */
function wrapFullHTML(bodyHtml: string, theme: string, title: string): string {
  // 获取 KaTeX 样式
  const katexCSS = getKatexCSS();

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
    ${bodyHtml}
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
  const rawHtml = parseMarkdown(content);
  const html = sanitizeMarkdownHtml(rawHtml);
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

/**
 * 复制 Markdown 原文到剪贴板
 */
export async function copyMarkdown(content: string): Promise<boolean> {
  try {
    const textBlob = new Blob([content], { type: 'text/plain' });
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': textBlob })]);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }
}

/**
 * 复制渲染后的 HTML 到剪贴板
 */
export async function copyHTML(content: string, theme: string, title: string = 'Markdown Document'): Promise<boolean> {
  const fullHTML = generateFullHTML(content, theme, title);
  try {
    const blob = new Blob([fullHTML], { type: 'text/html' });
    const textBlob = new Blob([content], { type: 'text/plain' });
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob })]);
    return true;
  } catch {
    const container = document.createElement('div');
    container.innerHTML = fullHTML;
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
type WeChatThemeConfig = ThemeColors;

function getWeChatInlineTheme(theme: string): WeChatThemeConfig {
  return getThemeColors(theme);
}

/** 将 HTML 标签转为带内联样式的版本（微信公众号兼容） */
function applyInlineStyles(html: string, t: WeChatThemeConfig): string {
  return html
    // 标题 (只处理没有 style 属性的标签，避免重复)
    .replace(/<h1\b(?![\s>]*style)([^>]*)>([\s\S]*?)<\/h1>/g, `<h1$1 style="font-size:1.8em;font-weight:700;text-align:center;color:${t.accent};margin:24px 0 16px;line-height:1.4;border-bottom:2px solid ${t.accent};padding-bottom:12px;">$2</h1>`)
    .replace(/<h2\b(?![\s>]*style)([^>]*)>([\s\S]*?)<\/h2>/g, `<h2$1 style="font-size:1.3em;font-weight:600;color:#fff;background:${t.accent};padding:6px 14px;border-radius:4px;margin:24px 0 12px;display:inline-block;line-height:1.4;">$2</h2>`)
    .replace(/<h3\b(?![\s>]*style)([^>]*)>([\s\S]*?)<\/h3>/g, `<h3$1 style="font-size:1.1em;font-weight:600;color:${t.accent};border-left:3px solid ${t.accent};padding-left:10px;margin:20px 0 10px;line-height:1.4;">$2</h3>`)
    .replace(/<h([4-6])\b(?![\s>]*style)([^>]*)>([\s\S]*?)<\/h\1>/g, `<h$1$2 style="font-weight:600;color:${t.text};margin:16px 0 8px;line-height:1.4;">$3</h$1>`)
    // 段落
    .replace(/<p\b(?![\s>]*style)([^>]*)>/g, `<p$1 style="margin:0 0 16px;line-height:1.8;color:${t.text};">`)
    // 引用
    .replace(/<blockquote\b(?![\s>]*style)([^>]*)>/g, `<blockquote$1 style="border-left:4px solid ${t.accent};background:${t.bgSecondary};padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0;color:${t.text};">`)
    // 行内代码 (跳过已 style 或 class="hljs" 的)
    .replace(/<code\b(?![\s>]*style)(?![^>]*class="hljs)([^>]*)>/g, `<code$1 style="background:${t.bgCode};color:${t.accent};padding:2px 6px;border-radius:4px;font-size:0.9em;font-family:Menlo,Monaco,Consolas,monospace;">`)
    // 代码块 (只处理最外层 <pre>，跳过内部已添加 style 的)
    .replace(/<pre\b(?![\s>]*style)([^>]*)>/g, `<pre$1 style="background:#2b2b2b;padding:16px;border-radius:8px;overflow-x:auto;margin:16px 0;">`)
    .replace(/<pre\b(?![\s>]*style)[^>]*>\s*<code\b(?![\s>]*style)([^>]*)>/g, `<pre style="background:#2b2b2b;padding:16px;border-radius:8px;overflow-x:auto;margin:16px 0;"><code$1 style="color:#a9b7c6;background:transparent;padding:0;font-size:14px;line-height:1.5;font-family:Menlo,Monaco,Consolas,monospace;">`)
    // 表格
    .replace(/<table\b(?![\s>]*style)([^>]*)>/g, `<table$1 style="border-collapse:collapse;width:100%;margin:16px 0;">`)
    .replace(/<th\b(?![\s>]*style)([^>]*)>/g, `<th$1 style="background:${t.accent};color:#fff;font-weight:600;padding:8px 12px;border:1px solid ${t.border};text-align:left;">`)
    .replace(/<td\b(?![\s>]*style)([^>]*)>/g, `<td$1 style="padding:8px 12px;border:1px solid ${t.border};">`)
    // 链接
    .replace(/<a \b(?![\s>]*style)([^>]*)>/g, `<a $1 style="color:${t.accent};text-decoration:none;">`)
    // 加粗
    .replace(/<strong\b(?![\s>]*style)([^>]*)>/g, `<strong$1 style="color:${t.accent};font-weight:600;">`)
    // 列表
    .replace(/<ul\b(?![\s>]*style)([^>]*)>/g, `<ul$1 style="padding-left:2em;margin:0 0 16px;">`)
    .replace(/<ol\b(?![\s>]*style)([^>]*)>/g, `<ol$1 style="padding-left:2em;margin:0 0 16px;">`)
    .replace(/<li\b(?![\s>]*style)([^>]*)>/g, `<li$1 style="margin-bottom:4px;line-height:1.8;">`)
    // 分割线
    .replace(/<hr\b(?![\s>]*style)([^>]*)\/?>/g, `<hr$1 style="border:none;height:1px;background:linear-gradient(to right,transparent,${t.accent},transparent);margin:24px 0;" />`)
    // 图片
    .replace(/<img \b(?![\s>]*style)([^>]*)>/g, `<img $1 style="max-width:100%;height:auto;border-radius:6px;margin:16px auto;display:block;">`);
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
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
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
 * 渲染元素为 Canvas（内部共用）
 */
async function renderToCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;
  const computedBg = window.getComputedStyle(element).backgroundColor;
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: computedBg || null,
    logging: false,
  });
  return canvas;
}

/**
 * 复制元素截图到剪贴板
 */
export async function copyImageToClipboard(element: HTMLElement): Promise<boolean> {
  const canvas = await renderToCanvas(element);

  try {
    if (isTauri()) {
      // Tauri: writeImage 需要 RGBA 原始像素数据
      const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager');
      const { Image } = await import('@tauri-apps/api/image');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot get canvas context');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rgba = new Uint8Array(imageData.data);
      const img = await Image.new(
        rgba,
        canvas.width,
        canvas.height
      );
      await writeImage(img);
      document.querySelectorAll('.html2canvas-container').forEach(n => n.remove());
      return true;
    }

    // Web: Clipboard API
    const blob: Blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png');
    });
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      return true;
    } catch {
      // 降级：execCommand
      const dataUrl = canvas.toDataURL('image/png');
      const img = document.createElement('img');
      img.src = dataUrl;
      const container = document.createElement('div');
      container.contentEditable = 'true';
      container.appendChild(img);
      document.body.appendChild(container);
      const range = document.createRange();
      range.selectNode(img);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand('copy');
      document.body.removeChild(container);
      return true;
    }
  } catch (e) {
    console.error('[export] copy image failed:', e);
    document.querySelectorAll('.html2canvas-container').forEach(n => n.remove());
    return false;
  }
}

/**
 * 导出为图片文件 (PNG)
 */
export async function exportImage(
  previewElement: HTMLElement,
  fileName: string = 'document.png'
): Promise<void> {
  const canvas = await renderToCanvas(previewElement);
  const dataUrl = canvas.toDataURL('image/png');

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const filePath = await save({
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
      defaultPath: fileName
    });

    if (filePath) {
      const base64Data = dataUrl.split(',')[1];
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      await writeFile(filePath, binaryData);
    }
  } else {
    downloadDataUrl(dataUrl, fileName);
  }

  document.querySelectorAll('.html2canvas-container').forEach(n => n.remove());
}

/**
 * 导出为 PDF
 * 通过隐藏 iframe 加载完整 HTML 并触发打印对话框。
 * Tauri WKWebView 和 Web 浏览器均通过 iframe contentWindow.print() 实现。
 * 若 iframe print 不可用（部分 WKWebView），fallback 到 shell.open 临时文件。
 */
export async function exportPDF(
  content: string,
  theme: string,
  title: string = 'document'
): Promise<void> {
  const fullHTML = generateFullHTML(content, theme, title);

  // 尝试 iframe 打印（Web 环境和部分 Tauri 版本支持）
  let iframePrinted = false;
  const exportId = `pdf-export-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const iframe = document.createElement('iframe');
  iframe.id = exportId;
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

    await new Promise<void>((resolve) => {
      const iframeEl = iframe;
      const state = { cleaned: false, timer: undefined as ReturnType<typeof setTimeout> | undefined };
      const cleanup = () => {
        if (state.cleaned) return;
        state.cleaned = true;
        iframeEl.removeEventListener('load', onLoad);
        if (state.timer) clearTimeout(state.timer);
      };
      const onLoad = () => { cleanup(); resolve(); };
      state.timer = setTimeout(() => { cleanup(); resolve(); }, 3000);
      iframeEl.addEventListener('load', onLoad);
      if (iframeEl.contentDocument?.readyState === 'complete') {
        cleanup();
        resolve();
      }
    });

    try {
      iframe.contentWindow?.focus();
    } catch {
      // ignore
    }
    try {
      iframe.contentWindow?.print();
      iframePrinted = true;
    } catch (e) {
      console.warn('[export] iframe print failed, trying fallback:', e);
    }
  }

  // Tauri fallback: 如果 iframe print 失败，用 shell.open 打开临时 HTML
  if (!iframePrinted && isTauri()) {
    try {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const pathModule = await import('@tauri-apps/api/path');
      const { open } = await import('@tauri-apps/plugin-shell');

      const tempDir = await pathModule.tempDir();
      const sep = pathModule.sep;
      const tempPath = `${tempDir}${sep}mdai-export-${Date.now()}.html`;

      // 注入 CSP + 打印按钮 + 自动打印脚本
      const printHtml = fullHTML
        .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:;">`)
        .replace('</body>', `<div id="print-bar" style="position:fixed;top:0;left:0;right:0;background:#667eea;color:#fff;padding:12px 20px;font-family:sans-serif;z-index:9999;display:flex;align-items:center;gap:16px;"><span>MD.AI 导出 — 点击打印按钮保存为 PDF</span><button onclick="window.print()" style="background:#fff;color:#667eea;border:none;padding:8px 20px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;">打印 / 保存 PDF</button></div><script>window.addEventListener('load',function(){setTimeout(function(){try{window.print()}catch(e){}},1000)})</script></body>`);
      await writeTextFile(tempPath, printHtml);
      await open(tempPath);
    } catch (e) {
      console.error('[export] Tauri PDF fallback failed:', e);
    }
  }

  // 延迟清理 iframe
  setTimeout(() => {
    const existingIframe = document.getElementById(exportId);
    if (existingIframe?.parentNode) document.body.removeChild(existingIframe);
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
  const colors = getThemeColors(theme);
  if (theme === 'github') return '';
  return `
    .markdown-body { color: ${colors.text}; }
    .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: ${colors.accent}; }
    .markdown-body a { color: ${colors.accent}; }
    .markdown-body blockquote { border-left-color: ${colors.accent}; }
  `;
}
