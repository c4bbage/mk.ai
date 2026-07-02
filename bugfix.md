# MD.AI Bugfix & Optimization Log

All fixes and optimizations are recorded here in chronological order.

---

## [P0-#1] 修复导出 HTML XSS 漏洞
- **文件**: `src/lib/export.ts`
- **问题**: `generateFullHTML` 和 `copyForWeChat` 直接将 `parseMarkdown()` 的结果嵌入 HTML，未经 sanitize。恶意 Markdown 中的 `<script>` 标签会原样写入导出文件，导致存储型 XSS。
- **修复**: 引入 `sanitizeMarkdownHtml`，在导出 HTML 和复制公众号格式前对 HTML 进行消毒。
- **状态**: 已完成

---

## [P0-#2] 统一 Worker 与主线程 sanitize 配置
- **文件**: `src/workers/pipeline.worker.ts`, `src/hooks/usePipelineWorker.ts`
- **问题**: Worker 中内联定义了一套窄白名单 sanitize 配置（缺少 `del`, `s`, `sup`, `sub`, `u`, `mark`, `details`, `summary`, `input`, `label`, `hr` 等标签），与 `src/lib/sanitize.ts` 中的共享配置不一致。大文档走 VirtualPreview → pipeline worker 路径时，删除线、下划线、上下标、任务列表等语法被静默丢弃。
- **修复**: Worker 和 usePipelineWorker fallback 路径统一引入 `sanitizeMarkdownHtml`，删除内联 sanitize 配置。
- **状态**: 已完成

---

## [P0-#3] 修复 Editor 字体变化导致全量重建
- **文件**: `src/components/Editor/Editor.tsx`
- **问题**: 初始化 useEffect 依赖数组包含 `fontSize`，每次字号变化都会销毁 EditorView 并重建，丢失光标位置和 undo 历史。同时 Compartment reconfigure useEffect 又会做一次重复配置。
- **修复**: 初始化 useEffect 改用 `fontSizeRef.current` 读取字号，从依赖数组中移除 `fontSize`，仅靠 Compartment reconfigure 处理字号变化。
- **状态**: 已完成

---

## [P1-#6] App.tsx 使用 selector 优化重渲染
- **文件**: `src/App.tsx`
- **问题**: 从 `useEditorStore()` 中解构所有字段，任意 store 变化（包括 content 高频更新）都触发 App 重渲染，进而波及 Toolbar 等子组件。
- **修复**: 改为 `useEditorStore(s => s.xxx)` 选择性订阅每个字段；Toolbar 用 `memo` 包裹，避免 content 变化时 Toolbar 无意义重渲染。
- **状态**: 已完成

---

## [P1-#7] Worker 复用 Renderer 实例
- **文件**: `src/workers/pipeline.worker.ts`
- **问题**: `handleRender` 在 `blocks.map` 循环内每个块都 `new Renderer()`，造成不必要的对象分配和 GC 压力。
- **修复**: 将 Renderer 创建提到循环外，所有块共用同一实例。
- **状态**: 已完成

---

## [P1-#8] 接入增量更新 (contentHash 合并)
- **文件**: `src/hooks/usePipelineWorker.ts`
- **问题**: 每次 content 变化都全量替换 blocks，即使大部分块内容未变。BlockRenderer 虽有 memo，但由于 blocks 数组是新对象，所有块都会被重新 patch DOM。
- **修复**: 在 `handleWorkerMessage` 中基于 `contentHash` 做增量合并——未变化的块保留其已渲染/高亮的 html，避免不必要的 DOM patch。
- **状态**: 已完成

---

## [P0-#4] 配置 Tauri CSP 策略
- **文件**: `src-tauri/tauri.conf.json`
- **问题**: `security.csp` 为 `null`，无内容安全策略，容易遭受 XSS 注入攻击。
- **修复**: 配置 CSP，限制 default-src 为 'self'；img-src 允许 data/https/http/blob/asset；style-src 和 script-src 允许 'unsafe-inline'（应用大量使用内联样式和动态脚本）；font-src 允许 data；connect-src 允许 ipc。
- **状态**: 已完成

---

## [P0-#5] 收窄文件系统权限 scope
- **文件**: `src-tauri/capabilities/default.json`
- **问题**: fs scope 包含 `**` 和硬编码的全盘路径（`/Users/**`, `/Volumes/**`, `C:\\**` 等），允许读写任意路径，存在安全风险。
- **修复**: 移除 `**` 和硬编码全盘路径，仅保留用户目录（`$HOME`, `$DOCUMENT`, `$DESKTOP`, `$DOWNLOAD`）和应用目录。
- **状态**: 已完成

---

## [P1-#9] Outline 复用已解析 blocks
- **文件**: `src/components/Outline/Outline.tsx`
- **问题**: Outline 每次内容变化都逐行遍历全文提取标题，未复用已有的块级解析器。
- **修复**: 改用 `parseMarkdownToBlocks` 复用块级解析，仅过滤 `type === 'heading'` 的块。
- **状态**: 已完成

---

## [P1-#10] BlockStore 二分查找
- **文件**: `src/lib/block-store.ts`
- **问题**: `getBlockAtLine` 和 `getRange` 使用线性扫描（`Array.find` / `filter`），大文档性能差。
- **修复**: 改为二分查找，利用 metas 按 startLine 有序的特性。
- **状态**: 已完成

---

## [P1-#11] Vite optimizeDeps 移除懒加载模块
- **文件**: `vite.config.ts`
- **问题**: `optimizeDeps.include` 和 `manualChunks` 中包含 `mermaid` 和 `katex`，但它们是动态 `import()` 懒加载的。预打包和强制分块会抵消懒加载效果，增大首屏开销。
- **修复**: 从 `optimizeDeps.include` 和 `manualChunks` 中移除 `mermaid` 和 `katex`，让 Vite 自然生成动态导入 chunk。
- **状态**: 已完成

---

## [P1-#12] 实现真正虚拟滚动
- **文件**: `src/components/Preview/VirtualPreview.tsx`
- **问题**: 虽有 IntersectionObserver 懒渲染，但所有 block 的 DOM 节点都会挂载（仅内容用占位符）。超长文档（1000+ 块）DOM 节点数本身就是瓶颈。
- **修复**: 重写为基于 scrollTop + viewportHeight 的虚拟滚动：预计算每块估算高度和累计偏移，二分查找可见范围，仅渲染视口内 + overscan 的块。使用 spacer div 维持滚动条高度，ResizeObserver 监听视口变化。
- **状态**: 已完成

---

## [P1-#13] 修复大纲点击无响应
- **文件**: `src/App.tsx`
- **问题**: `<Outline>` 未传 `onItemClick`，用户点击大纲标题无任何跳转。
- **修复**: 添加 `handleOutlineClick` 回调，根据标题索引找到行号，同时滚动编辑器和预览到对应位置。
- **状态**: 已完成

---

## [P2-#14] 删除死代码
- **文件**: 删除 `src/hooks/useMarkdownWorker.ts`, `src/workers/markdown.worker.ts`, `src/hooks/useScrollSync.ts`, `src/lib/block-store.ts`, `src/lib/block-diff.ts`, `src/lib/perf-observer.ts`, `src/lib/block-store.test.ts`；更新 `src/hooks/index.ts` 移除导出；清理 `src/App.tsx` 中注释掉的 perf-observer 代码。
- **问题**: 7 个文件/模块从未被实际使用（或已被替代），增加维护负担和打包体积。
- **修复**: 删除所有死代码文件，清理引用。保留 `perf-sampler.ts`（被 performance_tests 引用）。
- **状态**: 已完成

---

## [P2-#15] 抽取共享占位符保护逻辑
- **文件**: 新建 `src/lib/placeholders.ts`；修改 `src/lib/markdown.ts`, `src/workers/pipeline.worker.ts`
- **问题**: math/mermaid/code 占位符保护与还原逻辑在 `markdown.ts` 和 `pipeline.worker.ts` 中几乎完全重复。
- **修复**: 抽取为 `protectSpecialBlocks` 和 `restoreSpecialBlocks` 两个共享函数，两处统一引用。
- **状态**: 已完成

---

## [P2-#16] 统一主题配置引用
- **文件**: `src/themes/index.ts`, `src/lib/export.ts`
- **问题**: `export.ts` 中硬编码了主题颜色（`getWeChatInlineTheme` 和 `getThemeStyles`），与 themes 模块定义重复。
- **修复**: 在 themes 模块导出 `THEME_COLORS` 和 `getThemeColors`，export.ts 统一引用。
- **状态**: 已完成

---

## [P2-#17] 删除重复 Tauri lib.rs
- **文件**: 删除 `src-tauri/src/lib.rs`
- **问题**: `lib.rs` 和 `main.rs` 定义了完全相同的 Tauri builder。lib.rs 仅为 mobile 入口，当前项目不支持 mobile。
- **修复**: 删除 `lib.rs`，仅保留 `main.rs` 作为桌面端入口。
- **状态**: 已完成

---

## [P2-#18] 添加设置持久化
- **文件**: `src/stores/editor.ts`
- **问题**: 用户偏好（主题、字号、面板状态等）在每次重启后重置为默认值。
- **修复**: 使用 zustand `persist` 中间件，将用户偏好持久化到 localStorage（key: `md-ai-settings`）。仅持久化偏好设置，不持久化文档内容和文件状态。
- **状态**: 已完成

---

## [P2-#19] PDF 导出监听 load 事件
- **文件**: `src/lib/export.ts`
- **问题**: PDF 导出使用固定 500ms 延迟等待 iframe 加载，大文档可能不够，小文档浪费时间。
- **修复**: 改为监听 iframe `load` 事件，配合 3s 超时兜底，已加载完成时立即触发打印。
- **状态**: 已完成

---

## [P2-#20] 图片 URL 内存泄漏修复
- **文件**: `src/lib/image.ts`, `src/App.tsx`
- **问题**: `url` 策略中 `URL.createObjectURL(file)` 创建的 object URL 从不调用 `URL.revokeObjectURL`，长期使用泄漏内存。
- **修复**: 添加 `createdObjectUrls` 追踪集合和 `revokeObjectUrls` 清理函数，在打开新文件时调用清理。
- **状态**: 已完成

---

## [P3-#21] Tauri 插件动态导入
- **文件**: `src/lib/file.ts`, `src/lib/export.ts`
- **问题**: Tauri 插件（`@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`）在模块顶层 `import`，Web 环境下模块加载会报错。
- **修复**: 改为 `await import()` 动态导入，仅在 `isTauri()` 为 true 时加载 Tauri 插件。
- **状态**: 已完成

---

## [P3-#22] ESLint 忽略构建产物
- **文件**: `eslint.config.js`
- **问题**: ESLint 未配置忽略 `src-tauri/target/`、`src-tauri/gen/`、`performance_tests/`，导致扫描二进制文件报解析错误。
- **修复**: 在 `globalIgnores` 中添加 `src-tauri/target`、`src-tauri/gen`、`performance_tests`。
- **状态**: 已完成

---

## [P3-#23] estimateBlockHeight block scoping
- **文件**: `src/lib/markdown-blocks.ts`
- **问题**: `switch` 语句 `case 'heading'` 中 `const level` 没有 block scoping，可能导致变量泄漏。
- **修复**: 用 `{}` 包裹 case 体，创建独立的块级作用域。
- **状态**: 已完成

---

## [P3-#24] Toast 封装为 React 组件
- **文件**: 新建 `src/components/Toast/Toast.tsx`；修改 `src/main.tsx`, `src/App.tsx`
- **问题**: `handleCopyWeChat` 手动 `document.createElement('div')` 创建 toast，不符合 React 范式。
- **修复**: 创建 `ToastProvider` + `useToast` Context 组件，在 main.tsx 包裹应用，App.tsx 中用 `showToast()` 替代手动 DOM 操作。
- **状态**: 已完成

---

## [P3-#25] 移除 sharp 运行时依赖
- **文件**: `package.json`
- **问题**: `sharp` 是 Node.js 图像处理库，不应出现在 Tauri/web 应用的运行时 `dependencies` 中。
- **修复**: 从 `dependencies` 中移除 `sharp`。
- **状态**: 已完成

---

# Typora 风格改造

## [Typora-#1] Tauri 原生菜单栏实现
- **文件**: `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`
- **问题**: 文件操作、格式化、视图切换、主题选择全部塞在自定义 Toolbar 中，不像 Typora 那样使用原生 OS 菜单栏。
- **修复**: 用 Tauri 2 Menu API 构建 6 个原生菜单：File（新建/打开/保存/另存/导出/复制公众号）、Edit（撤销/重做/剪切/复制/粘贴/查找）、Format（加粗/斜体/下划线/删除线/代码/链接/标题1-6）、View（切换源码预览/大纲/文件树/缩放/自动保存）、Theme（GitHub/微信优雅橙/微信清新绿/微信科技蓝）、Help（关于）。菜单事件通过 `emit("menu-event")` 发送到前端。
- **状态**: 已完成

---

## [Typora-#2] 前端菜单事件监听 hook
- **文件**: 新建 `src/hooks/useMenuEvents.ts`
- **问题**: 需要前端接收原生菜单事件并分发到对应操作。
- **修复**: 创建 `useMenuEvents` hook，监听 Tauri `menu-event`，定义 `MenuAction` 类型联合，在 App.tsx 中通过 `handleMenuAction` 统一处理。Web 模式下自动跳过（键盘快捷键回退）。
- **状态**: 已完成

---

## [Typora-#3] 移除 Toolbar 组件，全屏编辑/预览
- **文件**: 删除 `src/components/Toolbar/`、`src/components/ThemeSelector/`；重写 `src/App.tsx`
- **问题**: 自定义 Toolbar 占据顶部 48px，文件菜单、文件名、主题选择器、字号按钮全挤在一起，不符合 Typora 简洁设计。
- **修复**: 完全移除 Toolbar 和 ThemeSelector 组件，App.tsx 不再渲染工具栏。app-content 直接占满窗口，编辑器/预览区全屏展示。菜单操作改为原生菜单事件 + 键盘快捷键双通道。
- **状态**: 已完成

---

## [Typora-#4] 窗口标题栏显示文件名
- **文件**: `src/App.tsx`
- **问题**: 文件名显示在自定义 Toolbar 中，不像 Typora 那样在窗口标题栏展示。
- **修复**: 添加 `useEffect` 设置 `document.title` 为 `●文件名 — MD.AI`（修改时前缀 ●），利用原生窗口标题栏显示。
- **状态**: 已完成

---

## [Typora-#5] 主题切换移至原生菜单
- **文件**: `src-tauri/src/main.rs`, `src/App.tsx`
- **问题**: 主题选择器是横向滑动组件占据右上角，不够 Typora。
- **修复**: 主题切换移至原生 Theme 菜单（GitHub/微信优雅橙/微信清新绿/微信科技蓝），通过菜单事件触发 `setTheme`。
- **状态**: 已完成

---

## [Typora-#6] 字号/视图切换移至原生菜单
- **文件**: `src-tauri/src/main.rs`, `src/App.tsx`
- **问题**: 字号 +/- 按钮和视图切换按钮在 Toolbar 中。
- **修复**: 字号移至 View 菜单 Zoom In/Out/Reset（CmdOrCtrl+=/-/0）；视图切换移至 View 菜单 Toggle Source/Preview（Cmd+/）、Toggle Outline（Cmd+\）、Toggle File Tree（Cmd+Shift+\）。
- **状态**: 已完成

---

## [Typora-#7] 设置项移至菜单
- **文件**: `src-tauri/src/main.rs`, `src/App.tsx`
- **问题**: 图片存储策略和自动保存在齿轮下拉菜单中。
- **修复**: 自动保存移至 View 菜单 Toggle Auto Save；图片存储策略暂保留为代码内默认值（assets），后续可通过 Preferences 对话框配置。
- **状态**: 已完成

---

## [Typora-#8] Web 模式键盘快捷键回退
- **文件**: `src/App.tsx`
- **问题**: Web 模式下无原生菜单，需要键盘快捷键作为回退方案。
- **修复**: 保留完整的键盘快捷键处理：Cmd+N（新建）、Cmd+O（打开）、Cmd+S（保存）、Cmd+Shift+S（另存）、Cmd+/（切换源码预览）、Cmd+\（大纲）、Cmd+Shift+\（文件树）、Cmd+Shift+C（复制公众号）、Cmd+=/-（缩放）、Cmd+B/I/U/K/`（格式化）、Cmd+1-6/0（标题级别）。
- **状态**: 已完成

---

## [Typora-#9] CSS 清理与布局适配
- **文件**: `src/App.css`, `src/components/Editor/Editor.css`, `src/components/Preview/Preview.css`
- **问题**: 液态玻璃效果（渐变背景、backdrop-filter、圆角卡片、阴影）不符合 Typora 简洁风格。
- **修复**: 重写为 Typora 风格——纯白背景、无渐变、无毛玻璃、无边框圆角；面板间用 1px 细线分隔；单面板模式限制 900px 最大宽度居中；编辑器行号低调半透明；滚动条 6px 极简。暗色模式同步适配。
- **状态**: 已完成

---

## [Bugfix] 导出 PDF 崩溃
- **文件**: `src/lib/export.ts`, `package.json`
- **问题**: Tauri 的 WebView（macOS WKWebView）不支持 `window.print()`，在 iframe 中调用 `iframe.contentWindow.print()` 会导致应用崩溃。同时 CSP `default-src 'self'` 也会阻止 iframe 的 `about:srcdoc` 内容。
- **修复**: Tauri 环境下改为写入临时 HTML 文件（`tempDir/mdai-export-*.html`），通过 `@tauri-apps/plugin-shell` 的 `open()` 在系统默认浏览器中打开，由浏览器提供打印功能。Web 环境保留 iframe 打印方案。新增 `@tauri-apps/plugin-shell` JS 依赖。
- **状态**: 已完成

