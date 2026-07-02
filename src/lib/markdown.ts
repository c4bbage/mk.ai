import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/core';
import ts from 'highlight.js/lib/languages/typescript';
import js from 'highlight.js/lib/languages/javascript';
import py from 'highlight.js/lib/languages/python';
import jsonLang from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import mdLang from 'highlight.js/lib/languages/markdown';
import { protectSpecialBlocks, restoreSpecialBlocks } from './placeholders';

hljs.registerLanguage('typescript', ts);
hljs.registerLanguage('javascript', js);
hljs.registerLanguage('python', py);
hljs.registerLanguage('json', jsonLang);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('markdown', mdLang);

// 配置代码高亮
marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    // 超大代码块（>500 行）跳过高亮，避免阻塞
    const lines = code.split('\n').length;
    if (lines > 500) return code;
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch {
        // 忽略高亮错误
      }
    }
    return code;
  }
}));

// 自定义渲染器
const renderer = new marked.Renderer();

// 自定义图片渲染
renderer.image = ({ href, title, text }) => {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<img src="${href}" alt="${text || ''}"${titleAttr} loading="lazy" decoding="async" class="md-image" />`;
};

// 从文本生成 URL-safe slug
function slugify(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\s-]/g, '')
    .replace(/\s+/g, '-');
}

// heading id 计数器 — 用于处理重复标题
const headingIdCounters = new Map<string, number>();

function getHeadingId(text: string): string {
  const base = slugify(text) || 'heading';
  const count = headingIdCounters.get(base) || 0;
  headingIdCounters.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

// 重置 heading id 计数器（每次 parseMarkdown 调用前重置）
function resetHeadingIds(): void {
  headingIdCounters.clear();
}

// 自定义标题渲染 — 添加 id 用于 TOC 锚点跳转
renderer.heading = ({ text, depth }) => {
  const id = getHeadingId(text);
  return `<h${depth} id="${id}">${text}</h${depth}>`;
};
renderer.link = ({ href, title, text }) => {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

// 配置 marked
marked.setOptions({
  renderer,
  gfm: true,
  breaks: true,
});

/**
 * 生成目录 HTML
 */
function generateTOC(content: string): string {
  const blocks = parseMarkdownToBlocks(content);
  const items: string[] = [];

  for (const block of blocks) {
    if (block.type === 'heading') {
      const match = block.content.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const anchor = getHeadingId(text);
        items.push(`<li class="toc-item toc-level-${level}" style="margin-left:${(level - 1) * 16}px"><a href="#${anchor}">${text}</a></li>`);
      }
    }
  }

  return items.length === 0 ? '' : `<ul class="toc">${items.join('')}</ul>`;
}

// 预解析用于 TOC
import { parseMarkdownToBlocks } from './markdown-blocks';

/**
 * 解析 Markdown 为 HTML
 */
export function parseMarkdown(content: string): string {
  resetHeadingIds();
  const { processed, mathBlocks, mermaidBlocks } = protectSpecialBlocks(content);

  // 生成并替换 [TOC] — 先重置计数器，确保 TOC 和 heading renderer 使用一致的 id
  const tocHtml = generateTOC(content);
  const processedWithTOC = processed.replace(/^\[TOC\]$/gm, tocHtml || '<p class="toc-empty">暂无标题</p>');

  // 重置计数器，使 heading renderer 从 0 开始，与 TOC 生成的 id 一致
  resetHeadingIds();

  // 解析 Markdown
  let html = marked.parse(processedWithTOC) as string;

  // 还原数学公式和 Mermaid 占位符
  html = restoreSpecialBlocks(html, mathBlocks, mermaidBlocks);

  return html;
}

/**
 * 默认 Markdown 内容示例
 */
export const DEFAULT_MARKDOWN = `# MD.AI - Markdown 编辑器

欢迎使用 MD.AI！这是一个支持多平台的 Markdown 编辑器。

## 功能特性

- 实时预览（编辑+预览 同步滚动）
- 多种主题 + 明暗模式切换
- 数学公式（KaTeX）
- Mermaid 图表
- 代码高亮
- 图片粘贴 / 拖拽
- 导出 HTML / PDF / 图片
- 微信公众号格式复制
- Web Worker 增量渲染
- 自动保存 + 崩溃恢复
- 文件树
- Vim 模式

## 代码示例

\`\`\`typescript
function hello(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(hello('World'));
\`\`\`

## 数学公式

行内公式：$E = mc^2$

块级公式：

$$
\\sum_{i=1}^{n} x_i = x_1 + x_2 + \\cdots + x_n
$$

## Mermaid 流程图

\`\`\`mermaid
graph TD
    A[开始] --> B{是否登录?}
    B -->|是| C[进入主页]
    B -->|否| D[跳转登录]
    D --> E[输入账号密码]
    E --> B
    C --> F[结束]
\`\`\`

## 表格

| 功能 | 状态 | 优先级 |
|------|------|--------|
| 编辑器 | 完成 | P0 |
| 预览 | 完成 | P0 |
| 主题 | 完成 | P0 |
| 导出 | 完成 | P1 |

## 引用

> 代码是写给人看的，顺便能在机器上运行。
>
> —— Harold Abelson

## 快捷键

- \`Cmd+/\` 切换编辑/预览
- \`Cmd+Shift+D\` 切换明暗模式
- \`Cmd+Shift+C\` 复制公众号格式
- \`Cmd+Shift+V\` 切换 Vim 模式

---

**提示**：试试 \`Cmd+/\` 切换到预览模式！
`;
