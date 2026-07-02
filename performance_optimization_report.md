# MD.AI 性能深度分析与优化建议（Phase 1）

作者：Claude（架构分析）
日期：2026-01-22
目标：明确导致“编辑-预览共存卡顿、启动慢”问题的根因，输出可实施的优化方案与度量计划，支撑后续 Phase 2/3 的代码落地与验证。验收对齐：输入延迟 < 50ms、预览滚动 >= 60fps、启动 < 2s、内存 < 200MB。

----------------------------------------
一、总体结论（TL;DR）
----------------------------------------
- 卡顿主要源于三条路径：
  1) 主线程上“整文解析 + 整文预览”造成的重型同步开销（marked + highlight.js + Mermaid/KaTeX）。
  2) React 层级的高频状态更新与整树 re-render（content 每次输入立刻 setContent）。
  3) 虚拟化策略不足：VirtualPreview 仅做“懒渲染”，未真正“窗口化”；大文档下仍保留大量 DOM 节点，滚动与布局抖动。
- 启动卡顿源于：KaTeX 与 highlight 样式/字体、Mermaid 库的静态导入，使首屏体积与初始化成本过大。
- 现有 Worker 仅用于“按行切块（parseMarkdownToBlocks）”，未将重型解析与渲染（HTML/KaTeX/Highlight）真正搬至后台；Preview/BlockRenderer 继续在主线程同步执行。

强烈建议的优化路线：
- 输入→预览链路：引入自适应防抖（150–300ms，尾随触发为主），并用 React.startTransition/DeferredValue 降级预览的更新优先级。
- 解析→渲染：将 Markdown→HTML、代码高亮与 KaTeX 字符串渲染迁移至 Web Worker；Mermaid 保留主线程但严格按需与可视区执行。
- 预览展示：采用“真正虚拟化”（窗口化）替换当前懒渲染；使用 VariableSize + 高度缓存 + ResizeObserver，控制 DOM 节点上限与滚动稳定性。
- 启动优化：动态导入 Mermaid/KaTeX/highlight（core + 常用语言），并在预览确需时加载对应 chunk；首屏不加载重型库与字体。
- 全链路打点：以 Performance.mark/measure 与 rAF 采样搭建性能面板，量化每次输入端到端延迟、解析耗时、预览 commit 时长与滚动 FPS。

----------------------------------------
二、关键文件与瓶颈定位（基于源码逐行审查）
----------------------------------------
1) src/components/Editor/Editor.tsx
- 现状：
  - 每次编辑（update.docChanged）立即调用 onChange → setContent（Zustand），父组件（App）与依赖 content 的子树重渲染。
  - 滚动事件未节流/未使用 rAF，编辑器滚动与预览滚动互相驱动，存在“锁 + setTimeout(50)”的解锁策略，易触发抖动与布局震荡。
- 风险：
  - 高频 setContent 导致 React 重渲染频繁；在 Tauri 环境中，主线程竞争加剧，输入感知可能变差。
- 建议：
  - 在 updateListener 中对“预览解析触发”做 trailing 防抖（150–300ms，文档越大延迟越长），而不是对原始 content 状态本身做防抖（保持编辑器回显即时）。
  - 将触发预览刷新加入 React.startTransition，降低优先级。
  - 滚动同步：改为 rAF + throttle（每 16–32ms），并用可视区锚点映射（行号→块 id）替代“整容器比例映射”。

2) src/components/Preview/Preview.tsx
- 现状：
  - 对 content 做 useEffect 防抖，但 parseMarkdown 同步在主线程执行。
  - 危险点：静态导入 'katex/dist/katex.min.css' 与 'highlight.js/styles/github.css'；lib/mermaid.ts 顶层 import mermaid。
  - 每次 HTML 刷新后都会遍历 DOM 渲染 KaTeX 与 Mermaid，且 Mermaid 渲染开销大（主线程）。
- 风险：
  - 大文档下，整文 HTML diff + KaTeX/Mermaid 全量重渲染，造成主线程长时间阻塞、帧率下降。
- 建议：
  - 将 parseMarkdown（含 highlight）迁移至 Worker；Preview 接收 HTML 字符串后仅做“轻量 commit”。
  - KaTeX：在 Worker 内使用 katex.renderToString 生成 HTML 字符串（安全、无 DOM），主线程只插入结果。
  - Mermaid：保留主线程渲染，但严格“按需 + 可视区 + 空闲时”（IntersectionObserver + requestIdleCallback）。
  - 样式/字体：KaTeX 与 highlight 样式改为按需动态注入（检测到首个公式/代码块再加载）。

3) src/components/Preview/VirtualPreview.tsx
- 现状：
  - 使用 useMarkdownWorker 仅切块（blocks），但 BlockRenderer 内仍在主线程 parseMarkdown(block.content)。
  - 组件采用“懒渲染”（IntersectionObserver），不是“窗口化虚拟列表”；所有块 DOM 容器始终存在。
- 风险：
  - 大文档下，DOM 节点数巨大（数千级），滚动与布局压力大，60fps 难以保证。
  - 主线程仍承担 parseMarkdown 与 KaTeX/Mermaid 的重活，虚拟化收益有限。
- 建议：
  - 采用真正虚拟列表（react-virtual 或自研窗口化）；只保留可视区 ± overscan（建议 2–3 倍视口）。
  - BlockRenderer 不再调用 parseMarkdown（主线程），改为消费来自 Worker 的“块级 HTML”。
  - 高度管理：初始估算 + ResizeObserver 回填真实高度 + LRU 缓存，避免频繁 reflow。

4) src/lib/markdown.ts
- 现状：
  - 使用 marked + marked-highlight（hljs）同步解析；
  - 通过占位符保护 $$ 与 ```mermaid```，再在主线程进行渲染。
- 风险：
  - highlight.js 全量打入包体；同步高亮对大型代码块代价高。
  - Mermaid/KaTeX 主线程渲染易阻塞。
- 建议：
  - Worker 内：按块解析、代码高亮与 KaTeX 字符串渲染；Mermaid 仅生成“待渲染占位”与必要元信息（hash、id）。
  - highlight：采用 highlight.js/lib/core + 动态注册常用语言；仅在检测到代码块时按需加载语言包。
  - 安全：引入 DOMPurify（或同等）对最终 HTML 做消毒（Mermaid/HTML 注入风险）。

5) src/workers/markdown.worker.ts 与 src/hooks/useMarkdownWorker.ts
- 现状：
  - markdown.worker.ts：支持 parseMarkdownToBlocks；未被主 UI 使用（VirtualPreview 使用的是内联 Worker）。
  - useMarkdownWorker.ts：内联 Worker，仅做按行切块；HTML 渲染未迁移。
- 风险：
  - Worker 没有承担重型解析与渲染的职责；主线程压力不减。
- 建议：
  - 统一 Worker 通道：基于模块 Worker（Vite 支持），暴露 parseBlocks(changes, version) 与 parseFull(content)。
  - 在 Worker 内动态 import marked/highlight/katex；维护 LRU 缓存（block hash → HTML），支持取消/过期响应。
  - 返回值包含 metrics（parseTime、blockCount），便于性能面板展示。

6) src/App.tsx（滚动同步与首屏加载）
- 现状：
  - 编辑与预览滚动同步采取比例映射 + setTimeout 解锁；
  - showPreview 默认 true：导致 Preview 与其依赖（katex/highlight/mermaid）很可能在首屏就进入依赖图。
- 风险：
  - 滚动同步易抖动；首屏引入重型依赖导致 TTI 拉长。
- 建议：
  - 滚动同步：rAF + throttle，基于锚点（块/行号）同步而非比例，降低误差与抖动。
  - 首屏：预览面板懒加载（当用户切换到预览或检测到 content 非空且达到一定长度再初始化预览/Worker）。

7) 启动与打包（vite.config.ts、package.json）
- 现状：
  - vite 配置为默认；未设置 manualChunks；
  - Preview/VirtualPreview 静态导入重型库与样式。
- 建议：
  - manualChunks：拆分 katex/mermaid/highlight/markdown 工具为独立 vendor chunk；
  - 仅在需要时动态 import（import()）这些 chunk；
  - 字体/样式按需注入，KaTeX 字体使用 woff2 并考虑 unicode-range 子集。

----------------------------------------
三、性能渲染路径（Performance API 思维）
----------------------------------------
输入 → 解析 → 渲染 → 特殊元素 → 滚动
- 当前路径：
  - 输入（CM6）→ onChange（立即 setContent）→ Preview 防抖 → 同步 parseMarkdown（主线程）→ dangerouslySetInnerHTML → 遍历 DOM（KaTeX/Mermaid）→ 滚动事件（编辑/预览互相驱动）。
- 目标路径：
  - 输入（CM6）→ 防抖调度（低优先级）→ Worker（parse + highlight + KaTeX-renderToString + LRU 缓存）→ 主线程仅 commit HTML → Mermaid：可视区 + 空闲渲染（缓存）→ 滚动同步：rAF + 锚点 → 仅窗口化的块渲染。

----------------------------------------
四、与 Typora 的策略对比
----------------------------------------
- Typora 的核心是“块级模型 + 增量渲染 + 强缓存 + 可视区优先”的原理；
- 本项目可在 Web 技术栈下复刻：Worker 隔离重型计算、块粒度的差异渲染、窗口化虚拟列表、按需加载重型库与字体。

----------------------------------------
五、Phase 2 实施建议（映射到具体改造点）
----------------------------------------
1) 防抖节流（编辑器输入 → 预览更新）
- Editor.tsx：updateListener 内仅记录“需要刷新预览”，不直接 setContent；通过调度器（useDeferredValue + debounce）通知预览层。
- App.tsx：对 content 向预览传递使用 useDeferredValue；滚动同步用 rAF + throttle。

2) 增量渲染（只重渲染变更块）
- 引入 block-diff.ts 的 diffBlocks/shouldFullRerender；维护旧块列表与新块列表差异，统一交由 Worker 产出“块级 HTML patch”。
- Preview/VirtualPreview 接收 patch，仅更新受影响的块（React.memo + 稳定 key）。

3) 虚拟滚动优化（替换懒渲染为窗口化虚拟列表）
- 引入 react-virtual 或自研 VariableSizeList。
- 高度估算 + ResizeObserver 回填真实高度 + LRU 高度缓存。
- overscan 控制在 2–3 倍视口，保障滚动与渲染平衡。

4) Web Worker（Markdown/高亮/KaTeX）
- 统一使用 src/workers/markdown.worker.ts（模块 Worker）。
- Worker 动态 import marked/highlight/katex；维护 LRU（blockHash → renderedHTML）。
- 支持 parseFull(content) 与 parseBlocks(changedRanges)；返回 metrics（parseTime、blockCount）。

5) React 优化（useMemo, useCallback, React.memo）
- Preview/VirtualPreview 子块组件全部 React.memo；props 通过 useMemo/useCallback 固定引用。
- App/Toolbar/Outline 等与 content 无关的组件避免因 content 改变而重渲染（拆分 store 订阅或使用 selector）。

6) 代码分割（动态导入 KaTeX, Mermaid, highlight.js）
- 改造 lib/performance.ts 的 lazyLoadMermaid/lazyLoadKaTeX 为入口；
- highlight.js 改为 core + on-demand 语言注册；
- vite.config.ts 使用 manualChunks 拆分 vendor。

7) 启动优化（延迟加载非关键模块）
- 首屏仅挂载 Editor 与基础 UI；Preview/Worker 在用户首次需要或空闲时初始化（requestIdleCallback）。
- CSS/字体按需注入；Mermaid 仅在检测到 mermaid 块后初始化。

8) 性能监控（Performance.mark/measure）
- 标注关键点：
  - 'editor_input'（键入事件）→ 'schedule_preview'（进入防抖队列）→ 'worker_parse_start'/'worker_parse_end' → 'preview_commit_start'/'preview_commit_end'。
  - 块渲染：'block_render_start:{id}' → 'block_render_end:{id}'（分类统计）。
  - 滚动与 FPS：rAF 采样 + 'scroll_sync' 打点。
- 输出到 Dev 面板（开发模式显示统计条/console.table）。

----------------------------------------
六、风险与权衡
----------------------------------------
- 增量解析正确性：块边界（列表、引用、表格、嵌套）需充足单测；建议先按粗粒度块（标题/段落/代码/公式/表格/分隔线）实现。
- Mermaid 无法在 Worker 完整渲染：按需、可视区、空闲时渲染，必要时提供占位与超时降级（错误提示或轻量图形）。
- 一致性与并发：引入 seqId/version 机制，主线程仅应用最新 Worker 响应；支持取消前次请求。
- 维护性：模块边界清晰（ParserWorker、BlockIndex、VirtualList、Scheduler、PerfPanel），并配套单测与性能基准。

----------------------------------------
七、验收标准与达成路径映射
----------------------------------------
- 输入延迟 < 50ms（大文档）
  - 防抖 + 低优先级更新 + Worker 并行解析；主线程仅执行轻量 DOM commit。
- 预览滚动 >= 60fps
  - 窗口化虚拟列表 + 高度缓存 + rAF 滚动同步；限制 DOM 节点数量与布局变动。
- 启动时间 < 2s
  - 动态导入重型库与样式；首屏仅加载 Editor 与基础 UI；Worker 预热在空闲时。
- 内存占用 < 200MB
  - LRU 缓存上限（块数/总字节）与释放策略；仅保留可视区 ± overscan 的 DOM；避免保留大 SVG/HTML 在离屏区域。
- 数据支持
  - 统一 Performance 面板输出 P50/P95 输入延迟、解析耗时分布、预览 commit 时长、滚动 FPS 与启动时间；生成优化前后对比报告。
- 可维护性
  - 明确模块边界与 API；单测覆盖解析与虚拟列表关键逻辑；在 PR 阶段强制跑性能基准。

----------------------------------------
八、实施优先级（建议执行序）
----------------------------------------
1) 最先落地（立竿见影）
- 输入→预览防抖（150–300ms，尾随为主）+ startTransition。
- 将 parseMarkdown + highlight 迁移到 Worker（整文模式），Preview 接收 HTML 字符串。
- 动态导入 Mermaid/KaTeX/highlight（减少首屏体积）。

2) 第二阶段（体验提升）
- 块级模型与增量渲染：diffBlocks + Worker patch；
- 真正虚拟列表（窗口化）替换当前懒渲染；高度缓存与 ResizeObserver。
- rAF + throttle 的滚动同步与锚点映射。

3) 第三阶段（打磨与监控）
- 全链路 Performance 面板与测试套件（输入、滚动、启动、内存）。
- 安全与正确性（DOMPurify、边界单测）。

----------------------------------------
九、需要修改的具体点列表（文件级）
----------------------------------------
- src/components/Editor/Editor.tsx
  - 在 updateListener 中改为调度“预览刷新”事件（debounce）而非立即 setContent 触发整树更新；或在 App 用 useDeferredValue(content)。
  - 滚动同步改为 rAF + throttle；暴露当前行号/块 id 映射（为锚点同步做准备）。

- src/components/Preview/Preview.tsx
  - 改为消费 Worker 输出的 HTML；移除主线程 parseMarkdown 调用。
  - 检测到公式/代码/mermaid 时按需加载对应库/样式并渲染；Mermaid 仅对可视区 + 空闲时渲染。

- src/components/Preview/VirtualPreview.tsx
  - 替换为窗口化虚拟列表；BlockRenderer 改为消费 Worker 的块级 HTML（React.memo）。
  - 高度估算 + 真实高度回填缓存；overscan 2–3x。

- src/lib/markdown.ts
  - 迁移到 Worker；主线程仅保留类型与工具函数；引入 DOMPurify（或同等）在 Worker 完成消毒后返回。

- src/workers/markdown.worker.ts
  - 扩展为模块 Worker，动态 import 重型库；实现 parseFull 与 parseBlocks；维护 LRU 与 seqId/version；返回 metrics。

- src/hooks/useMarkdownWorker.ts
  - 统一改为使用模块 Worker；管理请求 id 与取消；提供 warmUp()。

- vite.config.ts
  - 使用 manualChunks 将 katex/mermaid/highlight/marked 拆分为独立 chunk；Worker 构建模式为 module。

- src/lib/performance.ts
  - 增加 Performance.mark/measure 统一封装；rAF FPS 采样器；滚动同步打点；测试辅助导出。

----------------------------------------
十、度量与测试（Phase 3 的准备）
----------------------------------------
- 测试数据集：10k+ 纯文本、代码密集、公式密集、Mermaid 密集、混合。
- 指标：
  - 输入端到端延迟：从 keydown 到 preview_commit_end 的时间（P50/P95/P99）。
  - 解析耗时：worker_parse_end - worker_parse_start。
  - 预览 commit：preview_commit_end - preview_commit_start（块级与整文）。
  - 滚动 FPS：rAF 采样 5s 连续滚动，统计平均与掉帧率。
  - 启动时间：app_boot_start → first_interactive；首屏 JS 体积（总/分块）。
  - 内存：渲染过程中采样内存占用峰值；块级缓存命中率与占用。
- 报告：优化前后对比表与分布图，附关键 trace 截图与样例日志。

----------------------------------------
结语
----------------------------------------
上述方案在 Web 技术栈中复刻 Typora 的性能理念：重型计算隔离到 Worker、块级增量、真正虚拟化、按需加载与全链路监控。按“先易后难”的顺序推进，第一轮即可显著降低输入卡顿与启动时间；第二轮实现 60fps 滚动与块级稳定性；第三轮巩固指标与可维护性，满足完整验收标准。
