import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/core';
import ts from 'highlight.js/lib/languages/typescript';
import js from 'highlight.js/lib/languages/javascript';
import py from 'highlight.js/lib/languages/python';
import jsonLang from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import mdLang from 'highlight.js/lib/languages/markdown';

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

// 自定义链接渲染（新窗口打开）
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
 * 解析 Markdown 为 HTML
 */
export function parseMarkdown(content: string): string {
  // 保护数学公式块，避免被 marked 处理
  const mathBlocks: string[] = [];
  // 保护 Mermaid 代码块
  const mermaidBlocks: string[] = [];
  // 保护通用代码块，避免行内数学替换污染代码内容
  const codeBlocks: string[] = [];

  let processed = content;

  // 先保护 Mermaid 代码块，避免被后续代码块保护捕获两次
  processed = processed.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    mermaidBlocks.push(`<div class="mermaid-block" data-code="${encodeURIComponent(code.trim())}"></div>`);
    return `%%MERMAID_BLOCK_${mermaidBlocks.length - 1}%%`;
  });

  // 保护所有三引号代码块（包含语言标识）
  processed = processed.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, (m) => {
    codeBlocks.push(m);
    return `%%CODE_BLOCK_${codeBlocks.length - 1}%%`;
  });

  // 保护块级公式 $$...$$（仅在非代码块片段中）
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    mathBlocks.push(`<div class="math-block" data-tex="${encodeURIComponent(tex.trim())}"></div>`);
    return `%%MATH_BLOCK_${mathBlocks.length - 1}%%`;
  });

  // 保护行内公式 $...$（避免匹配 $$ 或单独 $）
  processed = processed.replace(/\$([^\$\n]+?)\$/g, (_, tex) => {
    mathBlocks.push(`<span class="math-inline" data-tex="${encodeURIComponent(tex.trim())}"></span>`);
    return `%%MATH_BLOCK_${mathBlocks.length - 1}%%`;
  });

  // 恢复代码块占位符，使 marked 正确解析代码块
  codeBlocks.forEach((block, i) => {
    processed = processed.replace(`%%CODE_BLOCK_${i}%%`, block);
  });

  // 解析 Markdown
  let html = marked.parse(processed) as string;

  // 还原数学公式占位符
  mathBlocks.forEach((block, i) => {
    html = html.replace(`%%MATH_BLOCK_${i}%%`, block);
    // 处理被 <p> 包裹的情况
    html = html.replace(`<p>%%MATH_BLOCK_${i}%%</p>`, block);
  });

  // 还原 Mermaid 块
  mermaidBlocks.forEach((block, i) => {
    html = html.replace(`%%MERMAID_BLOCK_${i}%%`, block);
    html = html.replace(`<p>%%MERMAID_BLOCK_${i}%%</p>`, block);
  });

  return html;
}

/**
 * 默认 Markdown 内容示例
 */
export const DEFAULT_MARKDOWN = `# MD.AI - Markdown 编辑器

欢迎使用 MD.AI！这是一个支持多平台的 Markdown 编辑器。

## 功能特性

- ✅ 实时预览
- ✅ 多种主题
- ✅ 数学公式
- ✅ Mermaid 图表
- ✅ 代码高亮
- ✅ 图片粘贴

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
| 编辑器 | ✅ 完成 | P0 |
| 预览 | ✅ 完成 | P0 |
| 主题 | ✅ 完成 | P0 |
| 导出 | 🚧 开发中 | P1 |

## 引用

> 代码是写给人看的，顺便能在机器上运行。
> 
> —— Harold Abelson

## 图片

支持直接粘贴图片（Ctrl+V / Cmd+V）

---

**提示**：试试切换右上角的主题！
`;
