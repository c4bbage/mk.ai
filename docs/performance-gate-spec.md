# 性能门禁与降级/恢复策略规范（Step 12）

本规范定义：
- 可观测性埋点与性能面板的最小集合
- CI 性能门禁（perf:gate）执行方式与阈值
- 运行时降级/恢复策略与开关

1. 可观测性（Performance.mark/measure）
- 输入链路：editor_input → schedule_preview → worker_parse_start/end → preview_commit_start/end
- 块渲染：block_render_start:{id}/end:{id}（VirtualPreview 中已接入）
- 滚动与 FPS：使用 perf-sampler.ts 在测试页采样（生产环境不启用）
- 启动链路：app_boot_start → first_interactive（待接入 main.tsx 与 Editor 初始可用点）

2. CI 性能门禁
- 命令：npm run dev（另起终端）后执行 npm run perf:gate
- 数据来源：scripts/run-perf-tests-puppeteer.mjs 自动打开 performance_tests/index.html 运行四类测试并输出 JSON
- 默认阈值（scripts/perf-gate.mjs）：
  - 启动 mountMs ≤ 1000ms
  - 解析 parseMs ≤ 800ms
  - 输入平均 inputAvgMs ≤ 250ms
  - 滚动 p95 帧 dt ≤ 20ms，平均 FPS ≥ 45
  - 堆内存峰值 ≤ 200MB（浏览器支持时）
- 失败时 gate 退出码为 1，中断 CI；通过时输出报告与 PASSED。

3. 降级/恢复策略
- 运行时开关（src/stores/runtime.ts）：
  - previewMode: 'full' | 'light' | 'current_block_only'
  - disableHighlight: 是否关闭二阶段高亮请求
  - workerAutoRestart: Worker 错误/超时自动重启（usePipelineWorker 已接入 watchdog）
- 集成到 VirtualPreview：
  - light 模式下 IntersectionObserver 的 rootMargin 缩小为 50px，减少预渲染量
  - 当 disableHighlight=true 时，不触发 requestHighlight（降低 CPU）
- Worker 自恢复：
  - onerror 自动重启；渲染超过 5s 未响应时 watchdog 重启并重试一次。

4. 后续接入建议
- Playwright/Tauri 端到端门禁（待建）：真实应用里跑 Editor+VirtualPreview，收集 P50/P95 输入端到端、长任务比例、CLS/FPS。
- 长任务比例与 CLS：在真实页面用 PerformanceObserver 采集并记录到面板，CI 中做阈值校验。
- 性能面板 HUD：开发模式显示最近一次 parse/commit 耗时与 FPS；当前已在控制台输出基础指标。

5. 验收
- 通过 perf:gate 的默认阈值（或在 CI 中根据项目目标调整 THRESHOLDS）。
- 降级开关生效且能有效降低重计算与 DOM 更新量；Worker 在异常/超时场景能自恢复。
