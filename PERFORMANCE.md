# PERFORMANCE.md

注意：本文件由 Gemini（测试/验证）补充了测试运行说明，结合 docs/ 与 performance_tests/ 一起使用。

本文件定义需要收集与持续监控的性能指标，以及在开发模式下的埋点规范与使用方式。

一、核心指标（与验收标准对齐）
- 输入延迟（大文档）：P50/P95/P99 < 50ms
- 预览滚动帧率：稳定在 >= 60fps
- 应用启动时间：< 2s（从 app_boot_start 到 first_interactive）
- 内存占用：正常文档 < 200MB 峰值

二、关键埋点（Performance.mark/measure）
- 输入链路
  - 'editor_input'：收到键盘输入事件
  - 'schedule_preview'：进入防抖/调度队列
  - 'worker_parse_start' / 'worker_parse_end'：Worker 解析的起止
  - 'preview_commit_start' / 'preview_commit_end'：预览 DOM 提交的起止
- 块级渲染
  - 'block_render_start:{id}' / 'block_render_end:{id}'
  - 分类统计：code/math/mermaid/paragraph 等
- 滚动链路
  - 'scroll_sync'：每帧（或节流后）记录一次，配合 rAF 计算 FPS
- 启动链路
  - 'app_boot_start'：main.tsx 最开始
  - 'first_interactive'：编辑器可输入时刻

三、开发模式下的展示
- 在 import.meta.env.DEV 下：
  - 控制台输出 console.table：最近 N 次输入端到端延迟、解析耗时、预览 commit 时长
  - 顶部右上角显示轻量 HUD：当前 FPS、最近一次输入端到端耗时

四、实现建议
- 封装 util：perf.mark(name)、perf.measure(name, start, end)、perf.flush()
- 提供 FPS 采样器：使用 requestAnimationFrame 统计 5s 滚动期间的平均 FPS 和掉帧率
- 与 Worker 协议：每次返回 parseTime、blockCount、cacheHit 等指标，用于 perf 面板展示

五、基线与回归
- 建立 performance_tests/ 基线数据集（10k+ 文档、代码/公式/图表/混合），每次主要优化提交后跑基准，生成前后对比报告
