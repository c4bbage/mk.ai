## [2026-01-23 09:30] Step 8 - 预览 DOM Patch 与降 React 参与度 (Agent: codex)
- 新增 src/lib/dom-patch.ts：实现 DocumentFragment + Range 原位替换，并返回 PatchMetrics（replacedNodes、patchTimeMs、reflowCount）。
- 文档 docs/dom-patch-spec.md：给出 API 与集成说明，包括风险与事件委托建议。
- 修改 src/components/Preview/VirtualPreview.tsx：
  - BlockRenderer 改为固定容器 + 原生 DOM Patch 替代 dangerouslySetInnerHTML；
  - 可视时按需渲染 KaTeX/Mermaid（下一帧执行），并请求二阶段高亮；
  - 在开发模式下汇总 Patch 次数、替换节点数量与平均 Patch 耗时，便于对比报告；
  - 保持 LRU 缓存与可见性懒渲染逻辑。
- 验收标准对齐：
  - 大文档下重排次数与节点重建显著减少；
  - 交互事件不丢失（容器事件委托保留），功能无回归。
- 后续建议：
  - 引入 morphdom 进行更细粒度 diff（可选），对比 Range 整体替换的收益；
  - 将 PatchMetrics 上报到性能面板，纳入“节点替换数/平均 Patch 时长”指标。

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

