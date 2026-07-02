# MD.AI 性能优化方案（针对编辑/预览共存与启动卡顿）

目标
- 在编辑器与预览共存时保持流畅，媲美 Typora 的体验
- 降低应用启动时间与首屏可交互延迟
- 大幅提升 Markdown、数学公式（KaTeX）、Mermaid 图表的渲染效率

范围与重点文件
- src/components/Editor/Editor.tsx
- src/components/Preview/Preview.tsx
- src/components/Preview/VirtualPreview.tsx
- src/lib/markdown.ts
- src/workers/markdown.worker.ts
- src/App.tsx

现状与问题分析
1) 编辑器与预览同步机制
- 现状：Editor 使用 EditorView.updateListener 在每次 docChanged 时立即 setContent；Preview 使用 debouncedContent 防抖后统一 parse 与渲染。
- 问题：
  - setContent 每次输入都触发 React 状态更新，Preview 仍会周期性进行整页渲染（尽管防抖），大文档时仍显卡顿。
  - 滚动同步使用滚动比例，双向同步虽有 50ms 锁，但未节流，持续触发 reflow 与 layout，容易造成抖动和卡顿。
  - 编辑器字体大小变化会重建 EditorView（useEffect 依赖 fontSize），开销较大。

2) Markdown 渲染性能（src/lib/markdown.ts）
- 现状：基于 marked + highlight.js 同步高亮；渲染前将 KaTeX/Mermaid 替换为占位符，渲染后再还原；Preview 再对整页执行 renderMathInElement 和 renderMermaidInElement。
- 问题：
  - 每次内容变化都对全文进行 marked.parse 与 highlight，若代码块较多或语言复杂，高亮开销大。
  - KaTeX、Mermaid 对整页重新扫描与渲染，不做缓存；Mermaid 渲染串行执行，单次渲染阻塞时间长。
  - 未利用 Web Worker 在常规预览模式下并行解析（目前 Worker 仅用于块级解析 VirtualPreview 的内容）。

3) 数学公式与 Mermaid 图渲染
- 现状：每次预览更新后对整页容器进行公式与图的渲染；Mermaid 在首次使用时初始化；未做结果缓存。
- 问题：
  - KaTeX renderToString 性能虽好，但反复对同一公式渲染会浪费；Mermaid.svg 生成耗时更久，串行处理显卡顿。
  - 未按需加载（lazy load）KaTeX/Mermaid 模块与样式，增加启动体积与首屏负载。

4) 组件重渲染问题
- 现状：Preview 使用 dangerouslySetInnerHTML 全量更新；VirtualPreview 基于 blocks 做懒渲染，但 KaTeX/Mermaid 仍逐块无缓存执行。
- 问题：
  - 常规 Preview 下每次更新全量 HTML，随后对整页再做公式与图表渲染，浪费大量重复计算。
  - 未利用块级 diff（src/lib/block-diff.ts）对预览进行增量更新（仅当前变更块）。

5) 初始化加载与首屏性能
- 现状：预览组件按需选择常规/虚拟；KaTeX 与 highlight 样式在入口即加载；Mermaid 初始化在首次渲染时执行。
- 问题：
  - 首屏加载引入多余资源（KaTeX、highlight 样式）与多扩展，增加静态资源体积与 CSS 解析开销。
  - Editor 初始化包含较多扩展（搜索面板、selection matches 高亮等），可以延迟加载。

总体瓶颈总结
- 全量渲染与全量扫描导致重复工作：marked、highlight、KaTeX、Mermaid 都会在内容稍变时重跑。
- 滚动与输入未充分节制：onChange 与 scroll 事件触发频繁。
- 初始化时资源与扩展加载过多：可按需与延迟加载。

优化方案（代码级别）
A. React 层输入与渲染优化
1) 将预览更新标记为并发过渡，降低打字阻塞
- 在 App.tsx 中，使用 React 18 的 startTransition 包裹 setContent：

  // App.tsx
  import { startTransition } from 'react';
  ...
  <Editor
    onChange={(val) => {
      // 优先保证编辑器交互流畅，预览更新为过渡
      startTransition(() => setContent(val));
    }}
    ...
  />

- 在 Preview.tsx 中使用 useDeferredValue 降低渲染压力：

  // Preview.tsx
  const deferredContent = useDeferredValue(content);
  useEffect(() => { /* 对 deferredContent 防抖并解析 */ }, [deferredContent]);

2) 事件节流与稳定引用
- 对滚动同步进行节流（16~33ms），并区分事件来源防止震荡：

  // App.tsx
  import { throttle } from '../lib/performance';
  const handleEditorScroll = useCallback(
    throttle((scrollTop, scrollHeight, clientHeight) => {
      if (syncLockRef.current || !previewScrollRef.current) return;
      syncLockRef.current = true;
      const ratio = scrollTop / Math.max(1, (scrollHeight - clientHeight));
      const el = previewScrollRef.current.getScrollContainer();
      if (el) {
        previewScrollRef.current.scrollTo(
          ratio * (el.scrollHeight - el.clientHeight)
        );
      }
      setTimeout(() => (syncLockRef.current = false), 16);
    }, 16),
  []);

  // 预览 -> 编辑器同理节流

- 将 Toolbar 等回调用 useCallback 固定，避免不必要子组件渲染（已有一定使用，保持一致）。

3) Editor 动态配置使用 Compartment，避免重建 EditorView
- CodeMirror 6 提供 Compartment 用于动态替换扩展。将 fontSize 与主题样式放入 Compartment：

  // Editor.tsx（示例片段）
  import { Compartment } from '@codemirror/state';
  const themeCompartment = useRef(new Compartment()).current;
  const baseExtensions = [
    lineNumbers(),
    highlightActiveLine(),
    // 其他静态扩展...
    themeCompartment.of(EditorView.theme({ /* 初始样式 */ })),
  ];
  // 初始化后，在 fontSize 变化时仅 reconfigure：
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.dispatch({
        effects: themeCompartment.reconfigure(
          EditorView.theme({ '&': { fontSize: `${fontSize}px` }, /* ... */ })
        )
      });
    }
  }, [fontSize]);

- 将搜索面板与 highlightSelectionMatches 延迟加载（用户触发时才添加扩展）。

B. Markdown 解析与代码高亮优化
1) 在常规 Preview 中也使用 Web Worker 进行解析（HTML 级）
- 新增 worker：src/workers/markdown-html.worker.ts，用于执行 marked.parse（不涉及 DOM）：

  // src/workers/markdown-html.worker.ts（示意）
  import { marked } from 'marked';
  import { markedHighlight } from 'marked-highlight';
  import hljs from 'highlight.js/lib/core';
  // 按需注册语言（或运行时按需注册）
  self.onmessage = (e) => {
    const { id, content } = e.data;
    const start = performance.now();
    const html = marked.parse(content);
    self.postMessage({ id, html, parseTime: performance.now() - start });
  };

- 在 Preview.tsx 中加入 useMarkdownHtmlWorker Hook（类似 useMarkdownWorker），在内容>阈值或 CPU 忙时 offload 到 Worker；在主线程使用 requestIdleCallback 执行小文档解析。

2) Highlight.js 按需语言与大块降级策略
- 将 import hljs from 'highlight.js' 改为 import hljs from 'highlight.js/lib/core'，并仅注册常见语言（如 ts, js, python, json, bash, md）。对于语言不识别的情况不高亮，避免 auto-detect 大量遍历：

  // src/lib/markdown.ts
  import hljs from 'highlight.js/lib/core';
  import ts from 'highlight.js/lib/languages/typescript';
  import js from 'highlight.js/lib/languages/javascript';
  import py from 'highlight.js/lib/languages/python';
  hljs.registerLanguage('typescript', ts);
  hljs.registerLanguage('javascript', js);
  hljs.registerLanguage('python', py);
  // ...按需注册

- 对超大代码块（>N 行）直接跳过高亮或延迟高亮（先渲染为普通 code，空闲时再替换）。

3) 预解析占位符更高效的匹配与边界修正
- 维持现有 $$ 与 ```mermaid 块保护；增加对边缘 <p> 包裹的稳健处理（已做）。进一步避免多次 replace：使用单次扫描构建 token 列表，提升 parse 前预处理效率（可在 Worker 中实现）。

C. KaTeX 与 Mermaid 渲染优化
1) 按需加载与缓存
- 使用 src/lib/performance.ts 中的 lazyLoadKaTeX 与 lazyLoadMermaid，在 Preview 与 VirtualPreview 中判断是否存在数学或 mermaid 内容后再加载模块与样式：

  // Preview.tsx
  import { lazyLoadKaTeX, lazyLoadMermaid } from '../../lib/performance';
  const hasMath = /\$|\$\$/m.test(debouncedContent);
  const hasMermaid = /```mermaid/m.test(debouncedContent);
  useEffect(() => {
    if (hasMath) lazyLoadKaTeX().then(({ renderMathInElement }) => renderMathInElement(containerRef.current!));
    if (hasMermaid) lazyLoadMermaid().then(({ renderMermaidInElement }) => renderMermaidInElement(containerRef.current!));
  }, [html]);

- 为 KaTeX 与 Mermaid 引入结果缓存（LRU），避免重复渲染：

  // src/lib/math.ts
  const katexCache = new Map<string, string>();
  export function renderMathInElement(container: HTMLElement) {
    container.querySelectorAll('.math-block, .math-inline').forEach((el) => {
      const tex = decodeURIComponent(el.getAttribute('data-tex') || '');
      if (!tex) return;
      if (katexCache.has(tex)) { el.innerHTML = katexCache.get(tex)!; return; }
      const html = katex.renderToString(tex, { displayMode: el.classList.contains('math-block'), throwOnError: false });
      katexCache.set(tex, html);
      el.innerHTML = html;
    });
  }

  // src/lib/mermaid.ts
  const mermaidCache = new Map<string, string>();
  export async function renderMermaidInElement(container: HTMLElement) {
    // ...
    const code = decodeURIComponent(el.getAttribute('data-code') || '');
    if (mermaidCache.has(code)) { el.innerHTML = mermaidCache.get(code)!; markRendered(el); continue; }
    const { svg } = await mermaid.render(id, code);
    mermaidCache.set(code, svg);
    el.innerHTML = svg;
  }

2) 渲染队列与并发限制
- 对 Mermaid 执行并发限制（如一次渲染 1~2 个），其余进入队列并使用 requestIdleCallback 或 setTimeout 分批执行，降低主线程长任务：

  // src/lib/mermaid.ts（示意）
  const queue: HTMLElement[] = [];
  let active = 0;
  async function processNext() {
    if (active >= 2 || queue.length === 0) return;
    active++;
    const el = queue.shift()!;
    // 渲染并在 finally 中 active-- 后调度下一个
  }
  export async function renderMermaidInElement(container: HTMLElement) {
    container.querySelectorAll('.mermaid-block:not(.mermaid-rendered)').forEach(el => { queue.push(el as HTMLElement); });
    processNext();
  }

D. 预览增量更新与虚拟滚动策略
1) 在常规 Preview 中引入块级 diff，避免全量 dangerouslySetInnerHTML
- 流程：
  - 使用 parseMarkdownToBlocks(content) 获取块列表（主线程或 Worker）。
  - 将每个块分别转换为 HTML（使用 parseMarkdown(block.content)）。
  - 使用 src/lib/block-diff.ts 的 diffBlocks 对比旧/新块，按变化类型（add/remove/update/move）对 DOM 局部更新（保留已渲染的 KaTeX/Mermaid 块）。
- 这样在打字时通常只影响当前段落，极大降低重排与重绘。

2) 降低虚拟滚动触发阈值与优化 BlockRenderer
- 将 App.tsx 中 content.length > 50000 的阈值下调到 15000~20000，更早启用 VirtualPreview。
- BlockRenderer 中 KaTeX/Mermaid 渲染也使用缓存与队列，减少 IOU 阶段卡顿。
- IntersectionObserver rootMargin 可根据滚动速度动态调整（慢速更小，快速更大），可在性能设置中暴露参数。

E. 启动与首屏优化
1) 按需加载样式与模块
- 将 katex.min.css 与 highlight.css 的引入改为条件加载（例如在首次检测到数学或代码块时通过动态 import('./katex.min.css')）。Vite 支持 CSS 动态导入。
- Mermaid 与 KaTeX JS 模块通过 lazyLoadMermaid/KaTeX 按需加载。

2) 延迟加载编辑器辅扩展
- 搜索面板（searchKeymap、search()）、highlightSelectionMatches 等在用户触发搜索时再配置到 Editor（通过 Compartment）。

3) Worker 预热与资源预取
- 应用空闲时预热 Worker（创建但不解析），并使用 link rel=prefetch 预取 mermaid/katex 资源。

实施优先级（建议路线图）
P0（立即见效，风险低）
- 滚动同步节流：为 handleEditorScroll/handlePreviewScroll 引入 throttle(16ms)。
- 将 setContent 包裹在 startTransition，Preview 使用 useDeferredValue。
- 在 Editor 使用 Compartment 管理主题/字体，避免重建 EditorView。
- Mermaid/KaTeX 结果缓存（LRU Map），减少重复渲染。

P1（中期优化）
- 常规 Preview 引入按需加载 KaTeX/Mermaid 与样式，减少首屏体积。
- Highlight.js 改为核心 + 按需语言注册，加入大代码块降级策略。
- 将 VirtualPreview 的阈值降低到 15~20KB，并优化 BlockRenderer 并发与缓存。

P2（进阶与架构优化）
- 新增 markdown-html.worker.ts，常规预览在较大文档或 CPU 繁忙时将 marked.parse 与高亮 offload 到 Worker。
- 常规 Preview 引入块级 diff 增量更新 DOM，减少 dangerouslySetInnerHTML 频率。
- 实现滚动同步的基于块/标题映射（通过块高度与标题位置表），提高精准同步体验。

预期效果（与 Typora 对标）
- 输入时延：
  - 现状：大文档下输入明显卡顿（>32ms 帧时）。
  - 目标：在 50KB 文档下，输入平均帧时 < 16ms；100KB 文档下 < 24ms（依赖虚拟预览与 Worker）。
- 预览更新：
  - 通过 startTransition + useDeferredValue，预览更新不阻塞输入；增量更新/虚拟渲染减少大面积重绘。
- 滚动同步：
  - 节流后抖动下降，锁定时间缩短至 ~16ms；引入块映射后同步更精准。
- 启动时间：
  - 按需加载样式与模块，减少首屏资源 100~300KB；Worker 预热与资源预取降低首次渲染延迟。

代码调整清单（按文件）
- src/App.tsx
  - 使用 startTransition 包裹 setContent。
  - 引入 throttle 对 handleEditorScroll/handlePreviewScroll 节流。
  - 可选：useDeferredValue 在传递给 Preview 之前对 content 延迟。

- src/components/Editor/Editor.tsx
  - 使用 Compartment 管理主题/字体样式，避免重建 EditorView。
  - 搜索面板与 selection matches 延迟加载（用户触发时再配置）。
  - onScroll 监听仅在 showPreview 时启用，并节流。

- src/components/Preview/Preview.tsx
  - 对内容使用 useDeferredValue + 防抖。
  - 按需 lazyLoad KaTeX/Mermaid，并为渲染结果引入 LRU 缓存。
  - 引入 markdown-html.worker.ts（P2）在较大文档或 CPU 忙时 offload 解析。
  - 可选：引入块级 diff，减少 dangerouslySetInnerHTML 的全量更新。

- src/components/Preview/VirtualPreview.tsx
  - 降低触发阈值至 15~20KB。
  - 为 Mermaid 渲染引入并发队列与缓存；KaTeX 使用缓存。
  - IntersectionObserver 参数根据滚速自适应（可选）。

- src/lib/markdown.ts
  - 改用 highlight.js/lib/core 与按需语言注册。
  - 对超大代码块加入降级策略（跳过或延迟高亮）。
  - 预处理阶段改为单次扫描（在 Worker 中实现，P2）。

- src/workers/markdown.worker.ts
  - 保持块级解析（给 VirtualPreview 使用）。未来新增 markdown-html.worker.ts 承担 HTML 解析与高亮。

风险与回滚
- startTransition 与 useDeferredValue 需要 React 18 环境；若出现兼容问题，可退回仅防抖与节流方案。
- 按需加载样式可能导致首轮渲染闪烁（FOUC）；需在检测到相关内容后尽快加载，或预加载少量基础样式。
- Worker 方案需注意跨上下文依赖（marked、hljs 体积与打包策略）；可先在 DEV 环境试行，再在生产开启。

验证与度量
- 在开发模式下显示 parseTime 与块数量（VirtualPreview 已有），同时加入：
  - 输入延迟（记录 updateListener 到 DOM 更新的耗时）。
  - Mermaid 渲染队列平均耗时与队列长度。
  - 首屏可交互时间（从加载到 Editor 可输入）。

结论
- 通过并发过渡、节流与 Compartment，短期即可显著改善编辑/预览共存的流畅度。
- 中期通过按需加载与虚拟滚动阈值调整，进一步降低资源与渲染压力。
- 进阶通过 Worker 与增量 DOM 更新接近 Typora 的流畅体验，适配超大 Markdown 文档场景。