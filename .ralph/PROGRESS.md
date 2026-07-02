# Project Progress Log
Started: 2026-01-22 23:41:38

## [2026-01-22 23:41:38] Iteration 1 Discussion

## [2026-01-23 00:30] Step 4 - Worker 管线 MVP（全量传输） (Agents: claude, codex)
- 新增 src/workers/pipeline.worker.ts：实现“管线 Worker”，把 Markdown→HTML（含代码高亮）迁移至 Worker，并在 Worker 内进行统一 sanitize（脚本标签、事件属性、javascript: URL 去除）。返回块级渲染结果及行号映射。
- 新增 src/hooks/usePipelineWorker.ts：模块 Worker Hook，维护 seqId，主线程仅应用最新响应；提供 {blocks, isRendering, renderTime}。
- 改造 VirtualPreview.tsx：
  - 引入 usePipelineWorker，消费 Worker 的块级 HTML；删除主线程 parseMarkdown 调用；BlockRenderer 使用 worker 返回的 html。
  - 保持 KaTeX/Mermaid 在主线程异步渲染（按需），避免阻塞输入帧。
- 改造 Preview.tsx：
  - 通过 usePipelineWorker 在全文模式下拼接块级 HTML；保留 parseMarkdown 作为回退。
- 预期效果：打字流畅度提升，主线程长任务比例下降；大文档预览更新延迟显著下降。
- 下一步建议：
  - 将 KaTeX 的 renderToString 迁移至 Worker，主线程仅 mount（需要在 lib/markdown.ts 中调整占位/渲染策略）。
  - 引入版本/取消机制（AbortController/CANCEL 消息）以在高频输入下丢弃旧任务。
  - 推进 Step 5 的增量 patch 协议（from/to/inserted），减少 IPC 体积。

## [2026-01-23 01:20] Step 6 - 块模型与缓存（block store） (Agents: claude → codex → gemini)

## [2026-01-23 02:10] Step 7 - 两阶段渲染与高亮 (Agent: codex → gemini)
- 引入两阶段渲染管线：Pipeline Worker 先返回“无高亮”安全 HTML（快速路径），在块元素可见时由主线程请求二阶段高亮替换。
- 修改 src/workers/pipeline.worker.ts：
  - 使用轻量 marked 实例生成快速 HTML，保留数学/mermaid 占位符并进行 sanitize。
  - 在返回的块中携带 language 与 contentHash 元数据，用于缓存与替换一致性。
  - 新增“highlight”消息处理：用完整 parseMarkdown（带 marked-highlight）生成带高亮 HTML，并回传 {type:'highlighted', blockId, html}。
- 修改 src/hooks/usePipelineWorker.ts：
  - RenderBlock 增加 content/level/language/contentHash 元数据。
  - onmessage 处理 “rendered” 与 “highlighted” 两类事件；按 blockId + hash 替换块 HTML。
  - 暴露 requestHighlight(block) API，供可视块触发二阶段高亮请求。
- 修改 src/components/Preview/VirtualPreview.tsx：
  - BlockRenderer 在可见时调用 requestHighlight(block)，并维持 KaTeX/Mermaid 的异步渲染。
  - 保持 LRU 缓存与内容可见性/contain 优化。
- 验收预期：
  - 打字期间 Preview 先显示无高亮 HTML，避免阻塞；可见时渐进替换高亮，无闪烁。
  - 代码密集文档 p95 预览延迟预计下降，DOM 更新量减少。
- 下一步（Gemini 风险评估）：
  - 关注 Worker 中 sanitize 配置与 Trusted Types/CSP 的一致性；
  - 评估两阶段高亮的竞态条件（过期响应替换）并验证 hash/seqId 逻辑；
  - 在 performance_tests 场景下收集 p50/p95 指标与丢帧统计。
- 产出 docs/block-store-spec.md：定义 BlockStore 的数据模型（BlockMeta/BlockRender/LineIndex）、接口（init/applyChanges/getRange/hydrateFromCache/requestRender/persist/restore/getStats）、增量失效策略（相邻块扩散、列表组失效）、LRU 与 IndexedDB 持久化方案、Worker 协议（版本/取消）、以及高度估算与滚动稳定方法。
- 新增 src/lib/block-store.ts：提供接口与骨架实现（内存索引、简易哈希、LRU 管理、与 pipeline.worker 的最小协作）。注意：applyChanges 目前为占位（需 Codex 按 CodeMirror ChangeSet 做行号映射与增量更新）。
- 与现有渲染融合建议：
  - VirtualPreview.tsx 将现有 renderCache 替换为 BlockStore 的 LRU（键改为 hash），在 onVisible 时尝试 hydrate；未命中调用 requestRender。
  - usePipelineWorker 输入改为 BlockMeta 列表，并返回增量渲染；主线程按 id 合并。
- 下一步（Codex）：
  - 完成 applyChanges（from/to/inserted）驱动的增量块更新与行号→块映射维护；引入保守失效策略。
  - 在 Worker 侧支持每块独立返回，避免拼接；迁移 KaTeX renderToString 到 Worker。
  - 在 VirtualPreview 中接入 BlockStore，替换 Map 缓存为 LRU（含容量与字节上限）。
- 下一步（Gemini 验证）：
  - 基于 performance_optimization_tests 的长文档与代码密集场景，验证“DOM 更新量下降、预览延迟 p95 < 250ms、缓存命中率”。
  - 验证冷启动 IndexedDB 回放收益；记录命中率与首屏时间对比。

## [2026-01-23 09:50] Step 9 - 滚动同步与锚点定位 (Agent: claude → codex → gemini)
- 架构与规格：新增 docs/scroll-sync-anchor-spec.md，定义“行号→块”映射、PositionIndex、插值算法与次帧校正策略；规定 data-block/data-start-line/data-end-line 属性与 passive+rAF 调度要求。
- Hook 骨架：新增 src/hooks/useScrollSync.ts，实现单向（editor_drives）滚动同步的核心流程：
  - rAF 合并滚动事件、syncLock 防止循环、插值到目标块顶部 + 行内偏移；
  - 当 PositionIndex 命中时直接定位；未命中时留给 VirtualPreview 提供“scrollToIndex→回填后再次定位”的协作点；
  - 提供 scrollToAnchor/onTocJump/onSearchJump API 以集成目录/搜索跳转。
- 治理清单：新增 docs/scroll-sync-governance-checklist.md（Gemini），覆盖数据索引、事件调度、算法正确性、可观测性与回退策略的检查项与测试计划。
- 下一步（Codex）：
  - VirtualPreview 暴露 getBlockOffsetById/scrollToOffset，并在 BlockRenderer 容器上补齐 data-* 属性；通过 ResizeObserver 维护 PositionIndex。
  - Editor 暴露 getTopLine/getCursorLine（基于 CM6 visibleRanges），以行为单位驱动同步。
  - 完成反向映射（预览→编辑）的二分查找算法，替换比例兜底。
- 下一步（Gemini 验证）：
  - 在 performance_tests 中加入精度与流畅度用例；
  - 打点 scroll_sync_start/end、误差分布与 rAF 掉帧统计；
  - 验收“锚点误差 ≤ 1 行；滚动流畅无抖动”。

## [2026-01-23 10:45] Step 12 - 可观测性、门槛与降级/恢复 (Agent: claude)
- 埋点与面板：
  - 在 usePipelineWorker 与 VirtualPreview 中接入 Performance.mark/measure：worker_parse_start/end、preview_commit_start/end、block_render_start/end:{id}；开发模式控制台输出解析与提交耗时。
  - 保留 performance_tests 的 FPS/输入/内存测试套件，用于基线对比；新增 src/lib/perf-observer.ts 采集 LongTask 与 LayoutShift（开发模式）。
- 启动链路：
  - 在 main.tsx 打点 app_boot_start；Editor 初始化完成后打点 first_interactive。
- CI 性能门禁：
  - 新增 scripts/perf-gate.mjs，基于 Puppeteer 自动化运行 performance_tests 并按阈值判定（启动 mount ≤1000ms，解析 ≤800ms，输入均值 ≤250ms，滚动 p95 帧间隔 ≤20ms、avgFPS ≥45，内存峰值 ≤200MB）。
  - 在 package.json 增加 npm run perf:gate；需先在另一个终端运行 npm run dev。
- 降级/恢复：
  - 新增 src/stores/runtime.ts 运行时开关：previewMode('full'|'light'|'current_block_only')、disableHighlight、workerAutoRestart。
  - VirtualPreview 根据 previewMode 动态调整 IntersectionObserver 的 rootMargin（light 模式缩至 50px）；disableHighlight=true 时不触发二阶段高亮请求。
  - usePipelineWorker 增加 onerror 自恢复与 5s watchdog 超时重启、当前请求仍有效时重试一次。
- 验收对齐：
  - 未达标时 perf:gate 退出码为 1，可阻断发布；达标时输出报告与 PASSED。
  - 降级/恢复策略在大文档/异常场景下有效降低 CPU 与 DOM 更新量，且能自动恢复 Worker。
- 文档：新增 docs/performance-gate-spec.md 说明门禁、埋点与降级策略。


### [2026-01-23 00:00] Step 3 - CSS 内容可见性与样式层优化 (Agent: codex)
- 修改 Preview.css：为 .markdown-body 与 .preview-block 增加 content-visibility: auto、contain 与 contain-intrinsic-size（@supports 保护）。
- 表格优化：table-layout: fixed，单元格启用 word-break/overflow-wrap。
- 图片优化：在 markdown.ts 的自定义 image 渲染中加入 decoding="async"；CSS 中限制图片尺寸并 contain。
- 预期效果：视口外渲染成本显著下降，滚动 FPS 提升；大表格与图片对布局的影响范围缩小。
- 风险与兼容性：通过 @supports 回退；不支持引擎保持旧行为。


=== claude ===
以下是我作为架构师对该项目性能优化的理解与建议。

1) 我对需求的理解
- 目标：把 React + CodeMirror 6 + Tauri 的 Markdown 编辑器在“编辑-预览共存”场景下做到 Typora 级流畅（输入无明显延迟、预览滚动顺滑、启动快）。
- 核心问题集中在渲染路径耦合（编辑和预览互相牵扯）、CPU 重负载（Markdown/KaTeX/Mermaid 解析）、DOM 规模过大（整文预览）与资源加载策略（启动时加载过多）。
- 期望输出包括体系化的分析报告、成体系的优化（代码与监控）、以及数据支撑的验证报告。

2) 关键点与挑战
- 编辑→预览耦合与抖动：每次输入触发全量解析+全量渲染，主线程阻塞，导致输入延迟。
- 渲染粒度过粗：整篇 HTML dangerouslySetInnerHTML 每次重建，造成大量 DOM diff 与布局/重排。
- 重型依赖同步执行：
  - marked + highlight.js 同步运行
  - Mermaid 渲染开销大、且通常需 DOM
  - KaTeX 字体/CSS与renderToString成本
- 虚拟列表不稳定：动态高度内容（图片、数学、图表）导致频繁回流、滚动同步抖动。
- React 重渲染：状态提升过高、无必要的父级 re-render、useMemo/useCallback 缺失、key 不稳定。
- Worker 使用不彻底：解析没有完全搬到 Worker，或消息批次/缓存/并发控制缺失，导致抖动与抢占 UI 线程。
- 启动阶段：一次性加载 KaTeX/Mermaid/高亮语言包、CSS 字体等，TTI 被拉长。
- 一致性与复杂度：引入增量解析、虚拟预览、缓存、并发后，设计复杂度上升，必须有良好的取消/过期响应处理与可观测性。

3) 建议的方案/思路
总体策略：拆、异步、增量、虚拟化、观测。

A. 数据与渲染架构
- 文档分块模型：
  - 以“块级节点”为单位切分（段落、标题段、代码块、公式块、图表块）。维护块的唯一 id、起止行号、内容 hash。
  - 仅对变更块进行解析与渲染，避免整文重排。
- 增量解析管线（Worker 内）：
  - 将 marked、KaTeX 的 renderToString 搬到 Web Worker。
  - 对每个块计算内容 hash，命中缓存直接返回，未命中才解析。
  - highlight.js 按需加载语言（highlight.js/lib/core + 注册必要语言），并缓存结果。
  - Mermaid：不在 Worker 直接完整渲染（需要 DOM），而是：
    - 优先对 Mermaid 源码计算 hash，未变更不重渲染。
    - 首次渲染延后到空闲时间（requestIdleCallback）或低优先级调度，并允许“占位符 + 延后渲染”策略。
    - 可选：使用预编译/最小化渲染（如先生成占位 SVG 模板，真实渲染在可视区域内执行）。
- 主线程渲染层：
  - Preview 采用虚拟列表（如 react-virtuoso/React Window + VariableSizeList）按块渲染，overscan 控制，避免整文 DOM 膨胀。
  - Math/Diagram 块渲染采用“延迟装配”：先占位（估高），再在 mount 后用 ResizeObserver 精确更新高度，减少同步测量。
  - Stable keys 与 React.memo：每个块组件（Paragraph/CodeBlock/MathBlock/DiagramBlock）props 稳定化与 memo 化，断绝父级重渲染传播。

B. 编辑→预览更新流
- CodeMirror 侧：
  - 使用 updateListener 聚合变更，150-300ms 防抖，确保打字流畅优先。
  - 始终使用非受控模式（避免 React state 驱动 CodeMirror 重建），extensions 数组稳定引用。
  - 输入事件上轻量标记 performance.mark('input')，跟踪端到端延迟。
- Worker 通信：
  - 使用 Comlink 或自定义 RPC，保持单一 Worker 实例复用。
  - 以“增量块”消息为单位批处理，携带 docVersion；Worker 返回时附带 version，主线程只接收最新版本结果（避免乱序覆盖）。
  - 引入 LRU 缓存（块 hash→HTML/渲染工件），并暴露 warm-up 接口（启动后空闲预热）。
- 预览刷新：
  - 收到 Worker 增量结果后，仅替换对应块的内容。虚拟列表中触发局部更新。
  - 对图表/图片/公式进行“延迟装配”和“可视区域内渲染”，避免抢占主线程。

C. React 层优化
- useMemo/useCallback/React.memo 全面覆盖：
  - Editor/Preview 容器尽量无状态，数据通过轻量 store（Zustand/Redux Toolkit）集中管理，避免父子树级联更新。
  - 事件处理器稳定引用；CSS 样式对象、列表 itemData 稳定引用。
- 拆分 Preview：
  - Preview.tsx：容器+虚拟列表 Controller
  - VirtualPreview.tsx：仅列表与条目渲染，条目组件高度管理与 memo
  - 各块细分组件按类型拆分，便于分别优化。

D. 代码分割与启动优化
- 动态导入：
  - KaTeX、Mermaid、highlight.js 按需动态加载。
  - highlight.js 只注册常用语言；未知语言延迟动态加载。
- CSS/字体：
  - KaTeX 字体延迟加载或使用 unicode-range 子集。
  - 仅在检测到文档包含公式/图表/代码块后加载对应依赖（首屏纯文本时不加载）。
- Vite/Tauri：
  - vendor 分包，预加载策略（link rel="preload"/"prefetch"）在 Tauri 中等价为本地资源读取，但解析/初始化仍要延后。
  - 首屏渲染只加载 Editor 及最小状态管理，Preview 延迟 mount（或 Skeleton）。

E. 虚拟滚动与滚动同步
- 虚拟列表使用 VariableSize + 动态高度缓存：
  - 初始估高，挂载后通过 ResizeObserver 回填真实高度并缓存，减少抖动。
  - overscan 适中（例如上下各 3-5 屏）以平衡流畅与内存。
- 编辑-预览滚动同步：
  - 以块级映射（编辑器行号→块 id）进行 anchor 同步，采用 requestAnimationFrame 执行，避免同步测量。
  - 去抖/限频同步，避免“滚动风暴”。

F. 性能监控与仪表板
- Performance API：
  - 标记关键阶段：input、queued_to_worker、worker_done、preview_patch_start、preview_commit_end、frame_dropped。
  - 输出到一个轻量的 Performance 面板（仅开发态）。
- React Profiler/Flamegraph：对 Editor、Preview 的 commit 时间进行可视化。
- 指标收集：输入端到端延迟（p50/p95）、首屏可交互时间、渲染帧时长分布、内存占用峰值。

G. 与 Typora 的对比要点
- Typora 使用原生/近原生的增量渲染与块级模型、强缓存与懒渲染。我们用 Web Worker + 块级增量 + 虚拟列表复刻其思路，特别是对重型节点（图表/公式/高亮）的懒加载与命中缓存。

4) 需要注意的风险或问题
- Mermaid 在 Worker 渲染受限：需在主线程渲染，但必须彻底懒加载与可视区域内渲染，否则会卡主线程。
- 增量解析的边界问题：使用 marked 获取精确块级 AST/Token 需要定制 tokenizer，若难度过高，退而求其次用“基于分隔符的粗粒度块切分”（标题/空行/围栏代码）保障收益与实现复杂度平衡。
- 状态一致性：必须实现 docVersion 与响应过期丢弃机制，避免乱序响应污染预览。
- 动态高度抖动：大量图片/公式加载会导致布局频繁变化，须依赖 ResizeObserver 与节流的 remeasure。
- 代码维护性：抽象边界清晰（块模型/Worker API/渲染组件），单测覆盖关键调度与缓存逻辑，避免后续回归。
- 内存控制：缓存设置上限（块数/总字节），长文档释放不可见块的重型渲染产物（SVG/HTML）以避免超过 200MB。

针对重点文件的具体建议
- src/components/Editor/Editor.tsx
  - 确保 CodeMirror 为非受控组件，extensions/useEffect 依赖稳定。
  - onChange/updateListener 聚合，150-300ms 防抖；仅发布差异块信息到 store/Worker。
  - 移除任何导致父级 state 改变的频繁 setState，事件函数 useCallback。
- src/components/Preview/Preview.tsx
  - 拆分为容器 + VirtualPreview；容器不存储大文本，仅存块索引与哈希。
  - 仅接收 Worker 增量结果并更新对应块。React.memo 保证不变块不重渲染。
- src/components/Preview/VirtualPreview.tsx
  - 使用 VariableSize 虚拟化，缓存高度，挂载后 ResizeObserver 更新。
  - 图表/公式组件采用“占位+延后装配”，可视区域内才真实渲染。
- src/lib/markdown.ts
  - 缩至纯类型与工具函数，重型解析迁入 Worker。
  - highlight 回调改为异步、按需语言加载；返回 promise 结果由 Worker 聚合。
- src/workers/markdown.worker.ts
  - 初始化时动态 import marked/KaTeX/highlight.js；预热缓存。
  - 输入为块数组（id、content、hash、language 等），输出增量结果（id、html、type、metrics）。
  - 管理 LRU，携带 version，支持取消/过期响应丢弃。
- src/hooks/useMarkdownWorker.ts
  - 单例 Worker；暴露 parseBlocks(changes, version)。
  - 管理 requestId/version 与响应路由；提供 warmUp()。
- src/App.tsx
  - 路由/页面代码分割；Preview 延迟挂载；KaTeX/Mermaid 在检测到需要时再加载。
  - 开发态注入 Performance 面板与 userTiming marks。

验收指标达成路径
- 输入延迟 < 50ms：输入→防抖→Worker 解析并行，主线程几乎不做重活；预览局部更新，小范围 commit。
- 预览 60fps：虚拟化限制 DOM 数量，重型节点懒渲染，布局测量节流，rAF 驱动滚动同步。
- 启动 < 2s：首屏只加载 Editor 与最小框架，KaTeX/Mermaid/highlight 按需加载；字体延迟。
- 内存 < 200MB：虚拟化限制 DOM，缓存上限与可见区域策略，释放不可见重型节点。

下一步建议
- Phase 1（分析与基线）：
  - 加入 Performance.mark/measure 埋点；生成“编辑→预览”端到端火焰图和渲染分解时间。
  - React Profiler 记录 Preview commit 时间分布；统计 DOM 节点峰值与平均值。
  - 产出 performance_optimization_report.md，列出瓶颈与预计收益。
- Phase 2（实现）：
  - 先落地 Worker 全量迁移 + 防抖 + 增量块模型，再做虚拟列表与懒渲染，最后做代码分割与启动优化。
  - 每一步都有对照实验与数据记录。
- Phase 3（验证）：
  - 构建 performance_tests：长文档输入测试、滚动流畅度（RAF 丢帧计数）、启动时间测量、内存采样。
  - 生成优化前后对比报告与结论（满足验收标准）。

说明
- 我目前无法直接读取你的源码（工作区文件未挂载）。若你授予源码访问，我可以在上述重点文件上进行逐行审查，补充“具体到行级”的瓶颈定位与改造建议，并产出初版性能埋点与测试套件骨架。

=== codex ===
以下是我对需求的实现向导式观点，聚焦可落地的技术方案与改造重点。

1) 对需求的理解
- 目标是在 React + CodeMirror 6 + Tauri 的 Markdown 编辑器中，实现“编辑与预览共存”的流畅体验，重点解决输入卡顿、预览渲染阻塞以及启动慢的问题，目标达到 Typora 的交互流畅度。
- 性能优化需贯穿数据管线（编辑器输入 → Markdown 解析 → 预览渲染 → 异常重排）和资源管线（启动加载 → 代码分割 → 延迟加载），并可度量与回归测试。

2) 关键点与挑战
- 输入卡顿的本质：同步解析整文档 + 同步渲染整预览 → 主线程被阻塞，React 协调开销大，DOM 更新量过大。
- 重型模块阻塞：KaTeX、Mermaid、代码高亮在主线程同步执行，单次渲染耗时高且引发布局抖动。
- 增量更新缺失：每次变更都全量 parse + render，无法做到仅更新变更区块。
- 虚拟滚动不稳定：项高度动态（公式/图表/图片），如果测量无缓存/无观察，会引发频繁 reflow。
- Worker 使用不足：解析应在 Web Worker，且要有取消与序列化策略，避免旧结果覆盖新状态。
- 启动体积大：Mermaid/KaTeX/highlight 被提前打进主包，冷启动加载和初始化慢。
- 可维护性与正确性：增量解析对 token 边界/块划分要求高，容易引入复杂性与一致性问题。

3) 建议的方案/思路（面向实施）
A. 数据管线：防抖、增量、异步
- 输入→预览防抖/节流
  - 在 useMarkdownWorker 或 Editor.tsx 的 updateListener 中，对“触发解析”的动作做 trailing 防抖 150–300ms（大文档建议 200–300ms），并在停止输入后立即触发。
  - 小变更（< N 行）可使用更短间隔（100–150ms），大变更适度加长，利用自适应节流。

- 增量解析（块级）
  - 基于 marked 的 lexer（marked.lexer）获取 token 序列，按块（标题段落、代码围栏、列表、引用、分隔线）生成 block 索引（blockId、startLine、endLine、type）。
  - CodeMirror changeSet 提供行范围映射，用以定位受影响块集合。仅向 Worker 发送这些块的文本片段。
  - Worker 内维护上一版块缓存：对受影响块做局部 parse + render，返回 patch（[{blockId, html}]），主线程合并并只更新对应 React 子组件。
  - 对 KaTeX：优先在 Worker 执行 katex.renderToString（纯 JS，无 DOM），返回 HTML 字符串。
  - 对 highlight.js：也在 Worker 执行（纯 JS），返回带语法高亮的 HTML。
  - 对 Mermaid：保留在主线程异步渲染（mermaidAPI 依赖 DOM）；策略是先占位（Skeleton/占位 SVG），在 requestIdleCallback 或低优先级 useEffect 中渲染，渲染后触发局部高度修正。

- Worker 通信与取消
  - useMarkdownWorker 建立单实例 Worker，维护 seqId，每次请求携带 seqId；Worker 返回时对比最新 seqId，旧响应丢弃。
  - 支持 AbortController 或自定义“CANCEL”消息，防止密集输入时旧任务占用 CPU。
  - 首次启动时预热 Worker（空解析），以减少首个任务冷启动延迟。

B. 视图管线：虚拟滚动、稳定布局、少重排
- VirtualPreview 优化
  - 采用 react-virtual 或自研虚拟列表：仅渲染视口 ± overscan（推荐 2–3 倍视口），保持稳定 key（blockId）。
  - 高度管理：为不确定高度的项启用 ResizeObserver，首次渲染使用估算高度（基于行数/类型），渲染完成后回填真实高度并平滑调整，不强制同步测量。
  - 布局优化：容器使用 will-change: transform、translate3d 滚动位移，避免频繁触发布局；对每项加 CSS contain: content 减少重排影响面。
  - 对异步图表/公式：先渲染 lightweight HTML + 占位，再在空闲时期替换为完整渲染，避免阻塞主线程。

- React 优化
  - Preview.tsx/VirtualPreview.tsx 子项组件使用 React.memo，props 保持稳定（通过 useMemo/useCallback），降低协调成本。
  - Editor.tsx 更新事件处理函数 useCallback，避免向下传递新函数导致子组件重渲染。
  - 切割 Preview 为小组件（BlockView、CodeBlockView、MathBlockView、DiagramBlockView）并 memo 化；每个组件只接收最小必要数据。

C. 重型库按需加载与启动优化
- 代码分割
  - 通过动态 import：在检测到文档包含公式时才 import('katex'), 包含 mermaid 代码块才 import('mermaid'), 包含三引号代码块才 import('highlight.js')。
  - Worker 也用 ES module，内进行动态 import（Vite 支持），避免 Worker 首次启动加载全部重型依赖。

- 启动路径
  - 首页仅加载 Editor + 基础 Preview 框架 + Worker 通道。把 KaTeX/Mermaid/highlight 推迟到首次需要时加载。
  - 资源优化：Mermaid/KaTeX 字体保留 woff2，开启 Brotli 压缩，Vite 构建启用 manualChunks 将重型库拆分为独立 chunk。
  - 首屏渲染：先渲染编辑器和空预览状态，Worker 预热在 requestIdleCallback 中进行，避免阻塞可交互。

D. 性能监控与可视化
- 在关键路径埋点 Performance.mark/measure
  - 编辑输入处理：editor_input → schedule_preview
  - 解析：parse_start → parse_end（区分全量/增量）
  - 块渲染：block_render_start → block_render_end，分别对 Math/Code/Diagram 分类
  - 虚拟滚动：scroll_handler → visible_range_update
  - 启动：app_boot_start → first_interactive

- 收集并上报到性能面板（简单版用 console.table，进阶版做一个 DevOverlay），同时输出到 performance_optimization_report.md。

E. 具体文件改造建议
- src/hooks/useMarkdownWorker.ts
  - 建立单例 Worker、seqId、取消机制、防抖入口。
  - API：getBlocks(html | markdown) / updateBlocks(changedRanges) 返回 patch。

- src/workers/markdown.worker.ts
  - 缓存上次 tokens/blockMap。
  - 实现增量 lex（受影响范围重 lex），对受影响 blocks 进行渲染。
  - 动态 import katex/highlight，Mermaid不在 Worker渲染，返回占位标记。

- src/components/Preview/VirtualPreview.tsx
  - 引入 react-virtual 或自研虚拟列表，支持动态高度和 ResizeObserver。
  - overscan、contain、translate3d 优化。
  - 对异步渲染项在空闲时更新高度并触发轻量 reflow。

- src/components/Preview/Preview.tsx
  - 从“整体 HTML”改为“块列表”渲染；
  - 每个块组件 React.memo；
  - useMemo/useCallback 固定 props 引用。

- src/components/Editor/Editor.tsx
  - CodeMirror updateListener 中提取 changeSet → line ranges；
  - 将 ranges 传给 useMarkdownWorker（防抖后发起增量解析）。

- vite.config.ts
  - manualChunks：katex、mermaid、highlight、markdown libs 拆分独立 chunk；
  - 构建开启 brotliCompression；
  - Worker 构建模式为 module，允许内部动态 import。

4) 需要注意的风险或问题
- 增量解析复杂度高：marked 的 lexer 无内建增量 AST，需要谨慎维护 blockMap 与受影响范围合并/拆分逻辑；建议从“按标题/围栏等粗粒度块”开始，逐步精细化。
- Mermaid 在 Worker 渲染不可行：需主线程异步渲染，正确处理占位与高度变更，避免滚动抖动。
- 并发与一致性：连续输入会产生响应乱序，需要 seqId/取消机制保证“只应用最新结果”。避免旧 patch 覆盖新状态。
- 虚拟列表高度回填：高度变化频繁可能引发跳动；通过估算高度、渐进回填、overscan 缓冲减少视觉抖动。
- 代码分割与懒加载的边界：确保首个使用时的闪烁最小化（可预加载样式/字体），并为离线环境预置必要资源。
- 可维护性：将解析、渲染、虚拟滚动拆分模块，并提供清晰接口和测试用例，避免技术债。

总结
- 核心策略是把“全量同步解析/渲染”改造成“块级增量 + Worker 异步 + 虚拟滚动稳态”的管线，同时按需加载重型库以缩短启动路径。
- 只要控制输入到预览的关键路径耗时（解析 + 局部渲染）在 16–50ms 级别、在滚动时仅渲染可视窗口，并将重型工作挪到 Worker 或空闲期，即可逼近 Typora 的交互流畅度。
- 全程埋点监控，确保每项优化有可量化数据支撑，满足验收标准并可持续回归。

=== gemini ===
以下是我作为“快速代码审查与风险评估”专家对该需求的专业看法与建议。

1) 我对需求的理解
- 目标：把 React + CodeMirror 6 + Tauri 的 Markdown 编辑器优化到 Typora 级流畅度。核心是降低输入到预览更新的端到端延迟、提升滚动和启动性能，同时保持代码可维护性和安全性。
- 痛点集中在三条路径：
  - 编辑输入 → 文本状态更新 → Markdown 解析 → 预览渲染
  - 首屏启动 → 必要资源加载 → 可交互时间
  - 大文档场景下的滚动与增量更新策略（Mermaid/KaTeX/highlight 的重计算）

2) 关键点与挑战
- 渲染分层与优先级调度：输入必须高优先级（<16ms），预览更新要降级为低优先级、批处理、异步。
- 重计算热点：marked、Mermaid、KaTeX、语法高亮是最重的部分，且通常是全量重算。需要增量和可见区限制。
- 虚拟化复杂度：预览为可变高度块，虚拟列表需具备准确测量、锚点定位、快速跳转和滚动同步。
- Worker 与数据通道：避免把整篇文档频繁发往 Worker；要利用 CM6 的 changeset/range 只传增量，防止 clone/copy 过慢。
- 启动冷启动压力：动态导入大库、字体、Mermaid、KaTeX 等需分拆，并按需加载与预解析。
- 正确性与安全：增量解析容易出现边界错误；marked 默认存在 XSS 风险；Mermaid/HTML 注入必须严格消毒。
- 维护性：引入增量解析、虚拟化、调度与监控后，复杂度显著上升，需要清晰边界与测试护栏。

3) 建议的方案/思路
总体架构与数据流
- 事件优先级与调度
  - 输入链路：编辑器输入 → 立即更新编辑视图（主线程，极轻）；预览更新由低优先级队列处理。
  - 使用组合策略：requestAnimationFrame（滚动/绘制节流）+ adaptive debounce（150–300ms，自适应文档大小与事件频率）+ React startTransition/useDeferredValue 降级预览渲染优先级。
- 增量解析与差异渲染
  - 利用 CodeMirror 6 的 transactions/changes 来计算受影响的“块级片段”（按 Markdown 顶层块分片：段落、标题、列表、代码块、公式、图表）。
  - Worker 侧维护一个片段索引：每个块有 range/hash，收到变更只重算受影响块，返回块级 HTML 片段及位置信息。
  - 预览侧根据块 key/hash 进行 React 层面的最小化更新（React.memo + key 精准命中）。
  - 如果现阶段仍使用 marked（非增量），建议：
    - 先以“块拆分 + 局部调用 marked”的工程化增量方案替代全量解析。
    - 长期可评估 Rust/Tauri 侧 pulldown-cmark 做服务化解析（快且稳定），以块为单位返回 HTML 字符串，Worker 只做分发与合并。
- Web Worker
  - 解析、代码高亮、数学公式预处理尽量在 Worker 执行。Mermaid 渲染本质依赖 DOM/SVG，难在 Worker 完全渲染；改为 Worker 预编译/缓存+主线程可见时渲染。
  - IPC 传输只传增量文本和块元数据，避免传整个文档；如需传大字符串，考虑 ArrayBuffer/Transferable 降低拷贝成本。
- 虚拟滚动（VirtualPreview）
  - 使用变量高度虚拟列表（如基于 react-window/自定义 VariableSizeList）。引入:
    - 预估高度 + 延后精确测量（ResizeObserver）+ 高度缓存。
    - 锚点/光标同步：通过块级索引映射编辑器的文档位置到预览锚点，滚动时以 rAF 执行同步，避免抖动。
    - 可见区渲染策略：Mermaid/KaTeX/高亮仅在可见区及少量 buffer 内执行；离屏部分延迟/取消。
- 重型库的按需与分块
  - 代码分割：KaTeX、Mermaid、highlight 各自独立 chunk；Vite manualChunks 指定 vendor 拆分；首屏仅加载编辑器核心。
  - 特征检测与按需载入：只有当文档包含数学/图表/代码块时才动态 import 对应库；并引入 LRU 结果缓存。
  - KaTeX 字体与样式延迟加载；Mermaid 初始化延后至第一次图表出现；对大图表引入超时与取消机制。
- React 优化
  - 状态切分：Editor 与 Preview 解耦，避免编辑器随预览状态变更重渲染；通过事件总线或 useSyncExternalStore 订阅 Worker 输出。
  - 广泛采用 React.memo/useMemo/useCallback；确保 props 稳定（避免匿名函数/对象频繁变更）。
  - 大列表节点避免内联函数与动态样式计算；样式用 className + 预计算。
- 启动/冷启动优化
  - 首屏仅渲染空编辑器与基本 UI；预览延迟到用户打开或粘贴第一段文本后再初始化 Worker 与预览容器。
  - 预连接/预加载：在空闲时（requestIdleCallback）预拉取可能需要的 chunk；缓存上次使用的重型模块。
  - Tauri 侧：禁用不必要插件与权限；资源本地化；减少文件 IO 与同步阻塞调用。
- 性能监控与指标
  - 在关键路径打点：input-start/input-apply/parse-start/parse-end/render-start/render-end/mermaid-block/katex-block/highlight-block 等；统一 measure 上报。
  - rAF FPS 监测器（滚动时采样），输入延迟监测器（输入事件到预览 commit 的差值），启动时间（app-start 到 first-interaction）。
  - 结果落盘到 performance_optimization_report.md 与 PERFORMANCE.md，同时形成基线与回归警报。

面向三大核心问题的落地策略
- 编辑预览共存卡顿
  - 立即执行：输入→预览增量更新的 adaptive debounce（150–300ms，尾沿触发为主，停止输入后快速收敛），并用 startTransition/DeferredValue 降低优先级。
  - 增量解析：块级 diff + Worker 解析 + 预览块替换；高亮/公式/图表延迟到可见时。
  - 滚动联动在 rAF 内节流；仅同步锚点，不触发额外重排。
- 启动卡顿
  - 首屏不加载 Mermaid/KaTeX/highlight；动态导入；Vite manualChunks；懒加载字体。
  - 预览容器和 Worker 延迟初始化；在空闲时预热。
  - 资源缓存与 Tauri 配置精简。
- 目标达成（60fps/输入延迟 <16ms 感知）
  - 输入端实际可达：主线程输入回显 < 8ms，预览更新 150–300ms 批处理；用户感知几乎无输入卡顿。
  - 滚动保持 60fps：可见区渲染、变量高度虚拟化、rAF 合并更新。

4) 需要注意的风险或问题
- 增量解析正确性
  - 风险：块边界识别错误导致预览错位/丢块。对嵌套列表、引用、代码块围栏、表格是常见坑。
  - 缓解：用严格的块划分器（正则+状态机），对变更上下文（前后若干行）扩大解析窗口；单元测试覆盖典型边界。
- Worker 通信成本与一致性
  - 风险：频繁传大文本引发卡顿。
  - 缓解：只发送 changeset 或受影响片段；合并短时间内多次变更；使用 Transferable 降低拷贝；引入取消/最新结果优先策略。
- Mermaid/KaTeX 资源与稳定性
  - 风险：大图表或复杂公式拖累主线程；渲染阻塞滚动。
  - 缓解：可见区渲染、超时与降级（占位符/延后渲染）、缓存渲染结果；对超大图表进行分块或提示优化建议。
- XSS/安全
  - 风险：marked 默认不安全，Mermaid 内联 HTML。
  - 缓解：DOMPurify（或等效）强制消毒，禁止内联事件/脚本；Tauri 开启 CSP、最小权限策略；文件输入进行白名单过滤。
- 维护性与复杂度
  - 风险：引入虚拟化与增量解析后，逻辑复杂度陡增。
  - 缓解：清晰模块边界（ParserWorker、BlockIndex、VirtualPreview、Scheduler）、文档与注释、端到端性能测试护栏。
- 跨平台表现差异
  - 风险：Windows/低端机器表现差；字体渲染差异。
  - 缓解：在 CI 中加入多平台基准；自适应调参（debounce 窗口随性能调整）。

测试与验证（建议重点）
- 性能测试套件
  - 大文档（10k+ 字）基准文本库，覆盖：纯文本、代码密集、公式密集、Mermaid 密集、混合场景。
  - 输入延迟：模拟打字事件，记录输入到预览 commit 的时间分布（P50/P95/P99）。
  - 滚动流畅度：连续滚动 5 秒，rAF 采样计算 FPS 与掉帧率。
  - 启动时间：app 启动到可交互（编辑器可输入）的时间；同时记录首屏 JS 体积与模块加载时序。
  - 内存占用：打开/滚动/长时间编辑后的稳定占用；检测泄漏（打开/关闭文档循环）。
- 指标对齐验收标准
  - 输入延迟 < 50ms（大文档）：通过批处理 + 增量 + 优先级调度达成。
  - 预览滚动 >= 60fps：虚拟化 + 可见区渲染 + rAF 节流。
  - 启动 < 2s：代码分割 + 懒加载 + 轻首屏。
  - 内存 < 200MB：缓存上限与释放策略（LRU、WeakRef）、避免持久旧 AST。
- 报告
  - 报告中提供优化前后对比（表格 + 分布图），分拆模块耗时（解析/高亮/公式/图表/渲染），附关键 trace 截图/日志。

额外建议（可选但高 ROI）
- 解析下沉到 Rust（Tauri 插件，pulldown-cmark）：极大提升解析吞吐与稳定性，JS 侧只做增量调度与拼装。
- 高亮替换为 Shiki/Oniguruma WASM 或采用预高亮缓存；代码块仅在可见时高亮。
- 引入自适应策略：根据设备/文档规模动态调整 debounce 窗口、buffer 尺寸与并发度。

总结
- 优先顺序建议：监控打点→（1）Worker + 自适应防抖→（2）块级增量渲染→（3）虚拟滚动增强→（4）重型库动态导入→（5）React 状态切分与 memo→（6）启动优化。
- 风险主要在增量解析正确性与渲染调度复杂度；通过模块化、单元测试和性能护栏可控。
- 该方案与 Typora 的核心思路一致（块级增量、可见区优先、延迟与调度、重型计算隔离），可在较短周期内获得显著体感提升并满足验收标准。

## [2026-01-22 23:41:38] Iteration 1 Decision

Understanding: 目标是将 React + CodeMirror 6 + Tauri 的 Markdown 编辑器在“编辑-预览共存”场景下优化到 Typora 级流畅度（60fps、输入延迟 <16ms 感知、验收标准输入延迟 <50ms、启动 <2s、内存 <200MB）。当前瓶颈集中在：
Is Task: True

## [2026-01-23 09:02:43] Iteration 1 Discussion

=== claude ===
Agent claude 执行超时（10分钟）

=== codex ===
以下是我从实现角度对该需求的理解、关键挑战、技术方案和风险的简要结论，聚焦于可落地的优化与改造点。

1. 我对这个需求的理解
- 目标不是单点优化，而是全链路“输入→解析→预览→滚动→启动”的性能系统化治理，面向大文档场景，达到 Typora 的流畅度要求。
- 主要问题源自主线程负载过重（整文解析+整页重绘+特殊元素渲染）、React 高频树更新、预览不是增量/窗口化，以及启动阶段不必要的资源加载。
- 优化应分层推进：短期减压主线程与渲染频次、中期按需加载与虚拟化、长期用 Worker 承载重计算并实现增量/窗口化渲染。

2. 关键点和挑战
- 主线程重计算与整页更新：
  - marked + highlight.js 在主线程同步运行；KaTeX/Mermaid 对整页扫描与渲染；每次输入触发整树 re-render。
- 预览渲染策略不够“增量/窗口化”：
  - Preview 走 dangerouslySetInnerHTML 全量更新；VirtualPreview 是懒渲染而非真正虚拟列表，DOM 节点数巨大。
- 滚动同步与输入调度：
  - 比例映射 + setTimeout 解锁，容易抖动；输入与滚动事件频繁，无统一调度器。
- 启动阶段体积过大：
  - 静态引入 KaTeX/Highlight/Mermaid 及样式，首屏下载与解析成本高。
- 状态传递与重渲染：
  - content 每次变更经 Zustand 回到 App，导致依赖 content 的子树频繁重渲染；部分回调/props不稳定。

3. 我建议的方案/思路
分三层推进，每层均给出具体实现要点。

- P0 立刻见效（低风险，主线程减压）
  - 输入/预览的更新降优先级：
    - App.tsx: 用 startTransition 包裹 setContent；Preview.tsx: 对 content 使用 useDeferredValue + debounce 防抖（150–300ms，尾随触发）。
  - 滚动同步节流与稳定引用：
    - 两端滚动处理统一用 rAF + throttle(16–33ms)，引入“同步锁 + 锚点映射”（行号/块 id）替代比例映射，减少抖动。
  - CodeMirror 运行期配置避免重建：
    - 使用 Compartment 管理主题/字体等动态配置，仅 reconfigure，不重建 EditorView。
  - 特殊元素渲染缓存：
    - KaTeX/Mermaid 引入 LRU Map 缓存渲染结果；Mermaid 并发限制（一次 1–2 个，剩余用 requestIdleCallback/分批）。
  - React 重渲染控制：
    - Preview/VirtualPreview 子项 React.memo；所有回调用 useCallback；复杂 props 用 useMemo；Zustand 使用 selector 分片订阅，避免 content 触达非必要子树。

- P1 中期优化（按需加载与解析降级）
  - Highlight.js 核心 + 按需语言：
    - 改用 highlight.js/lib/core，只注册常用语言；禁用 auto-detect；大代码块（>N 行）先普通渲染，闲时补高亮。
  - 按需加载 CSS/库：
    - KaTeX/Highlight 样式通过动态 import() 注入；Mermaid/KaTeX 库通过 lazyLoadMermaid/KaTeX 按内容检测加载。
  - 提前虚拟化阈值：
    - 触发 VirtualPreview 的 content.length 阈值从 50KB 下调至 15–20KB，降低整页渲染概率。

- P2 进阶优化（Worker 承载重计算 + 真正窗口化 + 增量更新）
  - 解析/高亮/KaTeX 移至 Worker：
    - 新增 markdown-html.worker.ts：在 Worker 内执行 marked.parse、highlight.js、高耗时的 katex.renderToString（仅字符串，无 DOM）。
    - 主线程仅负责 HTML commit 与 Mermaid 可视区渲染。
  - 预览增量更新：
    - 将 parseMarkdownToBlocks 产出块列表，结合 diffBlocks 生成 patch，Preview/VirtualPreview 仅更新变化块，保留已渲染的 KaTeX/Mermaid。
  - 真正虚拟列表：
    - 用 react-virtual 或自研 VariableSizeList：仅保留视口 ± overscan 的 DOM，结合 ResizeObserver 与高度缓存，控制 DOM 节点上限与布局稳定。
  - 启动优化/打包拆分：
    - vite manualChunks 拆分 katex/mermaid/highlight/marked 为独立 vendor chunk；仅在需要时 import()。
    - 空闲时 warmUp Worker；link rel=prefetch 预取大库与样式。

- 性能监控与基线
  - 在开发模式统一打点：editor_input/schedule_preview/worker_parse_start/end/preview_commit_start/end、scroll_sync、app_boot_start/first_interactive；提供 rAF FPS 采样与 console.table 面板。
  - 建立 performance_tests 基线，优化前后生成报告。

4. 需要注意的风险或问题
- React 并发更新与兼容性：
  - startTransition/useDeferredValue 需确保业务逻辑正确性；在 Tauri 环境下主进程与渲染线程的调度交互需验证。
- CSS 动态注入导致 FOUC：
  - 按需加载样式可能短暂闪烁；需在检测到相应内容后尽快注入，或预加载基础样式子集。
- Worker 打包与依赖体积：
  - 在 Vite 下 Worker 的模块体积与动态 import 需配置好 manualChunks；Mermaid 不适合完整搬到 Worker，保留主线程渲染。
- 安全与正确性：
  - marked 输出需 DOMPurify 等消毒；增量 diff 的块边界（列表/表格/嵌套）要有充分单测。
- 内存与缓存策略：
  - LRU 上限与释放策略需设定，避免缓存与大 SVG/HTML 导致内存飙升；虚拟列表应该只持有视口 ± overscan 的 DOM。

总结：
- 先做 P0（过渡更新、节流、Compartment、缓存、memo），立即降低输入阻塞与滚动抖动。
- 随后做 P1（按需加载与高亮降级），立刻缩短启动时间、减少主线程负担。
- 最后做 P2（Worker + 增量 + 真虚拟列表），把重计算彻底迁出主线程，预览实现窗口化增量更新，达到 Typora 级的稳定 60fps 与<50ms输入延迟目标。建议按上述优先级推进，并用性能打点面板和基线测试对每轮改动进行定量验证。

=== gemini ===
Error code: 429 - {'error': {'code': 'RateLimitReached', 'message': 'Your requests to gpt-5 for gpt-5 in East US 2 have exceeded the token rate limit for your current OpenAI S0 pricing tier. This request was for ChatCompletions_Create under Azure OpenAI API version 2025-01-01-preview. Please retry after 2 seconds. To increase your default rate limit, visit: https://aka.ms/oai/quotaincrease.'}}

## [2026-01-23 09:02:43] Iteration 1 Decision

Understanding: 执行任务
Is Task: True

## [2026-01-23 16:27:30] Iteration 1 Discussion

## [2026-01-23 16:45:00] Iteration 1 Execution - codex Step 2

完成快速收益改造（编辑优先 + 降渲染）：
- 预览解析防抖（100–200ms），并在空闲期处理 KaTeX/Mermaid 渲染
- React 并发特性：App 中 setContent 使用 startTransition；Preview 使用 useDeferredValue
- IME 组合输入保护：Editor 监听 compositionstart/end 并通知 App；预览暂停更新，结束后批量刷新
- CodeMirror 运行期配置稳定：使用 Compartment 管理字体大小主题，避免重建 EditorView
- 虚拟预览解析在组合输入期间冻结内容，避免抖动

涉及文件：
- src/components/Editor/Editor.tsx
- src/components/Preview/Preview.tsx
- src/components/Preview/VirtualPreview.tsx
- src/App.tsx
- src/lib/performance.ts

日志与文档：
- .ralph_logs/STEP2_codex_changes.md 记录了变更细节与后续计划

下一步：
- Step 4/5 将 Markdown 解析与高亮迁移至 Worker，并设计增量 patch 协议与镜像文本。

验收标准预期影响：
- 输入延迟 p95 有望下降≥30%，组合输入期间无预览抖动；撤销/重做、滚动、查找功能保持正常。

=== claude ===
以下是我对该需求的专业分析与可执行建议。

1) 我对需求的理解
- 症状本质：编辑器与预览并行时，对同一份文档进行高频解析（Markdown、代码高亮、公式、图表）与大 DOM 更新，导致主线程过载；启动时一次性加载过多重量库导致冷启动慢。
- 目标：在大文档、频繁输入、复杂内容（代码、公式、图表）情况下仍保持接近 Typora 的流畅度（60fps 输入响应、预览“准实时”但不中断打字、启动秒开级别）。

2) 关键点与挑战
- 主线程争用：编辑输入、React 渲染、Markdown 解析、代码高亮、Mermaid/Katex 都挤在一个线程上，产生长任务与帧掉落。
- 大文档 DOM 压力：预览一次性渲染整篇文档，导致布局与绘制成本过高。
- 解析全量化：每次输入触发全量 Markdown/高亮解析，而非增量/块级。
- 高亮与图表的重：highlight.js 的语言包、Mermaid 的布局、KaTeX 的排版都较重，若同步执行会卡。
- 状态管理传播：若将整篇文档或预览结果放入 zustand 并触发广泛订阅，React 树会频繁重渲染。
- 启动路径：一次性加载 mermaid、katex、highlight.js 全量语言、编辑器扩展等，拖慢 Tauri 前端初始化。
- Typora对比：Typora的优势是高度优化的原生编辑与预览融合、增量渲染与按需计算，要达到相同体验需要架构层面的重构而非局部微优化。

3) 建议的方案/思路（按优先级分阶段，强调架构性优化）

A. 架构总原则
- 双管线、主从分离：主线程只负责 CodeMirror 输入与轻量 UI；解析与重计算全部搬到 Web Workers（或 Tauri 后端只有必要时参与）。避免主线程长任务。
- 增量与块级：将文档按块（段落、标题、列表项、代码块、数学块、图表块）管理。编辑变更只影响相邻块，预览只更新受影响的块。
- 可视化约束与虚拟化：预览使用虚拟列表，仅渲染视区内块；对不可见块延迟或跳过重计算。

B. P0 快速收益（低侵入、立竿见影）
- 输入/预览调度：
  - 在编辑时对预览更新做 100–200ms 防抖；使用 React 的 useDeferredValue/useTransition 降低预览优先级，保证打字优先。
  - 在用户持续输入期间，预览进入“降采样模式”（例如每 300–500ms 才更新一次），停止输入后再补一次全量增量更新。
- 重库懒加载：
  - highlight.js 使用 core + 按需语言动态 import，不预注册全量；常见语言有命中后缓存。
  - mermaid、katex、marked-highlight 都改为懒加载；首次命中对应块时再加载。
- DOM 渲染控制：
  - 预览对超长文档启用虚拟化（react-window/react-virtualized），至少先虚拟化块级组件。
  - 对预览容器应用 CSS contain（layout/paint），隔离回流与重绘；对动画/滚动层使用 will-change 仅在必要时启用。
- 状态管理约束：
  - 文档内容只存于 CodeMirror state，不放入 zustand；zustand 只存轻量 UI 状态（例如模式、滚动位置、当前文件元数据）。
  - 所有订阅用 selector + shallow，避免树的级联重渲染。
- 渲染策略：
  - 代码块、公式、图表的渲染采用 IntersectionObserver：仅进入视区时才触发；对超出视区的复杂块使用 requestIdleCallback 或低优先级队列。
- 指标与监测：
  - 加入 performance.mark/measure 与长任务监测（Long Task API），记录“按键到预览更新时间”、“帧耗时分布”、“启动时间”（TTI）。

C. P1 架构升级（核心性能提升）
- Worker 管线：
  - parseWorker：在 Worker 中运行 marked + marked-highlight（或替换为 micromark+mdast，如需更强增量）；输入为受影响块的源，输出为块级 AST/HTML。
  - highlightWorker：独立 Worker 管高亮，按语言并发（2–4 并发），语言包动态加载，结果以 LRU 缓存（key=lang+hash）。
  - mathWorker：KaTeX 渲染使用 renderToString 在 Worker 执行；结果缓存（公式字符串 hash）。
  - 使用 Comlink 简化与 Worker 通信与返回 Promise。
- 块级增量与预览差分：
  - 维护块索引（行号范围 -> 块 id/type），基于 CodeMirror transaction changes 定位受影响块边界（向上向下扫描至空行/分隔符）。
  - 仅将受影响块发送至 Worker，返回后在 React 中以 key=块 id 替换对应子树；其他块不更新。
  - 预览组件层级稳定且使用 React.memo；块内容用 dangerouslySetInnerHTML 或轻量 AST 映射，但必须保持 key 稳定从而避免重挂载。
- 预览虚拟化增强：
  - 使用 variable-size list；块首次渲染后通过 ResizeObserver 回填真实高度，避免滚动跳动。
  - 对超大图片、SVG、mermaid 图使用懒加载 + 占位骨架。
- 优先级与调度：
  - 编辑主线程：输入 -> CodeMirror 内建增量渲染（避免自定义重装饰）；减少 EditorView 插件与装饰密度。
  - 预览与重计算：全部低优先级队列，必要时切片（分批 5–10 个块），避免 >50ms 的长任务。

D. P2 深化优化与启动性能
- 启动：
  - 对前端做代码分割（入口仅加载编辑器最小集），首屏不加载 mermaid/katex/highlight 语言包。
  - 预编译与 tree-shake：确保 bundler（Vite/ESBuild/Rspack）正确摇树去除未用代码；highlight.js 只打包 core。
  - 资源优化：字体（KaTeX）与图标延迟加载；图片用 `loading="lazy"`；SVG 图按需内联。
  - Tauri 侧：release 构建、禁用 devtools 注入；必要时预热窗口但延迟加载前端包。
- 内存与缓存：
  - 为高亮/公式/图表结果建立 LRU 缓存并在文档切换时清理；对历史预览仅保留可见及附近块。
  - Worker 池的生命周期与当前文档绑定，避免泄漏；组件卸载时清理观察器与事件。
- 替换与取舍（可选项，需评估性价比）：
  - Markdown 解析从 marked 迁移至 micromark+mdast/remark，获得更好增量与 AST 操作，但改造成本较高。
  - 高亮从 highlight.js 迁移到 Shiki/WASM（更稳定与可控），但启动体积与初始化成本较大，需配合 Worker 与懒加载。

E. 目标体验与量化指标
- 打字响应：主线程 16ms 帧预算内，无明显卡顿；持续输入时预览延后但不阻塞。
- 预览更新延迟：普通块 50–150ms，复杂块（图表/公式）200–500ms，且仅在可视区域内更新。
- 启动时间（冷启动至可编辑）：< 800ms（中等机器），预览与重库在后台懒加载。
- 大文档（>10k 行）：滚动平滑，预览只渲染视区，内存稳定。

4) 需要注意的风险或问题
- 架构复杂度上升：块级索引、增量解析与 Worker 管线引入新复杂度与同步问题，需完善测试与回退策略。
- Mermaid 的限制：mermaid 渲染依赖 DOM，完全在 Worker 中运行较难；建议采用仅可视区域延迟渲染 + 空闲时批量渲染，避免主线程长任务。
- 一致性问题：增量解析需确保跨块语义（列表、引用、嵌套）正确；边界识别需与解析器规则一致，避免错分块。
- 资源加载时序：动态 import 与并发 Worker 可能造成竞态；需加队列与幂等缓存。
- 跨平台差异：Tauri 在不同 OS 的渲染/字体/滚动行为有差异，需真实机器验证与特定优化。
- 过度优化风险：微优化（memo/useCallback）若没有减少工作量，收益有限；主线程卸载重计算才是关键。

总结可执行清单（建议实施顺序）
- 先做：预览防抖与低优先级调度、懒加载 mermaid/katex/highlight、预览虚拟化、zustand 订阅优化、CSS contain。
- 次做：引入 parseWorker/highlightWorker/mathWorker，建立块级模型与增量更新，IntersectionObserver 可视区域渲染。
- 后做：启动代码分割与预编译、缓存与内存治理、替换解析链路的技术选型（如 micromark/remark 或 Shiki）。
- 全程：建立性能指标与日志，按 KPI 迭代验证，逐步逼近 Typora 的流畅度。

=== codex ===
以下是从实现角度的专业分析与建议，聚焦于可落地的技术方案。

1) 我对需求的理解
- 当前双栏（编辑器 + 预览）同时工作时，CPU/主线程被 Markdown 解析、代码高亮、数学和图表渲染占满，导致编辑卡顿和启动慢。
- 目标是像 Typora 一样“边写边看”的流畅度：小幅编辑应在一帧内完成（<16ms 渲染主线程占用），大型文档也应保持无明显卡顿。
- 技术栈决定了优化的重点在：主线程负载转移（Worker）、增量/分块渲染、缓存、按需加载以及 React/CodeMirror 的配置精简。

2) 关键点与挑战
- Markdown 解析与预览渲染的重复工作：编辑器与预览若各自解析，会造成双倍开销。
- 代码高亮与第三方渲染（katex/mermaid）通常是同步重计算，突刺 CPU，影响输入延迟。
- 长文档渲染：列表/表格/代码块过多导致虚拟化与增量更新变难，滚动同步和锚点定位复杂。
- Worker 架构与增量解析：在 CM6 的变更模型下，将小改动映射到块级更新并返回稳定结果需要设计良好的数据结构。
- 启动阶段的大型依赖加载与初始化：marked、highlight.js、mermaid、katex 都可能占用启动时间。
- React 渲染抖动：zustand 选择器与组件结构若不稳定，会引发级联重渲染。

3) 建议的方案/思路（按方向细化到实现层）

- 总体架构与观测
  - 单一解析管道：将 Markdown 的解析、代码高亮、数学、（可选）图表预处理统一放到一个 Web Worker，预览与编辑共享同一份块模型（block model），消除重复解析。
  - 块模型（Block Model）：按 Markdown 块（heading/paragraph/list/item/code/math/table 等）分块，每块含：
    - 范围：startLine/endLine 或 CM6 的 from/to
    - 源文本：text
    - 类型：type
    - 哈希：hash（内容+渲染配置）
    - 渲染产物缓存：html（或分类型渲染结果）
  - 增量更新：通过 CodeMirror 的 EditorView.updateListener 拿到 transaction.changes，计算受影响的块集合，只重新解析/渲染这些块。
  - 性能埋点：使用 performance.mark/measure + Tauri 的日志插件，上报 parse、highlight、katex、mermaid、React 渲染用时；建立数据面板（例如在 dev build 下显示）。

- 编辑器（CodeMirror 6）
  - 精简扩展：避免使用 basicSetup，按需启用必需项；减少 decoration 层数；关闭或延迟不必要的高开销特性（例如不要实时语法检查或复杂 lint）。
  - 更新监听降频：updateListener 内只做轻量工作（收集 changes），将解析请求丢给 Worker；对连续输入应用 50–100ms 防抖，保证输入流畅。
  - 大文档优化：利用 CM6 内置的渲染虚拟化；若有行号/特殊高亮，确保这些插件不在每次输入时做全量扫描。

- 预览（React）
  - 分块渲染 + React.memo：每个块组件接收 {id, html, type}，id 稳定，html 变更才 re-render；父列表用 key=id。
  - 虚拟化长文档：使用 react-virtuoso 或 react-window，对块列表进行虚拟化，仅渲染可视区域及少量缓冲。对于可变高度块，virtuso 更稳。
  - 增量更新：当 Worker 返回 changedBlockIds，仅更新对应项；避免整体 dangerouslySetInnerHTML 的全量替换。
  - 滚动同步：基于块索引与编辑器的可视区，使用 IntersectionObserver + 当前编辑位置映射到预览的块锚；虚拟化下要通过虚拟列表 API 滚动到对应索引。
  - 防抖与批量：预览更新合并（requestAnimationFrame 或 50ms 批），避免一字一渲染。

- Markdown 解析
  - Worker 中解析：使用 marked 的 lexer/parser，或考虑换 unified/remark+micromark 获得更灵活的 token/ast 控制（更易做增量）。
  - 块级缓存：以块 hash 为键缓存解析结果；小范围编辑时复用未变更块的渲染。
  - 增量策略：
    - 获取 CM6 的变化范围（from/to），在 Worker 中计算受影响的块（例如通过二分查找块边界）。
    - 只重新 lex/parse 影响区块，并更新其后可能受结构影响的块（列表/表格需要特别处理）。

- 代码高亮（highlight.js）
  - 禁用语言自动检测：auto-detect 非常昂贵。仅在 ```lang 明确时高亮，否则退回纯文本。
  - 按需加载语言包：通过 dynamic import 只加载已使用语言；维护 LRU 缓存语言模块。
  - Worker 内高亮：highlight.js 是纯 JS，可在 Worker 执行；将源代码与语言传入，返回 HTML 字符串。
  - 结果缓存：以（代码内容哈希 + 语言 + 主题）为 Key 缓存高亮结果；编辑未触及的块直接复用。
  - 可选替换：若追求更高质量/性能，考虑换 shiki（WebAssembly）在 Worker 中初始化一次，冷启动重一些，但增量时更稳。

- 数学公式（katex）
  - 仅对变更块渲染：inline 数学在段落内，尽量每段落解析内联；缓存每段落的数学渲染结果。
  - 懒渲染：对不可见区域（虚拟化）不渲染或延迟；在进入视口时触发。
  - 避免重复布局：katex.renderToString 在 Worker 中完成字符串生成（不依赖 DOM），主线程只插入 HTML。

- 图表（mermaid）
  - 懒加载 mermaid：首次出现 mermaid 块时再 import('mermaid'); 未出现不加载。
  - 只在可视区域渲染：进入视口才排队渲染；设置并发为 1–2，防止 CPU 峰值。
  - 渲染结果缓存：以（代码 + 主题）为 key 缓存 SVG；滚动离开视口不销毁缓存，避免来回滚动重复渲染。
  - 错误与超时：渲染设置超时与回退（显示占位和错误信息），避免阻塞主线程。

- 启动优化（Tauri + 前端）
  - 代码分割与懒加载：
    - 首屏仅加载编辑器框架与基本 UI；marked/highlight/katex/mermaid 均延迟加载。
    - Worker 文件独立 chunk；编辑页面加载后再异步启动 Worker。
  - 预编译与依赖精简：
    - 使用 Vite 构建，确保 tree-shaking；避免包含 basicSetup 的重型默认集。
    - 较重依赖（mermaid、shiki）独立分包。
  - 首屏策略：
    - 快速展示 skeleton（空预览 + 空编辑器），在后台异步加载解析管线与语言包。
    - 预加载常用字体与 CSS（减少布局抖动）。
  - 资源压缩与缓存：
    - 在打包阶段对静态资源做 gzip/br、确保 Tauri 配置下本地资源读取高效。
    - 保持依赖版本固定以便浏览器/webview 缓存命中（开发模式外）。

- 状态管理（zustand）
  - 选择器优化：组件只订阅必要片段，使用 shallow 比较，避免级联重渲染。
  - Store 切分：将编辑状态与渲染/缓存状态分离，防止预览更新触发编辑器组件重渲染。
  - 不在 Store 内存放大型 HTML：大型字符串使用缓存模块管理，组件按 id 拉取，降低 Store 更新负担。

- 内存管理
  - LRU 缓存：分别为块解析结果、代码高亮结果、katex HTML、mermaid SVG 设定容量与 TTL。
  - 空闲清理：使用 requestIdleCallback 或定时器在空闲期做缓存清扫。
  - 大文档策略：超过 N 块时降低并发、拉大防抖窗口，提示“性能模式”。

- 基准线与验收标准
  - 小编辑（<100 字符改动）主线程渲染预算：≤16ms；Worker 解析 ≤10–20ms。
  - 1 万行文档：滚动与输入仍可响应，预览只在视口范围渲染。
  - 启动到可编辑（skeleton 显示）≤300ms；到预览可用 ≤800–1200ms（视设备）。
  - 常用语言（js/ts/python/json/markdown）高亮首用 ≤300ms；后续命中缓存 ≤50ms。

4) 风险或问题
- 架构复杂度上升：Worker 通信、增量块边界、虚拟化滚动同步易出错，需要完善的测试和埋点。
- Markdown 库替换成本：从 marked 切到 remark 系体系需要一定迁移成本，但增量/ast 控制更好。
- 第三方渲染的不可预期：
  - mermaid 可能在复杂图表上耗时很长，需要超时与并发限制。
  - highlight 自动检测禁用后，需要用户标注语言或提供语言推断回退策略。
- 缓存一致性：变更时必须正确失效相关缓存，否则出现预览与编辑不一致。
- 平台差异：Tauri 的不同 WebView（macOS WebKit、Windows WebView2、Linux webkit2gtk）在性能与 API 上存在差异，需要针对性测试。

快速落地优先级（建议先做的改动）
- 关闭 highlight.js 自动检测；仅按指定语言高亮。
- 预览渲染防抖 50–100ms；React 分块组件 + React.memo。
- 将 Markdown 解析与代码高亮迁移到 Web Worker；返回块级结果 + changedBlockIds。
- 懒加载 mermaid、katex 和不在视口内的渲染；引入 react-virtuoso 虚拟化长文档。
- 精简 CodeMirror 扩展集合；updateListener 内仅收集 diff，主线程不做重活。
- 引入 LRU 缓存层；按块哈希缓存解析与高亮结果。
- 启动阶段展示 skeleton，动态 import 重型依赖；分包与按需加载。

这些方案能显著降低主线程负载、减少无谓的全量重计算，并使得编辑-预览并行时接近 Typora 的流畅度。

=== gemini ===
以下是我的专业审查意见，从质量与风险角度出发，围绕你的三类问题（编辑+预览卡顿、启动慢、目标对标 Typora）给出聚焦且可实施的建议。

1) 我对需求的理解
- 你希望在 React + Tauri 的桌面端架构下，把 Markdown 编辑与预览同时开启时的交互延迟降到近乎无感，并显著缩短启动时间，整体体验接近 Typora。
- 关键性能路径在三处：CodeMirror 输入链路、Markdown/高亮/图表/公式的渲染链路、应用启动与资源加载链路。
- 你倾向保留既有栈（marked + highlight.js + zustand），通过配置优化、工作线程、增量/虚拟化渲染、缓存与按需加载来达成目标。

2) 关键点与挑战
- 编辑-预览耦合导致主线程阻塞：每次输入触发整文解析与渲染，React 组件层级 re-render 多，主线程时间片被占满。
- 渲染热点集中在代码块高亮、mermaid、katex：这三者均为“重计算/重布局”，且默认同步。
- 长文档滚动与 diff 代价：全文解析与 React 树更新在长文场景下呈近线性复杂度，易造成卡顿。
- 状态广播与重渲染：若将全文文本或解析结果放入 zustand 并在多个组件订阅，容易引发全局重渲染。
- 启动阶段“冷加载”体量大：highlight.js 语言包、mermaid、katex、Marked、CM 扩展一次性加载，Tauri 插件初始化与前端 bundle 体积叠加。
- 增量解析难点：marked 不原生支持增量，需要基于 token/block 粒度自行维护变更范围与缓存。

3) 建议的优化方案/思路
快速见效的“第一波”优化（低风险，建议先做）
- 输入与预览的解耦与优先级控制
  - 在编辑输入链路上引入 50–120ms 的防抖/节流，只把“最近一次稳定文本快照”送去解析，降低每键触发成本。
  - 使用 React 的 useTransition/useDeferredValue 把预览渲染降级为低优先级更新，确保输入永远流畅。
- Worker 下放：
  - 将 Markdown 解析、highlight.js 高亮移到 Web Worker；主线程只接收 block 级 HTML/AST 与 diff 指令。highlight.js 是纯字符串变换，适合 Worker。
  - mermaid 与 katex尽量延迟与按需：优先在进入视口时加载与渲染；mermaid不易在 Worker 完成布局，建议主线程延迟执行，渲染前显示占位符。
- 预览的增量与块级渲染
  - 把文档切成“块”（段落、标题、列表、代码块、表格等），为每块生成稳定 id（基于 rolling-hash 或基于文本范围），比较旧新版本仅更新变更块。
  - 每个块组件使用 React.memo + key = 块 id；长文场景结合 react-window/react-virtualized 进行虚拟化，仅渲染视口及附近。
  - 代码高亮结果缓存：key = language + hash(content)。命中即复用，未命中才异步计算。
- CodeMirror 6 配置调优
  - 仅保留必要 decoration，避免在 updateListener 内做重计算；把任何解析/高亮等重工作放到 Worker。
  - 减少非必要插件（例如复杂 overlay、频繁装饰更新），降低 dom 装饰密度；按需启用扩展。
  - 视口相关优化：让预览与编辑都围绕当前视口工作，避免对不可见区域做工作。
- 状态管理与渲染边界
  - zustand 中避免存全文字符串的每次变更；仅在防抖后推送快照或解析结果；组件订阅使用 selector + shallow 比较，减少广播带来的重渲染。
  - 将“编辑态”与“预览态”切分成不同 store 或不同 slice，隔离订阅范围。
- 启动优化（前端）
  - 动态 import：mermaid、katex、highlight.js 语言包按需加载；常见语言预打包，小众语言懒加载。
  - 资源预取：首屏仅加载编辑器与基础 UI，预览管线在空闲时预热（requestIdleCallback）。
- 启动优化（Tauri）
  - 精简 Tauri 插件启用（只启用必须的），减少初始化成本；主窗口在 ready 后显示，避免“白屏”时间。
  - 构建配置使用 LTO/优化级别，减小二进制并提升加载速度。

进一步提升的“第二波”优化（中风险，收益可观）
- 块级 token/AST 缓存与增量解析策略
  - 使用 marked 的 tokenizer 拆分为 tokens；维护文本区间到块映射表（ranges）。输入变更时通过 CodeMirror 的 transaction 获得变更范围，仅重跑受影响块的 tokenizer 与 renderer。
  - 对表格、长列表等复杂块，变更传播可能跨块：引入“安全边界”（如相邻块一并重算）保证正确性。
- mermaid/katex 的异步策略
  - 只在块进入视口时渲染；渲染完成后将结果缓存（LRU）。当内容未变时直接复用缓存的 SVG/HTML。
  - mermaid 渲染拥塞控制：并发上限（如 2–3），队列化处理，避免占满主线程。
- 预览管线的“分层渲染”
  - 快速路径：先渲染纯文本块与基本 markdown（headers/paragraph/list），随后在空闲时填充代码高亮、公式、图表。
  - 用户感知优先：保证可读预览先出现，再逐步“精致化”。

可能的“结构性优化”（需要权衡）
- 语法高亮替换方案：评估用 shiki（基于 onig + wasm）或 cm6 内建语言包替代 highlight.js，可能提升稳定性与并发性，但涉及迁移成本。
- 解析器替换：micromark/remark 流式与 AST 能力更强，增量化更易实现，但与现有 marked 生态不同，需谨慎评估。

4) 需要注意的风险或问题
- 增量解析正确性风险：markdown 语法的跨行/跨块影响（列表、引用、表格）可能导致误判变更范围。建议对复杂块设置“保护带”（相邻块一起重算）并以自动化测试验证。
- Worker 线程与主线程同步复杂度：消息序列和版本竞争（快速输入造成乱序）会触发闪烁或错配。需在消息中携带版本号/文档哈希，并在主线程丢弃过期结果。
- mermaid 的主线程占用：其布局渲染较重，若同时渲染多个图表可能阻塞 UI。必须加并发上限与可见性驱动的懒渲染。
- 缓存带来的内存与一致性问题：
  - LRU 策略需要设定上限与逐出策略，避免长时间编辑下的内存膨胀。
  - 缓存键必须与内容强绑定（hash），避免旧结果复用。
- React 层的过度优化风险：过度 memo 化或 selector 复杂化可能引入维护难度与“缓存失效”类 bug。保持边界清晰与可监控。
- 启动优化的用户体验权衡：过度懒加载会造成首操作延迟（首次插入公式/图表时等待加载）。建议首屏空闲时预热核心路径。
- Tauri 端差异：Windows WebView2 与 macOS WKWebView 行为不同，性能与 API 细节需分别测试；部分优化在某平台收益有限或引入兼容性问题。

验证与度量建议
- 建立性能基线与指标：输入到预览稳定的延迟（目标 < 100ms）、长文滚动帧率（稳定 60fps）、启动到可交互时间、渲染代码块/公式/图表的平均时长。
- 加入 performance.mark/measure 与可视化日志；使用 DevTools/Profiler 抓主线程占用与重渲染热点。
- 设计极端测试文档：长代码、密集公式、多个 mermaid 图表，分别验证增量与虚拟化收益。
- A/B 验证：逐步启用优化项，量化每项实际收益与副作用。

总体建议是分阶段推进：先做输入/预览解耦、Worker 下放、块级渲染与缓存等“快赢”，再推进增量解析与更深层的管线分层。这样能在较短时间内明显接近 Typora 的体感，并为更深入的结构优化留出安全空间与度量数据。

=== claude ===
以下是我在前述三位专家意见基础上的补充与差异，尽量聚焦且可执行。

1) 之前可能遗漏的关键点
- CSS content-visibility + contain-intrinsic-size：在预览块组件上启用，可显著减少不可见块的布局/绘制成本，比仅虚拟化更稳，且对长文有“零成本”收益。
- 基于 CodeMirror 6 的 Lezer 语法树做块边界与增量：直接利用 CM6 的增量语法树（TreeCursor + changed ranges），避免自行维护 token 切分与边界一致性问题，降低增量解析复杂度与错分风险。
- Worker 结果版本化与取消策略：所有 Worker 返回需携带输入版本号（或文档 hash + sequence），主线程丢弃过期结果，防止快速输入导致的错配/闪烁。
- 持久化缓存（IndexedDB）：对高亮、KaTeX、Mermaid 的渲染结果按块 hash 做持久缓存；再次打开同文档（或局部未变更）可秒级复用，显著改善启动与首渲染体感。
- 大代码块的降级策略：对超大代码块仅首屏高亮前 N 行，其余折叠/懒高亮；避免一次性插入巨量带样式的 DOM。
- 平台差异的特性开关：根据 WebView2/WKWebView 的表现设定并发与防抖参数（Windows 下更保守并发、加长防抖；macOS 可更激进）。
- 模块预热与 modulepreload：在首屏空闲时预热 Worker 与常用语言包，并使用 <link rel="modulepreload"> 对 marked/highlight core 进行预提取，缩短首次命中延迟。
- 预览快速路径：先渲染纯文本与基础 Markdown，代码高亮/公式/图表作为第二层“精致化”填充，提升用户感知的“可读性先达”。

2) 对其他观点的补充或不同意见
- Mermaid计算外卸建议：除主线程延迟与并发限制外，可评估通过 Tauri 后端进程或隐藏 WebView 渲染并返回 SVG（尽管仍共享主机资源，但能隔离前端 UI 卡顿）。这比完全尝试 Worker 内渲染更现实。
- React 层更新策略：块级组件之外，针对复杂内容可考虑 morphdom 对单块的细粒度 HTML diff，而不是每次替换整个 dangerouslySetInnerHTML，减少 createElement/回收压力。
- 单/多 Worker 架构取舍：若消息编排复杂与序列化开销明显，优先单 Worker 管线 +内部任务队列（高亮/公式分阶段）再上并发池，降低主线程与 Worker 间消息风暴。
- Shiki 替换的时机：不建议早期切换；在现有架构稳定与缓存到位后再 A/B 评估（WASM 初始化与体积在 Tauri 中可能影响冷启动）。
- 状态存储边界再强调：不要把大 HTML 放 zustand；存 id 与轻量元数据，数据通过缓存层按需拉取，避免 store 广播导致的树重渲染。

3) 新的想法与建议
- 自适应调度策略：根据打字速率与设备能力（navigator.deviceMemory/CPU 性能探针）动态调整预览防抖窗口与 Worker 并发，形成“性能模式”与“精致模式”的自动切换。
- 滚动对齐与锚点稳定方案：块 id 采用 rolling-hash + 语义路径（父级 heading 序列），在插入/删除导致行位移时仍保持锚点稳定，减少滚动错位。
- 可观测性面板：内置轻量性能 HUD（输入延迟、预览队列长度、长任务计数、并发数），为每项优化的真实收益提供可视化反馈，指导参数调优。
- 启动阶段的极简编辑模式：首屏仅加载 CM6 与必要 UI，预览栏显示占位与“后台加载中”，等解析管线预热后再逐步启用预览，确保“可编辑秒开”。
- 资源级别的分层 CSS：将 KaTeX/Mermaid 的非关键样式与字体分出次级样式包，首屏不加载；进入首个对应块或空闲期再按需加载。
- 错误与超时治理：对 mermaid/katex 高耗时块设置渲染超时与回退占位，并记录耗时异常到日志，避免个别块拖垮全局体验。

这些补充聚焦在三个落点：更强的“不可见即不工作”（content-visibility/虚拟化/懒渲染）、更稳的增量边界与结果一致性（Lezer 树 + 版本化 + 锚点稳定）、以及“启动与体感优先”的分层加载与持久缓存。结合前述方案，能更快逼近 Typora 的主观流畅度。

=== codex ===
以下是我基于前述讨论的补充与新的实现建议，聚焦可落地的技术点，简洁回答：

1) 之前遗漏的重要点
- CSS 渲染隔离与跳过机制
  - content-visibility: auto + contain-intrinsic-size 为预览块提供占位高度，让浏览器跳过视外渲染；搭配 contain: layout/paint 降低回流影响。
  - will-change 慎用，只在滚动层或动画节点开启，避免过度 GPU 合成层。
- 消息并发与结果一致性
  - Worker 返回结果需携带 seqId/version，主线程丢弃过期结果；对进行中的任务用 AbortController 取消，避免乱序闪烁。
  - 对大字符串传输尽量只传“变更块列表 + 块 HTML”，不要传整篇；必要时传递二进制（TypedArray）或 SharedArrayBuffer 以减少拷贝成本（跨平台注意 COOP/COEP）。
- Tauri/Rust 后端加速路径（可选高收益）
  - Markdown：用 pulldown-cmark 在 Rust 侧做块级解析（比 JS marked 更稳更快），返回块 AST/HTML；作为“解析引擎选项”，对大文档更友好。
  - 代码高亮：Rust syntect 在后端生成 HTML（按需语言），前端仅插入；大幅降低 JS 侧 CPU 峰值。
  - 缺点：跨平台一致性与主题对齐需处理，但在 Tauri 下性能收益显著。
- 预览层“零/轻 React”策略
  - 预览静态区域尽量不做复杂 React 组件树，采用块级节点直接 innerHTML 或使用轻量 DOM diff（如 morphdom）替换，减少虚拟 DOM 开销。
  - 只在交互性需要（折叠、复制、锚点）才挂载小型组件（islands）。
- 持久化缓存
  - 将高亮/KaTeX/mermaid 渲染结果持久化至磁盘（基于文件路径+mtime+块哈希），打开同一文档时快速命中，显著改善冷启动和首次预览。
  - 可用 Tauri 插件或 sqlite/文件缓存目录管理 LRU。
- 启动路径的“预热”
  - 空闲时预热常用语言高亮（js/ts/python/json/markdown）与 KaTeX 字体，避免首次触发的毛刺。
  - Worker 池在首屏后延迟启动并保持常驻，减少后续任务创建开销。

2) 对其他专家观点的补充或不同意见
- mermaid 在 Worker 的可行性：基本不可行（依赖 DOM 布局），建议严格主线程渲染 + 并发上限 + 仅可视区 + 超时回退，占位符先显示。可额外提前解析 mermaid 语法仅做语法校验在 Worker。
- remark/micromark 迁移时机：先把 marked 做块级增量与缓存，配合 Worker 即可获得 70–80% 收益；真正需要更细粒度 AST、插件生态时再迁移，避免一次性改造过大。
- Shiki 替换 highlight.js：Shiki 初始化重且体积大，建议按需子包 + Worker 中初始化 + 持久化缓存；否则不一定比禁用自动检测的 highlight.js 更快。
- React 低优先级更新：除了 useTransition/useDeferredValue，建议分层更新（文本块优先、代码/公式/图表延后），保证“先可读后精致”。

3) 新的想法或建议（实施细则）
- CM6 增量索引
  - 在 StateField 维护块边界索引（基于 tokenizer 的 block ranges），transaction 时只更新受影响区间；Compartment 动态切换扩展而不重建 EditorState。
  - updateListener 内仅收集 diff 与触发防抖队列，主线程不做解析。
- 自适应降采样
  - 根据输入频率与 Long Task 监测动态调整防抖窗口与并发：输入密集期加大防抖、降低并发；空闲期补偿渲染。
- 分阶段渲染（快速/精致两通道）
  - 快速通道：先渲染纯 markdown 基础结构（不高亮、公式占位），确保100–200ms内可读。
  - 精致通道：在 rAF/idle 分批填充高亮、KaTeX、mermaid，每批 5–10 块，控制单批 < 8–12ms。
- 滚动与虚拟化增强
  - 使用 react-virtuoso 的 variable-size 列表 + ResizeObserver 回填高度；对表格/代码块预设 intrinsic size 减少跳动。
  - IntersectionObserver 驱动复杂块渲染/销毁，避免视外开销。
- 监控与限流
  - 引入 performance.mark/measure、Long Tasks、内存占用采样，建立仪表：输入到预览稳定延迟、每批渲染耗时、启动到可交互。
  - 针对 mermaid 设置队列 + 并发=1–2 + 超时（如 1s），超时显示简化占位与“点击重试”。

这些补充重点在于：降低主线程工作量（CSS/DOM/并发控制）、减少跨线程通信成本（块级与持久化缓存）、在 Tauri 环境下引入 Rust 加速备选路径，以及通过“先可读后精致”的分层渲染改善体感。整体与既有建议兼容，且具备较高的实施性与可量化收益。

=== gemini ===
下面是我从质量与风险角度的补充，尽量简洁直击问题。

1) 之前遗漏的关键点
- 渲染跳帧的“长任务治理”与回压机制：
  - 对 Worker 返回结果做版本号和时序控制（丢弃过期结果），并在主线程有输入压力时限速预览更新（令牌桶/队列并发上限）。
  - 主线程每帧预算守卫：超过阈值时直接延后预览更新（降采样），避免打字掉帧。
- 消息负载与拷贝成本：
  - Worker 通信尽量只发送“变更块”引用与小片段，不传整文；大字符串频繁结构化克隆会成为隐形瓶颈。
- content-visibility 与 CSS contain 配套：
  - 预览容器开启 content-visibility:auto + contain，跳过不可见块的布局/绘制，收益通常比单纯虚拟化更稳定。
- 双缓冲预览：
  - 在隐藏容器生成下一版预览（或受影响块），完成后一次性替换可见容器，减少布局抖动与中间态闪烁。
- Tauri 后端替代路径：
  - 评估把 markdown 解析/高亮迁移到 Rust（pulldown-cmark + syntect 或 comrak），通过 Tauri 调用，CPU 侧更稳、GC 压力小；风险是集成成本与跨平台资源打包。
- 安全与卫生：
  - marked 输出走 DOMPurify（或可配置开关）做基本 XSS 清洗；本地应用也可能打开外部文件，需最低限度防护。注意清洗成本可在 Worker 做。
- Dev vs Prod 差异：
  - React StrictMode 在开发环境双渲染，会夸大卡顿；基准必须在生产构建下采集。否则结论偏移。

2) 对其他专家观点的补充/不同意见
- dangerouslySetInnerHTML vs AST->组件：
  - 他们建议块级 dangerouslySetInnerHTML 或轻量 AST 映射。我的建议是混合策略：文本/代码块用 innerHTML（快），表格/列表用 AST->组件（更可靠的差分与滚动/锚点），否则复杂结构的纯 HTML 替换易造成滚动跳动。风险在于两条管线并存的维护复杂度，要以块 type 明确分流。
- highlight.js 替换为 shiki 的取舍：
  - 认同“中期可评估”，但不建议在未解决主线程争用前就上 shiki（初始开销和 WASM 初始化不小）。先禁用 autodetect + 按需语言 + Worker 并发，测到瓶颈再迁移。
- mermaid 在 Worker：
  - 赞同“主线程渲染+并发上限+仅视区”是现实路径；补充建议：对超时渲染（如>500ms）直接降级为占位/提示并把任务排队到空闲，避免持续阻塞。
- 增量解析的“保护带”：
  - 两位都提到块边界，但需要更明确策略：列表、引用、表格至少向上/下各合并一块为受影响区，配合快照回退；否则细小编辑会频繁形成结构性错误。

3) 新的想法/建议
- 质量模式切换：
  - 提供“性能优先/精确预览”模式。性能优先下：预览降采样、复杂块延后、代码高亮延时渲染；精确模式下全量但更慢。显式权衡用户体验。
- 渐进式层级渲染：
  - 先渲染纯 markdown（无高亮/公式/图表），再分层补齐高亮/公式，最后图表。用户感知更好，且便于切片任务避免长任务。
- 指标面板与守护：
  - 内置性能 HUD（可在 dev 开启）：按键->预览延迟、长任务计数、Worker 排队长度、可见块数。超阈值自动切换到“性能模式”（扩大防抖、降低并发），保证稳定。
- 启动的关键路径缩减：
  - 只加载编辑器与最小 UI；把预览管线与语言包放到 idle 预热。确保构建产物的代码分割在 Tauri 实际生效（有一些打包器会静态合并 chunk），需要验证动态 import 是否真的按需读取。
- 缓存治理与泄漏防护：
  - 为每类缓存设硬上限与 TTL；文档切换时清理关联缓存与终止相关 Worker。增加内存监控（每隔 N 秒采样）触发清扫，防止长会话膨胀。
- 滚动/锚点稳定性：
  - 块 id 稳定映射 + ResizeObserver 回填高度 + 变更块最小化重排，减少虚拟化下的滚动跳动；标题锚点采用块级索引而非 DOM 查询。
- 风险提示与回退：
  - 引入增量解析前，保留全量解析回退开关；遇到语法边界难题或错渲染，可自动切换到全量以保证一致性。

这些补充聚焦在“控制主线程长任务、缩小消息负载、分层渲染与稳定性机制”，能在不大幅更换技术栈的前提下提升体感并降低风险。建议先以可观测+回压+分层渲染三件套落地，再推进更重的增量/后端迁移评估。

## [2026-01-23 16:27:30] Iteration 1 Decision

Understanding: 执行任务
Is Task: True

## [2026-01-23 16:27:59] Iteration 1 Discussion

=== claude ===
以下是我对该需求的专业判断与可执行建议：

1) 我对需求的理解
- 痛点本质：编辑-预览共存导致的同步渲染与解析开销过大（Markdown解析、代码高亮、DOM更新、滚动同步），叠加 React 重渲染与大文档渲染导致卡顿；启动慢主要来自重型库初始化与资源加载。
- 目标态：对大文档（几千到上万行）仍能保持编辑流畅、预览平滑，响应与启动时间接近 Typora；重点在“增量处理、并行/异步、按需渲染”。

2) 关键点与挑战
- 增量解析与块级缓存：避免每次编辑触发全量 Markdown 解析与全量预览重绘；需要可靠的“变更范围 -> 受影响块 -> 局部更新”管线。
- 语法高亮与并发：高亮器初始化、语言加载与渲染开销大；必须放到 Worker/原生侧并按需加载。
- 虚拟滚动与滚动同步：预览是可变高度、带代码块/图片的复杂 DOM，虚拟化与编辑器行号的同步映射实现难度较高。
- React 渲染控制：避免因为状态/Context传播、Key不稳定或大数组操作而导致级联重渲染；预览不宜完全交给 React diff。
- 启动路径优化：Tauri 下的主线程阻塞、JS Bundle 体积、Worker/高亮器的冷启动、语言包加载等。
- 缓存一致性与失效：块级哈希、AST缓存、图片与脚注/引用的跨块依赖导致缓存失效策略复杂。
  
3) 建议的方案/思路
总体策略：建立“增量、异步、分层”的渲染管线，最大化在后台线程进行解析与高亮，前台仅进行必要的 DOM Patch 与视口渲染。

- 架构与数据流
  - 文档分块：按段落/标题/代码围栏将文档切分为“渲染块”，维护块索引（起止行、类型、哈希）。
  - 增量更新：CodeMirror 提供变更 ranges；根据 ranges 映射到受影响块集合；仅对这些块进行解析与高亮。
  - Worker/原生解析：将 Markdown 解析与代码高亮完全放入 Web Worker 或 Tauri Rust 插件。
    - Markdown：考虑 Rust pulldown-cmark/comrak（原生或 WASM），性能更稳。
    - 高亮：Syntect（Rust原生）或 Shiki/WASM；按需加载语言包，缓存样式。
  - 预览虚拟化：使用窗口化渲染（react-virtualized/react-window 或自研）只渲染可视块，设置适度 overscan；对大图/表格懒加载。
  - DOM Patch：预览层尽量使用块级容器 + dangerouslySetInnerHTML 只更新受影响块，避免整个预览树的 React 重渲染；可在预览容器内部用原生 DOM 操作做细粒度替换（提升极端场景性能）。
  - 优先级与节流：
    - 小改动快速反馈：对短文本编辑，立即触发轻量解析（低开销路径）。
    - 重任务后台：长文档/大量改动走 requestIdleCallback、scheduler 或 React Transition，把解析放到后台，不阻塞输入。
    - 输入期节流：编辑中以 50–150ms debounce 合并解析任务；停止输入时再做深度/全块的精修。
  - 滚动同步：
    - 建立行号到块偏移映射，解析端返回块的视觉高度估计；前端用 IntersectionObserver+测量校正。
    - 同步策略：编辑滚动驱动预览（主），预览滚动驱动编辑（辅，可配置）。
  - 启动优化：
    - 代码拆分与懒加载：Marked/高亮器/语言包、预览组件按需加载；先渲染编辑器骨架。
    - 预热：应用启动后立即启动 Worker/原生解析器；从 IndexedDB 读取上次块级缓存（文件哈希校验）。
    - Tauri 配置：Release 构建、减少插件、避免主线程阻塞初始化；必要时将重型初始化放到后台。
  - React 优化：
    - 预览组件降 React 参与度，控制 props 规模与稳定性；用 useMemo/useCallback、避免 Context 广播。
    - CodeMirror 配置保持稳定，不频繁 reconfigure；关闭不必要的实时插件；利用其视口优化能力。
  - 资源与图片优化：
    - 图片懒加载（loading=lazy）、异步解码（decoding=async）；对超大图启用缩略图/占位符。
    - 代码高亮 CSS 合理压缩、减少重绘；避免复杂阴影/滤镜导致合成层抖动。
  - 度量与门槛：
    - 指标：首屏可交互 < 600ms（小文档），10k 行输入 P95 帧 > 45fps，预览更新延迟 P95 < 120ms。
    - 建立基准文档集（纯文本、大量代码、图片混合）与性能回归测试。

- 实施分阶段
  - Phase 1 Profiling：用 Chrome/React Profiler + Tauri 性能指标定位主要瓶颈（解析、高亮、React重渲染、布局）。
  - Phase 2 并行化：接入 Worker/原生解析与高亮，验证端到端吞吐提升。
  - Phase 3 增量与虚拟化：块级索引、缓存、虚拟滚动落地；滚动同步与测量校正。
  - Phase 4 启动与懒加载：代码拆分、语言包按需、缓存预热。
  - Phase 5 精修：React细节优化、CSS与图片策略、边界场景。

4) 风险与注意事项
- 缓存一致性：跨块引用（表格、脚注、列表嵌套）可能导致错误的局部更新；需要保守的失效策略（相邻块扩散、结构变更触发更大范围更新）。
- 渲染差异与安全：不同解析器（Rust vs Marked）可能在边缘 Markdown 上有差异；确保统一规则与 XSS 安全（sanitize 在 Worker/原生端完成）。
- 虚拟滚动副作用：内部锚点/目录跳转、查找定位可能需要精确高度与快速跳转支持；要提供非虚拟化回退或即时展开逻辑。
- 并发与消息传输：Worker/Tauri IPC 的序列化成本与大文本文字传输可能成为瓶颈；需要分块传输或共享内存/零拷贝策略（WASM memory、Tauri event batching）。
- 复杂度上升：管线更复杂，维护成本增加；必须配套自动化基准测试与回归用例。
- 多语言高亮加载：首次加载某语言高亮可能造成突刺延迟；需要语言预测与预热机制。

总之，核心是把“全量、同步、前台渲染”改造成“块级、增量、异步+虚拟化”的渲染架构，并把计算密集型工作移出主线程（优先 Worker，追求极致则 Rust/Tauri 原生）。按上述分阶段推进，能在不牺牲功能的前提下接近 Typora 的性能体验。

=== codex ===
以下是从实现角度的精炼看法与建议：

1) 我对需求的理解
- 目标：在 React + CodeMirror + Marked + Tauri 技术栈下，优化编辑与预览共存模式的流畅度与启动速度，接近 Typora 的体验。
- 痛点：大文档下频繁的 Markdown 解析与代码高亮导致主线程阻塞、React 组件过度重渲染、预览区域渲染过多、启动阶段前端包过大与初始化任务过多。
- 方向：降低主线程负载、减少不必要渲染、分离重任务到 Worker、增量/分块缓存、虚拟列表、懒加载与动态节流。

2) 关键点和挑战
- 高频输入时的解析与渲染抖动：每次 keypress 都触发全量解析与重渲染。
- 预览与编辑联动：滚动同步与定位需要精确的段落/块映射。
- 代码高亮的成本：高亮库加载与多语言解析在主线程易卡顿。
- 虚拟滚动的正确性：块高度估算、锚点定位与滚动偏移误差。
- 增量解析与缓存：Marked 原生不支持增量，需要自建块级 token 缓存与受影响范围计算。
- Tauri 启动慢：前端包体积、初始化时机与 Rust 侧阻塞。

3) 建议的方案/思路
- 架构分层与异步化
  - 预览管线下沉至 Web Worker：
    - 主线程只负责编辑器与轻量 UI，Markdown 解析与代码高亮在 Worker。
    - 使用 Comlink 或 postMessage 定义协议：文本变更增量（patch），返回块级渲染结果（HTML + 位置映射）。
    - 大文档仅发送变更区间（start, end, text），Worker 维护镜像文本，避免每次传全量字符串。
  - 分块模型：
    - 以“块”为单位（段落/标题块/代码块）。为每块维护内容哈希和位置范围。
    - 解析管线：变更范围 -> 计算受影响块 -> 仅重解析这些块 -> 更新块缓存 -> 通知预览层增量渲染。
    - Marked 侧使用 Lexer 先 token 化，块级缓存存 token 与生成的 HTML。
    - 代码块高亮：只对新/变更的代码块执行高亮，语言模块按需懒加载。
- React 渲染优化
  - 组件边界：EditorPane、PreviewPane 分离，避免父级状态牵连。
  - 使用 React 18 的并发特性：
    - useDeferredValue 用于预览输入值；过期时优先编辑响应，延迟预览更新。
    - startTransition 包裹预览更新，降低渲染优先级。
  - 精准避免重渲染：
    - 预览块组件按块 key（哈希）渲染，未变更块不重新挂载。
    - 使用 memo 与稳定引用（useMemo/useCallback），避免由于函数/对象新建触发渲染。
    - CSS 动画/布局最小化；避免复杂布局引发回流。
- 虚拟滚动与滚动同步
  - 预览使用 react-virtual 或自研虚拟列表，仅渲染可视区域与小范围前后缓冲。
  - 高度管理：
    - 首次渲染测量块高度缓存；文本变化时仅更新受影响块高度。
    - 代码块与图表高度变动使用 ResizeObserver 动态调整。
  - 滚动同步：
    - Editor 的行号 -> 预览块位置映射，锚点跳转采用“块顶部 + 行内偏移”估算。
    - 支持“最近块插值”：若精确行内定位复杂，优先跳到块顶，提升稳定性与性能。
- 动态节流与防抖
  - 输入事件分级处理：
    - 小文档：防抖 60–100ms。
    - 大文档：防抖 150–250ms + requestIdleCallback 在空闲时批量更新。
  - 自适应节流：
    - 根据最近解析耗时动态调整下一次防抖窗口。
  - 快速预览策略：
    - 先渲染无高亮的 HTML（占位），高亮结果到达后替换对应代码块，防止打字阻塞。
- 代码高亮优化
  - 迁移至 Worker 内高亮；语言包按需动态 import。
  - 支持两阶段高亮：
    - 阶段1：简易/通用高亮或不高亮，快速可见。
    - 阶段2：精确高亮完成后增量替换。
  - 缓存已高亮代码块（语言+内容哈希 -> HTML）。
- Markdown 解析优化（保留 Marked）
  - 使用 Marked 的 tokenizer 层提前分块，构建块 AST。
  - 维护块级 token 与 HTML 缓存；仅更新受影响块。
  - 链接/图片/表格等复杂块的渲染可单独标记为低优先级更新。
- 启动优化（Tauri + 前端）
  - 前端：
    - 代码分割与懒加载：预览、导出模块、重语言高亮在首次触发时加载。
    - Tree-shaking、移除未用依赖，压缩与 gzip/brotli 静态资源。
    - 预渲染（SSR/静态 HTML shell）快速展示编辑 UI，预览延迟加载。
  - Tauri：
    - Rust 侧初始化重任务在窗口展示后异步启动（spawn）。
    - 减少 plugin/allowlist，仅保留必要 API。
    - 生产构建（release）与优化 linker 设置；启用 AppImage/NSIS 的压缩。
- 可观测性与回归保护
  - 性能指标埋点：解析耗时、渲染耗时、主线程占用、帧率、输入延迟。
  - 大文档基准：10k/50k/100k 行测试用例自动化对比。
  - 错误恢复：Worker 崩溃与超时的回退策略（降级为无高亮预览或延长防抖）。

4) 需要注意的风险或问题
- 复杂度增加：增量解析与块映射实现难度高，需完善测试与日志。
- 渲染一致性：分块渲染可能引入边界错位、列表/表格跨块问题，块划分需谨慎。
- 滚动同步误差：预估高度与实际高度差异会导致锚点偏移，需要校正与缓冲。
- Worker 通信开销：频繁传输大字符串会造成拷贝成本，必须走增量 patch、避免全量。
- XSS 安全：Marked 输出必须进行严格的 sanitize（尤其在懒加载与增量替换时）。
- 第三方库行为差异：有些高亮库在 Worker 内不完全兼容，需要选型验证或打补丁。

总结的落地路线（建议分阶段）：
- Phase 1（快速收益）：预览防抖/过渡、React 渲染优化、代码高亮懒加载、Worker 化解析（全量传输）。
- Phase 2（稳定提升）：块级缓存与增量解析、预览虚拟滚动、滚动同步锚点映射、两阶段高亮。
- Phase 3（长期优化）：Tauri 启动优化、按需模块化、全链路监控与基准体系。

这些措施结合后，编辑时主线程压住在 UI 响应上，预览由 Worker 异步增量推进；大文档只渲染视窗内的少量块，从而整体体验接近 Typora。

=== gemini ===
以下是我从质量与风险视角对该需求的简明审查与建议。

1) 我对需求的理解
- 目标：在编辑与预览同时开启时保持流畅，显著加快应用启动速度，整体体验接近 Typora。
- 技术栈特点：React 负责 UI、CodeMirror 负责编辑器、Marked 负责 Markdown 解析、代码高亮、Tauri 提供桌面封装。性能瓶颈可能出现在前端主线程的渲染与解析密集计算、模块加载与初始化，以及大文档的滚动与资源加载。
- 约束：保持功能完整与稳定，不能因优化破坏正确性（编辑同步、预览一致性、滚动同步）。

2) 关键点与挑战
- 编辑-预览双路更新的频率与粒度：每次输入都触发全文重新解析与重渲染会导致主线程阻塞。
- React 渲染范式：过度将整个文档正文作为 React 状态导致级联重渲染；上下文/props 传递引发子树频繁更新。
- Markdown 解析与高亮的成本：Marked + 代码高亮（Prism/Highlight.js/Shiki 等）在主线程运行、且对大文档是 O(n) 工作；高亮尤其重。
- 虚拟滚动与滚动同步：预览虚拟化需要准确的块高度估算，否则会影响锚点、目录与同步滚动。
- 启动慢：首屏加载大模块（Marked、代码高亮、Mermaid/MathJax、Tauri 插件）、资源（字体、CSS）、以及初始化工作都可能阻碍冷启动。
- 跨线程与跨边界：Web Worker 与 Tauri（Rust）间的通信与序列化开销、并发控制与缓存一致性是复杂点。
- 安全与正确性：HTML 生成的安全（XSS、DOMPurify）、不同解析链（Marked vs unified/micromark）一致性。

3) 建议的方案/思路
- 基线与目标度量
  - 制定性能指标：输入延迟平均<16ms、p95<50ms；预览延迟目标200–300ms内；冷启动<1s（发布版）。
  - 加入性能埋点：Chrome Performance、React Profiler、CodeMirror 事务耗时；标注解析、高亮、渲染各阶段时间。

- 快速收益（低风险改动）
  - 降低更新频率与主线程压力：
    - 对预览解析与高亮使用防抖节流（如 150–250ms），并在空闲时（requestIdleCallback）补齐。
    - 使用 React 18 的 useDeferredValue/useTransition，让预览更新在后台进行，编辑区始终优先响应。
  - 降低 React 重渲染：
    - 不把整篇 markdown 文本作为 React 状态在组件树中层层传递；将文档源保留在 CodeMirror state，预览通过事件流或引用获取更新。
    - useMemo/useCallback 与分割组件避免无关子树更新；避免在 render 中做重计算。
  - 启动优化：
    - 按需/延迟加载重模块（Marked、代码高亮、Mermaid、MathJax），首屏只加载编辑器与最小 UI。
    - 资源优化：字体子集化、压缩、避免大型 CSS 框架；生产构建开启 minify、treeshake，Tauri 使用 release 配置。
    - 窗口策略：在资源就绪后显示窗口，减少白屏感知。

- 中期改造（中风险，显著增益）
  - Worker 化：
    - 在 Web Worker 中进行 Markdown 解析与代码高亮，主线程仅接收 HTML/DOM 片段或增量 token。
    - 高亮层建议独立 Worker，避免与解析抢资源；传输使用 transferable（如 ArrayBuffer）降低复制开销。
  - 增量与缓存：
    - 文档分块：基于段落/标题块（如按一级标题分段），仅对变更块进行重新解析与高亮，避免全文重算。
    - 缓存 AST 与高亮结果（按内容哈希）；滚动到视口时优先加载未缓存块。
  - 预览虚拟滚动与懒加载：
    - 使用 react-virtualized/react-window 或自研虚拟化容器，按块渲染预览；对图片/数学/mermaid 使用 IntersectionObserver 懒加载。
    - 高度估算策略：初期使用文本长度近似高度，渲染后回写真实高度以校准滚动。
  - 渐进渲染：
    - 预览分两阶段：快速无高亮版本先显示（占位），随后异步替换为高亮版本；保证主线程流畅。

- 深度优化（高风险，需谨慎评估与验证）
  - Rust 侧解析与高亮：
    - 使用 pulldown-cmark（Markdown）与 syntect（高亮）在 Tauri Rust 侧执行，将结果以 HTML/片段返回，可能更快更稳定。
    - 风险在于桥接与生命周期管理、平台差异与一致性；建议在大文档模式或后台批处理场景启用。
  - 改换解析链：
    - 用 micromark + mdast + rehype（unified）以获得更细粒度的增量与插件能力；与现有 Marked 渲染一致性需回归测试。
  - 预览策略切换：
    - 提供“实时/延迟预览”开关与“仅局部预览”（当前段落/当前标题）模式，给用户控制与降级路径。

- 工程与质量保障
  - 性能回归测试：构造 1–5MB 大文档（大量代码块与图片），模拟快速输入与滚动，记录延迟/内存/CPU。
  - E2E 场景：滚动同步、目录跳转、查找高亮、导出/打印；验证虚拟化与增量更新下的正确性。
  - 安全：在 Worker 或 Rust 侧完成 HTML sanitization（DOMPurify 或等价），避免每次前端二次清洗带来的性能损耗与风险。
  - 观测：加入日志与指标上报（解析耗时、渲染耗时、丢帧、内存峰值），做发布后的真实用户数据驱动优化。

4) 风险或问题
- 并发与一致性：编辑-预览的异步更新可能出现内容不同步、闪烁；需要稳健的版本/序列号机制，丢弃过时结果。
- 虚拟化副作用：滚动同步、锚点定位、目录跳转会受未渲染节点影响；需要可靠的高度估算与渲染后纠偏。
- Worker/跨边界开销：消息序列化/复制可能抵消收益；需使用可转移数据与粗粒度批处理。
- 缓存失效策略：块级缓存在快速编辑时可能频繁失效，带来复杂性与边界错误。
- 解析链变更的兼容性：Marked 与替代方案在边缘语法、扩展插件上的差异需要全面回归。
- 安全与稳定：HTML 渲染与插件（Mermaid/MathJax）在懒加载与虚拟化下可能产生竞态与 XSS 风险；必须保证 sanitization 一致且高效。
- Tauri 端改造：Rust 实现引入新依赖与平台差异，打包体积、启动流程、崩溃恢复都需要额外测试与监控。

优先级建议路径：
- 先做快速收益（防抖+并发特性+代码分割+资源优化），建立性能基线与指标。
- 再上 Worker 化与块级增量、预览虚拟化与懒加载。
- 最后评估 Rust 侧解析/高亮与解析链替换，逐步灰度上线并做回归与观测。

=== claude ===
以下是基于前面三位专家的讨论，我补充的精炼观点：

1) 之前可能遗漏的重要点
- CSS层面的硬优化：在预览块上启用 content-visibility: auto、contain（layout/paint/size）与 contain-intrinsic-size，可显著降低未入视块的布局与绘制成本，常比纯虚拟列表更稳定。
- Worker通信与拷贝成本：避免全量字符串复制，采用增量补丁协议（pos/len/text），并优先使用 SharedArrayBuffer/可转移的 ArrayBuffer；对大文档可采用分片批量传输，减少序列化阻塞。
- 预解析与惰性策略：启动后先做一次轻量“索引扫描”（标题、围栏、链接），只解析首屏所需块；其余在空闲时间渐进构建缓存，避免冷启动的全量解析。
- Sanitization位置与选型：DOMPurify不适合Worker；建议在Rust侧用 ammonia 做统一清洗，或使用纯JS的 sanitize-html 于Worker侧，确保安全与性能一致。
- 资源加载与字体策略：系统字体优先、font-display: swap，避免FOIT/重排；大型CSS框架与复杂阴影/滤镜会触发合成层抖动，尽量限制。
- 内存与缓存上限：块级 AST/高亮结果应有LRU与上限（按MB/块数），避免巨文档长期编辑导致内存膨胀与GC抖动。
- 错误与降级路径：当解析/高亮耗时超阈或Worker超时，自动切换“快速模式”（无高亮或仅当前块预览），并在空闲时恢复。

2) 对其他专家观点的补充或不同意见
- 关于解析链选择：保持 Marked 渲染层的同时，引入 micromark 仅用于块级token化与结构边界，更利于增量与一致性；这是“稳迁移”的中间路线。直接替换全链（unified）收益高但回归成本大，可灰度推进。
- Worker数量与职责划分：不建议过度拆分成多个重Worker（解析、语法高亮各一个）在CPU受限下会互抢；更推荐单“管线Worker”内设任务优先级队列，高亮可在二阶段异步执行，必要时再独立。
- 虚拟滚动实现策略：react-window对大幅度可变高度场景调优成本高；结合 content-visibility 与“锚点虚拟化”（按块估高+渲染后校准）更稳健。目录跳转和查找可采用“块顶锚点 + 行内偏移近似”，渲染后再纠偏。
- React参与度：预览层建议进一步降低React掌控范围，块级容器用原生 DOM Patch（Range/DocumentFragment 替换）能减少diff干扰，大文档下更稳定。

3) 新的具体建议
- 输入自适应调度：动态调节防抖窗口（基于最近一次解析耗时），并用 startTransition/useDeferredValue 保证编辑优先级；空闲时批量处理低优先级块（图表、表格）。
- 两阶段代码高亮：阶段1返回无高亮HTML立即渲染；阶段2在收到高亮结果后对对应代码块做原位替换，并缓存（语言+内容哈希）。
- 语言包预取：轻量索引扫描后预测语言分布，在空闲时预加载Top-N语言；首次命中未加载语言时降级为通用配色，避免打字阻塞。
- 滚动同步稳健化：建立“编辑视口中心行 -> 预览最近块顶”映射，滚动事件做节流；使用 IntersectionObserver+ResizeObserver 持续校准块高，降低锚点误差。
- 启动路径优化：首屏仅加载编辑器与最小UI，预览/高亮等模块动态import；Tauri窗口在编辑器就绪后显示，重型初始化通过Rust侧spawn异步启动。
- 观测与阈值治理：埋点解析/高亮/渲染耗时、主线程占用与丢帧率；设定降级阈值与自动切回逻辑，并输出到诊断面板，便于迭代调参。
- 安全一致性：统一在同一层（最好是Rust侧）完成HTML清洗，减少前端重复清洗与不一致风险；对Mermaid/数学公式优先KaTeX并延迟加载，Mermaid大图采取占位与点击加载。

总体取向：以“CSS内容可见性+锚点虚拟化”降低预览成本；以“单管线Worker+增量补丁”降低主线程占用与通信开销；以“自适应调度+两阶段渲染”保障输入流畅；以“统一Sanitize与LRU缓存”保障安全与内存稳态。这些改动与之前方案兼容，能在不显著增加复杂度的前提下进一步接近 Typora 的体验。

=== codex ===
下面从实现角度，补充更具体、可落地的要点与新思路，尽量简洁。

1) 之前可能遗漏的重要点
- CSS 级优化（低成本高收益）
  - content-visibility: auto + contain-intrinsic-size 为预览块设置，浏览器自动跳过视窗外的绘制与布局，显著降低回流成本；对不支持的内核（macOS WKWebView 版本差异）做特性检测与降级。
  - table-layout: fixed、will-change、contain: layout/paint 约束重排范围，特别针对大表格与长代码块。
- IPC 与文本镜像协议
  - Worker/Tauri 端维护镜像文本，主线程只发送增量 patch（start,end,text），减少序列化与复制成本；用版本号（seq）与最后提交偏移保证幂等与丢弃过期结果。
  - 文本传输采用 Uint8Array（TextEncoder）并使用 Transferable（ArrayBuffer）避免拷贝；必要时用 SharedArrayBuffer + Atomics 共享只读快照。
- 安全与性能统一
  - 将 HTML sanitize 移到 Worker 或 Rust 侧（Rust: ammonia），主线程只做挂载；保证一致的规则与零主线程占用。
- React/DOM Patch策略
  - 块级 DOM patch 用 morphdom 或自研 keyed fragment 替换，而非每次 dangerouslySetInnerHTML 整块重建；对未变更块保持节点与事件不变。
- CodeMirror 针对性优化
  - 使用 Compartment 稳定编辑器配置，避免扩展频繁 reconfigure；禁用非必要的实时插件（过度装饰、全文搜索高亮等）。
  - 只订阅必要的事务字段（docChanged、selection），避免把整篇内容塞进 React 状态。
- 并发与资源治理
  - Worker 任务池与并发上限（如 2–3），防止 CPU 饱和影响打字；解析与高亮使用优先队列（视口块 > 邻近块 > 远端块）。
  - 大图与长代码块的占位渲染 + ResizeObserver 回写真实高度，避免首次布局抖动。
- 数学/图示的替代方案
  - MathJax 改用 KaTeX（快、纯渲染），Mermaid 尽量在 Worker 或 Rust 侧预计算 SVG 片段后再挂载。

2) 对其他专家观点的补充或不同意见
- 虚拟滚动与 CSS content-visibility
  - 虚拟列表是强解，但很多预览场景用 content-visibility + contain-intrinsic-size 就能拿到80%的收益，且实现复杂度更低；两者可以并行：先启用 CSS 方案，待块高度映射成熟后再切到虚拟列表以拿到剩余收益。
- 高亮 Worker 分拆
  - 单独高亮 Worker只有在代码块密集文档上收益明显；多数场景统一 Worker +任务优先级即可，减少跨 Worker 调度与上下文成本。
- Marked 的增量化
  - 如果要做“真增量”，Marked 的 tokenizer 不够理想；建议以 micromark/mdast 作为中层逐步替换，仅在解析层做增量，渲染层保持现有 HTML（短期与长期兼容兼顾）。
- DOM 更新策略
  - 完全依赖 React diff在大文档下成本高；使用 morphdom/原生 patch可控且可观测（可量化节点替换数），更易做性能守护。
- IPC 优化细节
  - 不只是“发 diff”这么简单：需要 Transferable、批处理（合并 50–150ms 内的多次编辑为一次），以及版本号控制，缺一不可。

3) 新的想法与建议（可直接落地）
- 渐进式双通道预览
  - 快速通道：无高亮、简化 GFM 的 HTML 快速显示（<60ms），保障打字流畅。
  - 精细通道：完整高亮与插件在空闲或后台完成后块级替换；两通道用同一块哈希 key对齐，避免闪烁。
- 动态自适应节流
  - 记录最近 N 次解析耗时与主线程占用，自动调大/调小防抖窗口与 overscan；暴露开关给用户（性能优先/实时优先）。
- 语言预取与预测
  - 启动后快速扫描前 2–3 个代码围栏语言标签，预测语言包并懒加载；Shiki/Onigasm 类库预热在 idle 阶段。
- 持久化块缓存
  - IndexedDB 存储块级 HTML 与高亮结果（哈希为 key），zstd/LZ4 压缩；校验文件哈希一致后直接回放，首屏预览近似“即显”。
- 高度估算与锚点纠偏
  - 未渲染块的高度用文本长度与类型近似，渲染后写回真实高度；目录/搜索锚点跳转采用“最近块 + 行内偏移插值”，并在 next frame 做微调。
- 观察与守护
  - User Timing API 全链路埋点（parse_start/parse_end/highlight/render/apply_patch），生成 p50/p95 报表；出现超标时自动切换到轻量预览模式。
- Tauri 构建与启动
  - Rust 构建开启 lto=true、codegen-units=1、opt-level=3；前端拆分 heavy 模块（Marked、高亮、Mermaid/KaTeX）按需加载；窗口先显示编辑器骨架，Worker 在后台预热。
- 回退与隔离
  - Worker 崩溃自动重启与指数退避；超过超时阈值切到“仅当前块预览”模式，确保可用性。

以上补充主要围绕低成本 CSS 方案、严谨的跨线程协议、安全与 DOM patch细化，以及自适应与持久化策略，能在不显著增加复杂度的前提下，持续接近 Typora 的性能体验。

=== gemini ===
下面是基于前两位专家的建议，我从质量与风险角度的补充与简化结论。

1) 之前遗漏的重要点
- 内存与缓存边界
  - 块级 AST/高亮缓存需要内存上限与淘汰策略（LRU + 总量上限），避免大文档下内存膨胀与 GC 抖动。
  - Worker/主线程字符串复制与保留导致的隐性内存占用需要监控（快照 + 堆分析）。
- IPC 设计与一致性
  - 使用增量 patch + 文档版本号/序列号，主线程仅应用最新版本，丢弃过期结果；支持 AbortController 取消旧任务。
  - 传输尽量使用可转移对象/SharedArrayBuffer（Tauri 支持 COOP/COEP 时）以降低拷贝成本。
- 布局/样式层面优化
  - 在预览块上启用 CSS contain 与 content-visibility: auto，减少非视口块的样式计算与布局开销。
  - 控制复杂阴影/滤镜，避免触发频繁合成层变更；图像统一采用 decoding=async 与 lazy。
- 历史与撤销
  - CodeMirror 的事务/历史与 Worker 的文档镜像要严格一致；否则撤销/重做可能出现预览错位。
- 安全与策略统一
  - Sanitization 在 Worker/Rust 端一次性完成，避免主线程重复清洗；确保扩展（Mermaid/MathJax）在懒加载下的安全初始化与 CSP。
- 退化与自适应
  - 低性能设备/大文档自动切换“轻预览模式”（无高亮/只解析当前段落），并在空闲时补齐；依据最近耗时动态调节防抖窗口。
- 字体与资源
  - 字体子集化与 font-display: swap；避免启动阶段因字体阻塞布局与绘制。
- 度量与守护
  - 加入输入延迟/FPS/解析耗时/内存峰值的埋点，建立发布前后对比；上线灰度与回滚路径。

2) 对其他观点的补充或不同意见
- 增量解析来源
  - 若继续用 Marked，建议仅用其 tokenizer 做块划分，结合 CodeMirror 的 Lezer Markdown 语法树作结构辅助，提升“受影响范围”判断的可靠性；避免贸然更换全解析链带来的高回归风险。
- 虚拟滚动优先策略
  - 优先使用 content-visibility 作为低成本的视口外跳过机制，再在大文档下启用 react-window/react-virtual 的块级虚拟化；降低一次性引入虚拟列表的复杂度与正确性风险。
- 两阶段渲染的边界
  - “无高亮占位 → 异步替换”需确保替换为块级 DOM patch（原生替换）而非整树 React 重渲染；尽量将预览块降 React 参与度，以减少协调开销。
- Worker 拆分
  - 解析与高亮独立 Worker 并行可能带来调度竞争与额外 IPC，建议先合并一个 Worker，确认瓶颈后再拆分；避免过度并行导致资源争抢。

3) 新的想法与建议
- 文本结构与映射
  - 使用滚动哈希（如 Rabin-Karp）对块内容快速比对，降低“是否变更”的判断成本；块边界以标题/空行/围栏代码为主，跨块结构（列表/脚注）保守扩散失效。
  - 维护行号→块偏移的映射，配合 ResizeObserver 校正高度；同步滚动以编辑驱动为主，预览驱动为辅。
- 调度与背压
  - 构建单飞（single-flight）队列：解析任务合并与重排，任务过载时只保留最新；长耗时任务切至 requestIdleCallback 与低优先级。
- 设备自适应与预热
  - 启动后基于最近打开文档的语言分布预测预热高亮语言包；新文档首次打开时按需加载，减少冷启动突刺。
- 快速验证与测试策略
  - 基准集：纯文本/代码密集/图文混合 1–5MB；自动化模拟连续输入、快速滚动与频繁撤销，记录 p95 输入延迟、解析耗时、帧率与内存峰值。
  - 预览正确性：快照测试（golden HTML）与属性测试（块级边界不交叉/锚点定位误差 < 1 行）；Worker 崩溃/超时的降级（禁高亮/延迟预览）回退验证。
  - Playwright/Tauri 集成：脚本化测量关键交互延迟与渲染稳定性，形成发布门禁。

总体建议：在不更换解析链的前提下，先落地“防抖+并发优先+块级划分+content-visibility+两阶段渲染+度量”，稳步引入 Worker 与增量缓存；控制复杂度与正确性风险，用灰度与回归测试保护迭代质量。

=== claude ===
以下是我基于前述讨论的补充与精炼观点，尽量简洁：

1) 之前可能遗漏的重要点
- 文本镜像数据结构：Worker/Tauri 端建议使用 Rope/Piece Table 维护文档镜像，避免巨文档下的 O(n) 字符串拼接与复制。
- IME 组合输入保护：compositionstart/end 期间暂停预览解析与高亮，结束后一次性批处理，避免中文等输入法导致的抖动。
- 代码高亮的增量化选型：引入 Tree-sitter（WASM/Worker）进行增量语法高亮更契合“块级+增量”，比正则型高亮器更稳定；Shiki保留为离线/二阶段精细渲染。
- 跨块依赖图：为脚注、列表、引用、表格等建立简单依赖图（块→引用的目标），按变更传播失效范围，避免过度或不足的局部更新。
- 图像与大资源的异步管线：使用 createImageBitmap 与 OffscreenCanvas 在 Worker 侧做解码/缩放占位，主线程仅挂载结果，进一步降低布局/绘制负担。
- SharedArrayBuffer 与 CSP/COOP/COEP：若要启用共享内存与并行 WASM，需在 Tauri/WebView 配置好 COOP/COEP 与 CSP；否则退化为 Transferable +批量合并。
- 主题与样式切换成本：高亮与预览主题尽量基于 CSS 变量，主题切换不触发重渲染与重高亮，仅更新变量，降低样式重计算。
- 事件与调度细化：输入期解析调度采用微任务/宏任务分层（Promise vs setTimeout/requestIdleCallback），确保打字与滚动的帧优先级最高。
- 回放与撤销一致性：确保 CodeMirror 事务序列与 Worker 镜像版本严格一致；撤销/重做通过序列号对齐，防止预览错位。

2) 对其他专家观点的补充或不同意见
- 虚拟滚动 vs CSS content-visibility：赞同“先 content-visibility 再虚拟列表”的路线，但对超长表格/代码块建议块内再局部虚拟化（按行/表格段），否则单块高度过大仍影响滚动与测量。
- Worker拆分：优先单“管线Worker”+任务优先级队列，但在代码块密集文档下，树形解析（Markdown）与语法高亮（Tree-sitter/Shiki）可按优先级在同 Worker 内并行队列运行，避免多 Worker 争抢 CPU。
- Marked 增量化：继续用 Marked 渲染层可行，但块边界建议由 micromark/mdast 或 Lezer Markdown 提供，提升边界判定的可靠性；避免仅依赖 Marked tokenizer 的边界不稳问题。
- DOM 更新策略：morphdom/原生 Range+Fragment 是更可控的块级 patch路径；dangerouslySetInnerHTML 仅用于首次挂载或无事件块，减少节点重建与事件丢失。

3) 新的想法与建议
- 分层预览策略（三层渐进）：快速层（无高亮、轻GFM）→ 精细层（带高亮）→ 扩展层（Mermaid/数学、表格复杂渲染），根据设备与文档规模自适应提升；超阈值自动停留在快速/精细层。
- 自适应背压与阈值治理：基于最近 p95 解析/渲染耗时动态调整防抖窗口、overscan、并发上限；提供“性能优先/实时优先”开关。
- 语言包与模式预测：启动后用轻量扫描（前几处围栏/扩展标记）预测 Top-N 语言与扩展（Mermaid/KaTeX），idle 阶段预热，未命中时走通用占位高亮。
- 持久化块缓存与回放优化：IndexedDB + LRU + 压缩（zstd/LZ4），校验文件哈希一致后首屏直接回放可视块；滚动到新块再异步补齐，显著改善冷启动。
- 滚动同步精度校正：建立“行号→块→行内偏移”多级映射，首次用近似高度，渲染后用 ResizeObserver 写回真实高度并纠偏；跳转采用“最近块顶 + 下一帧微调”策略。
- 安全统一与扩展隔离：Sanitize 统一放在同侧（优先 Rust ammonia 或 Worker 的 sanitize-html），Mermaid/数学在扩展层延迟加载且隔离执行上下文，防止竞态与 XSS。
- 质量与发布守护：Playwright/Tauri 自动化基准（纯文本/代码密集/图文混合 1–5MB），门禁指标包含输入延迟、解析/高亮耗时、帧率、内存峰值；Worker 崩溃/超时的降级与自恢复策略灰度验证。

核心取向不变：以“块级增量+单管线异步+CSS内容可见性/局部虚拟化+两/三阶段渲染+自适应调度”构建稳健的预览管线；兼顾正确性与安全，用依赖图与统一 sanitize 降低复杂度与风险。上述补充在现有方案之上可逐步落地，风险可控、收益显著。

=== codex ===
以下是我在实现层面的简明补充，聚焦可落地方案。

1) 之前可能遗漏的重要点
- Tauri 的跨源隔离与传输优化
  - 若设备/平台允许，开启 COOP/COEP 以使用 SharedArrayBuffer，减少主线程↔Worker的大字符串复制；不支持时至少使用 Transferable 的 ArrayBuffer（TextEncoder → Uint8Array）并合并 50–150ms 内的编辑为一次批量 patch。
  - IPC 协议必须带 docVersion/seq 与 AbortController 标识，主线程只应用最新结果并可取消过期任务。
- CodeMirror 侧的精细开销控制
  - 使用 Compartment 固定扩展组合；只订阅必要事务（docChanged/selection），避免把全文当成 React 状态传递。
  - Decoration 限流：避免对整文高密度 inline 装饰；仅视口 + 轻量标记，复杂装饰移到预览。
  - 历史一致性：Worker 镜像文本与 CodeMirror 历史一致（按事务增量应用），否则撤销/重做会造成预览漂移。
- 低成本的图像/媒体管线
  - 大图用 createImageBitmap + decoding=async + lazy，必要时 Worker + OffscreenCanvas 做缩略/采样，预览先显示占位，真实高度用 ResizeObserver 回写。
- 资源与语言包预热细节
  - Onigasm/Shiki 的 WASM 用 streaming instantiate 预热；语言包按首屏代码围栏预测预取 Top-N，未命中语言先走“通用配色”占位。
- CSS 与布局的守护
  - 系统字体优先、font-display: swap；对大表格使用 table-layout: fixed；预览块统一加 content-visibility: auto + contain: layout/paint + contain-intrinsic-size，减少不在视口的样式/布局开销。

2) 对其他观点的补充或不同意见
- 解析链的“稳迁移”路径
  - 不建议短期全换 unified。可保留 Marked 渲染层，加入 micromark/mdast 做块级 token 化与结构边界识别，仅在解析层实现增量；渲染一致性风险最低。
- Worker 数量与职责
  - 优先单“管线 Worker”（解析+高亮+sanitize），内部任务按优先级队列调度（视口块 > 邻近块 > 远端块）；确认代码块密集型文档仍瓶颈后，再考虑拆出独立高亮 Worker，避免早期过度并发导致资源争抢。
- 预览更新策略
  - 大文档场景下完全依赖 React diff 成本高；建议块级容器采用原生 DOM Patch（Range/DocumentFragment 或 morphdom），React 只管理块列表与 key，未变更块保持节点稳定，减少协调与重排。

3) 新的想法与建议（可直接落地）
- 增量管线的数据结构与协议
  - BlockStore（主线程与 Worker 各一份镜像）：
    - block: {id, type, startLine, endLine, hash, estHeight}
    - 索引：行号→block 映射，支持快速查找受影响块。
  - Patch 消息：
    - {seq, docVersion, changes: [{from, to, insertedBytes}], hint: 'fast'|'full'}
    - Worker 侧应用 patch→计算受影响块→仅重解析这些块→返回 [{id, html, hash, estHeight, highlightStage}]。
  - 主线程 DOM Patch：
    - 根据返回的 id 定位块容器，先插入“快速通道”HTML（无高亮），待 highlightStage=2 再原位替换。
- 自适应调度与防抖
  - 记录最近 N 次解析/高亮耗时，动态调节防抖窗口（60–250ms）与 overscan；长耗时自动降级“轻预览模式”（仅当前段/无高亮），空闲时补齐。
  - React 18：预览更新走 startTransition + useDeferredValue，编辑交互始终优先。
- 虚拟化的轻重两级
  - 先启用 CSS content-visibility + contain-intrinsic-size（快速收敛到 60–80% 收益）；块高度映射稳定后，再在大文档开启 react-window 的块级虚拟化，渲染范围为视口±overscan。
- 锚点与滚动同步
  - 解析时对标题/段落生成 data-line/data-block 属性；编辑滚动→预览滚动采用“最近块顶 + 行内偏移插值”，渲染后下一帧用 ResizeObserver 校正。
- 安全统一与缓存治理
  - Sanitize 统一在 Worker/Rust 端（JS: sanitize-html 或 Rust: ammonia）；主线程仅挂载清洗后的片段。
  - 高亮与 HTML 缓存采用 LRU（按 MB/块数），并持久化到 IndexedDB（key=docHash+blockId+hash），启动时校验 docHash 后直接回放首屏块。
- 可观测性与门槛控制
  - 使用 UserTiming API 埋点 parse_start/end、highlight_start/end、render/apply_patch；统计 p50/p95 并在超阈时自动降级。
  - 提供开发者面板显示：输入延迟、解析耗时、主线程占用、内存峰值与当前模式（标准/轻预览）。

以上建议优先落地顺序：防抖 + React 并发特性 → 单 Worker 管线 + 增量 patch 协议 → CSS content-visibility/contain → 两阶段高亮 → LRU + IndexedDB 块缓存 → 虚拟列表与滚动同步精修。这样能在实现复杂度可控的前提下，显著压低主线程负载与不必要渲染，快速接近 Typora 的体验。

=== gemini ===
下面是我基于质量与风险视角的简要补充。

1) 之前遗漏的重要点
- 跨源隔离与内存/通信
  - SharedArrayBuffer 等性能优化需要 COOP/COEP；在 Tauri 的 asset 协议下需明确配置响应头，否则相关优化不可用且行为不一致。
  - Worker 内镜像字符串的生命周期与释放策略（避免闭包持有大字符串、及时切片/复用缓冲区），否则易出现隐性内存泄漏与 GC 抖动。
- I/O 与启动路径
  - 大文件读取与初始索引应在 Rust 端分片异步读取（线程池），避免一次性把整文件读入内存；Windows 上注意代码签名与 Defender 扫描对冷启动的影响。
  - Worker 打包与加载：独立 bundle、持久缓存、避免 blob URL 动态创建的冷启动开销。
- 事件与滚动性能
  - scroll/wheel/touchmove 使用 passive 监听器；测量与 DOM 读写在 rAF 内分帧执行，降低布局抖动。
  - 大量滚动/输入时的背压策略：明确任务丢弃规则，仅保留最新 seq，避免队列堆积。
- 可访问性与可见性成本
  - 对非交互预览节点使用 aria-hidden 降低可访问树体积；目录/查找聚焦时再临时开启。
  - 在不支持 content-visibility 的内核做能力检测与降级策略（低端设备仅渲染当前段落），避免跨浏览器行为差异。
- 安全与策略统一
  - Trusted Types + 单点 sanitize（Worker/Rust侧）统一策略，减少主线程危险 HTML 处理与重复清洗。
- 监控与长任务
  - 使用 PerformanceObserver 采集 long tasks，建立输入延迟与主线程占用的门槛报警；引入布局偏移（CLS）与渲染抖动指标，防止优化引入新的体验问题。

2) 对其他观点的补充或不同意见
- Worker 拆分程度
  - 不建议早期拆分“解析/高亮”两个重 Worker；优先单管线 + 任务优先级，待瓶颈明确再拆分，避免 CPU 抢占与 IPC 成本上升。
- 虚拟滚动优先序
  - content-visibility 是低成本首选；虚拟列表作为面向极端大文档的增强。建议双路并存但按设备能力与文档大小自适应选择，以降低实现复杂度与正确性风险。
- 解析链演进路径
  - 延续 Marked 渲染层的同时，用 micromark/Lezer 仅做块级 token 化与受影响范围判定，是更稳健的中间态；直接迁全链的风险与回归成本较高。
- DOM 更新策略
  - React 参与度进一步收敛到块容器边界，块内采用原生 DOM patch/morphdom 替换，能更可控地限制重渲染面并便于度量。

3) 新的想法与建议
- 自适应调度与“工作预算”
  - 基于最近 N 次解析/高亮耗时与 long tasks 比例，动态调整防抖窗口、overscan 与任务并发上限；连续打字>1s时暂停非必要任务（高亮/远端块），空闲再补。
- 两阶段预览守护
  - 快速通道先返回简化/无高亮 HTML；精细通道高亮完成后块级原位替换，并以哈希校验避免闪烁与错替。
- 持久化与预热
  - IndexedDB 持久化块级 HTML/高亮（哈希键，压缩存储），冷启动直接回放首屏块；基于上次文档语言分布做高亮语言包预热。
- IPC 协议细化
  - 增量 patch 使用可转移 ArrayBuffer（TextEncoder），合并 50–150ms 内多次编辑；引入 AbortController 取消过时任务与单飞（single-flight）去重。
- 资源与样式治理
  - 语言包白名单最小化（只加载命中的 Top-N），替代 onigasm 等重正则引擎的懒加载；字体子集化 + font-display: swap，避免首屏 FOIT。
- 质量门禁与灰度
  - 在 CI 加入 p95 输入延迟、预览延迟、内存峰值与 long tasks 比例的门槛测试；通过特性开关灰度上线 Worker/增量解析与虚拟化，出现超标自动降级。
- 崩溃与退化
  - Worker 设定内存/耗时阈值与自动重启、指数退避；达到阈值切换“仅当前块预览/无高亮模式”，保障可用性。

这些补充聚焦于跨源隔离、事件/IPC细节、持久化与自适应调度、以及质量门槛与降级路径，能在不显著增加复杂度的前提下进一步降低风险并提升整体体验。

## [2026-01-23 16:27:59] Iteration 1 Decision

## [2026-01-23 16:55] Step 5 - 增量 patch 协议架构规范 (Agent: claude)
- 已完成 Step 5 架构规范，详见 .ralph_logs/STEP5_claude_architecture.md
- 下一步（codex）：实现 Worker 镜像文本（Piece Table）、Patch 协议与增量块渲染；接入 Editor 的 changes 与 VirtualPreview 的块级 patch 应用；完成一致性/性能测试。

Understanding: 目标是在 React + CodeMirror + Marked + Tauri 技术栈下，解决编辑与预览共存导致的卡顿与启动慢问题，体验靠近 Typora。核心瓶颈在于主线程上同步、全量的 Markdown 解析与代码高亮、React 级联重渲染、预览区域的过度渲染，以及启动阶段重模块加载。共识方案是构建“块级、增量、异步”的渲染管线：将解析与高亮移至 Worker/Tauri 原生；采用增量 patch 协议与块级缓存；用 CSS content-visibility/contain 降低非视口开销，并在成熟后引入块级虚拟滚动；两阶段渲染（无高亮快速占位→异步替换精细高亮）；自适应防抖与优先级调度保障编辑流畅；统一 sanitize 与持久化缓存；同时优化启动路径与度量/回归测试，提供降级与灰度控制。
Is Task: True
