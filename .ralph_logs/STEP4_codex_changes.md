# Step 4 - Worker 管线 MVP（全量传输）变更记录（Agent: codex）

时间：2026-01-23 00:30
目录：/Users/cgy/wkgit/md.ai

本次改造目标：将 Markdown 解析与代码高亮迁移至单“管线 Worker”，主线程仅挂载结果；在 Worker 内统一进行 HTML sanitize。实现版本序列号，主线程只应用最新结果。

具体变更：
- 新增 src/workers/pipeline.worker.ts
  - 解析：parseMarkdownToBlocks + parseMarkdown（marked + highlight）在 Worker 执行
  - 返回：每块 {id,type,content,level,html,startLine,endLine} 与耗时 renderTime
  - 安全：sanitizeHtml 去除 <script>/<iframe>/<style> 标签、移除 on* 事件属性、替换 javascript: URL
- 新增 src/hooks/usePipelineWorker.ts
  - 单例模块 Worker，管理 requestId（seq）与 onmessage 路由
  - API：自动根据 content 触发 render；返回 {blocks,isRendering,renderTime}
- 改造 src/components/Preview/VirtualPreview.tsx
  - 引入 usePipelineWorker 消费块级 HTML，删除主线程 parseMarkdown；BlockRenderer 使用 block.html
  - 估高：estimateBlockHeight 基于 block.content/type/level
- 改造 src/components/Preview/Preview.tsx
  - 通过 usePipelineWorker 获取全文块并拼接 html；保留 parseMarkdown 作为回退路径

后续计划：
- 将 KaTeX 的 renderToString 迁移至 Worker（当前仍在主线程异步装配）
- 为 usePipelineWorker 加入 Abort/CANCEL 与版本化（目前仅丢弃过期 id）
- 开始 Step 5 增量 patch 协议（from/to/inserted），减少 IPC 体积并维护镜像文本

风险与注意：
- Mermaid 仍需主线程渲染；维持按需与可视区懒渲染策略
- sanitizeHtml 为简版，后续建议替换为 sanitize-html 或 Rust ammonia（统一且更安全）
- 需在生产构建下评估 Worker 冷启动与总耗时，调整 debounce 与并发策略