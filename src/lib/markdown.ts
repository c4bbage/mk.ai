import { marked, type Token, type Tokens } from 'marked';
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
// 从文本生成 URL-safe slug
function slugify(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\s-]/g, '')
    .replace(/\s+/g, '-');
}

// heading id 计数器 — 每次解析创建独立实例，避免并发调用互相污染
class HeadingIdGen {
  private counters = new Map<string, number>();

  next(text: string): string {
    const base = slugify(text) || 'heading';
    const count = this.counters.get(base) || 0;
    this.counters.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }
}

/**
 * 创建带独立 heading-id 计数器的 renderer 实例。
 * 每次调用 marked.parse 时传入，保证并发安全。
 */
function createRenderer(idGen: HeadingIdGen) {
  const r = new marked.Renderer();
  r.image = ({ href, title, text }) => {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<img src="${href}" alt="${text || ''}"${titleAttr} loading="lazy" decoding="async" class="md-image" />`;
  };
  r.heading = ({ text, depth, tokens }) => {
    const id = idGen.next(text);
    // 用 parseInline 渲染行内格式（*italic*、**bold**、`code`、[link] 等）
    // 再包裹 <span class="content"> 兼容 mdnice 主题
    const inlineHtml = tokens ? r.parser.parseInline(tokens) : text;
    return `<h${depth} id="${id}"><span class="content">${inlineHtml}</span></h${depth}>`;
  };
  r.blockquote = function ({ tokens }: { tokens: Token[] }) {
    return `<blockquote class="multiquote-1">\n${this.parser.parse(tokens)}</blockquote>\n`;
  };
  r.listitem = function (item: Tokens.ListItem) {
    // GFM Task List: render checkbox for [ ] and [x]
    if (item.task) {
      const checked = item.checked ? 'checked' : '';
      const inner = this.parser.parse(item.tokens);
      return `<li class="task-list-item"><section><input type="checkbox" ${checked} disabled />${inner}</section></li>\n`;
    }
    return `<li><section>${this.parser.parse(item.tokens)}</section></li>\n`;
  };
  r.link = ({ href, title, text }) => {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };
  return r;
}

// 配置 marked 全局选项（renderer 按每次调用传入，不在此设置）
marked.setOptions({
  gfm: true,
  breaks: true,
});

// 向后兼容：保留 resetHeadingIds（已无内部调用方，但 export 不破坏外部引用）
const globalIdGen = new HeadingIdGen();
export function resetHeadingIds(): void {
  globalIdGen['counters'].clear();
}

/**
 * 生成目录 HTML
 * 使用与 parseMarkdown 相同的 idGen 实例，确保 TOC 锚点和 heading id 一致。
 */
function generateTOC(content: string, idGen: HeadingIdGen): string {
  const blocks = parseMarkdownToBlocks(content);
  const items: string[] = [];

  for (const block of blocks) {
    if (block.type === 'heading') {
      const match = block.content.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const anchor = idGen.next(text);
        items.push(`<li class="toc-item toc-level-${level}" style="margin-left:${(level - 1) * 16}px"><a href="#${anchor}">${text}</a></li>`);
      }
    }
  }

  return items.length === 0 ? '' : `<ul class="toc">${items.join('')}</ul>`;
}

// 预解析用于 TOC
import { parseMarkdownToBlocks } from './markdown-blocks';

/**
 * Strip YAML frontmatter (--- ... ---) from the start of a markdown document.
 */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

/**
 * 解析单个 Markdown 块为 HTML（不做 TOC）。
 * Worker 和主线程共用此函数，确保 renderer 配置一致。
 * 每次调用创建独立的 HeadingIdGen 实例，并发安全。
 */
export function parseMarkdownBlock(content: string): string {
  const stripped = stripFrontmatter(content);
  const { processed, mathBlocks, mermaidBlocks } = protectSpecialBlocks(stripped);
  const idGen = new HeadingIdGen();
  const renderer = createRenderer(idGen);
  let html = marked.parse(processed, { renderer }) as string;
  html = restoreSpecialBlocks(html, mathBlocks, mermaidBlocks);
  return html;
}

/**
 * 解析 Markdown 为 HTML
 */
export function parseMarkdown(content: string): string {
  const stripped = stripFrontmatter(content);
  const { processed, mathBlocks, mermaidBlocks } = protectSpecialBlocks(stripped);

  // TOC 锚点和 heading renderer 的 id 必须一致。
  // 用两个独立的 HeadingIdGen 实例：idGenForToc 生成 TOC 锚点 href，
  // idGenForHeadings 生成 <hN id="...">。两者处理相同的 heading 文本、
  // 都从空计数器开始，因此产生完全相同的 id 序列——互不干扰，并发安全。
  const idGenForToc = new HeadingIdGen();
  const tocHtml = generateTOC(stripped, idGenForToc);
  const processedWithTOC = processed.replace(/^\[TOC\]$/gm, tocHtml || '<p class="toc-empty">暂无标题</p>');

  const idGenForHeadings = new HeadingIdGen();
  const renderer = createRenderer(idGenForHeadings);
  let html = marked.parse(processedWithTOC, { renderer }) as string;

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
