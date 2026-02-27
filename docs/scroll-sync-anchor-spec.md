# 滚动同步与锚点定位规格（Step 9）

目标
- 在编辑器与预览之间建立“行号→块”的稳定映射，实现高精度滚动同步与锚点跳转。
- 采用“块顶 + 行内偏移插值”的定位策略，并在渲染后通过 ResizeObserver 做次帧校正，误差 ≤ 1 行。
- 事件处理采用 passive + rAF 节流，避免滚动风暴与主线程卡顿。

范围与角色
- 主体实现位于主线程（React 层）与 VirtualPreview 列表管理。
- 依赖 BlockStore（Step 6）提供 LineIndex 与 BlockMeta，Pipeline Worker 提供块级渲染。
- 组件改造：Editor、Preview/VirtualPreview、BlockRenderer。

关键数据结构
- BlockMeta：{ id, type, startLine, endLine, level?, hash, heightEst }
- LineIndex：支持 getBlockAtLine(line) 与计算块内行偏移。
- PositionIndex：按顺序缓存每个块的 offsetTop 与 height（源自 ResizeObserver），用于快速计算目标滚动位置。

DOM 属性与可观测性
- 在块容器元素上添加：
  - data-block="<blockId>"
  - data-start-line="<startLine>"
  - data-end-line="<endLine>"
- 在开发模式打点：
  - performance.mark/measure：scroll_sync_start/end、anchor_apply_start/end
  - 记录误差（以行数衡量）：error_lines = |expected_line - actual_line_at_viewport|

定位算法（块顶 + 行内偏移插值）
1. 由编辑器报告当前视口顶部行号 topLine 与光标所在行号 cursorLine（或滚动事件的 scrollTop → 行号）。
2. 使用 LineIndex.getBlockAtLine(line) 获取对应 BlockMeta：meta = {startLine, endLine, id}。
3. 获取块的实时高度 H 与容器内 offsetTop T：
   - 若 PositionIndex 命中该块，则直接使用；
   - 若未命中（块未挂载），使用 heightEst 与虚拟列表的 scrollToIndex/scrollToOffset 先将块滚入视口，再次读取。
4. 计算块内行偏移比例 r：
   - r = clamp((line - startLine) / max(1, endLine - startLine), 0, 1)
5. 目标预览滚动位置：target = T + r * H - previewViewportPadding（可选微调）
6. 执行滚动：
   - 在 rAF 回调内使用 preview.scrollTo({ top: target }) 或 VirtualPreview.scrollToOffset(target)
7. 次帧校正：
   - 通过 ResizeObserver 更新该块的 H/T，如果变化超过阈值（> 1 行或 > 40px），进行一次微调滚动。

事件与调度
- 监听器设置：
  - 编辑器侧：scroll/wheel 监听器 passive: true；在 rAF 内合并最近一次滚动事件。
  - 预览侧：同理。
- 防循环锁：syncLockRef，锁定期间忽略对侧滚动事件，50–100ms 后释放。
- 优先级控制：输入与编辑器滚动高优先级，预览滚动更新在 rAF 阶段执行。

组件与 API
- useScrollSync(options):
  - 入参：{ editorRef, previewRef, getTopLine, getCursorLine, lineIndex, positionIndex, mode }
  - mode: 'editor_drives' | 'preview_drives'（默认 editor_drives，可配置双向）
  - 导出：enable(), disable(), scrollToAnchor(line: number), onTocJump(line: number), onSearchJump(line: number)
- VirtualPreview.tsx：
  - 暴露 getBlockOffsetById(id): { offsetTop, height } | undefined
  - 暴露 scrollToOffset(top: number): void
  - 在块挂载/尺寸变化时更新 positionIndex
- BlockRenderer.tsx：
  - 在容器元素上设置 data-block/data-start-line/data-end-line 属性
  - 挂载后通过 ResizeObserver 上报尺寸变化
- Editor.tsx：
  - 暴露 getTopLine()/getCursorLine()，基于 CM6 的 visibleRanges 与状态计算

锚点跳转
- 目录/搜索跳转：调用 scrollToAnchor(line)
  - 第一步：按上述算法定位到目标块顶部 + 行内插值位置
  - 第二步：在 next rAF 中微调校正，目标误差 < 1 行
- 校正策略：若预览定位后实际行内容偏差较大（例如图片/公式加载导致高度突变），在 2–3 帧内做小步修正，避免视觉跳动。

虚拟列表与未挂载块
- 若目标块未挂载：
  - 先使用 VirtualPreview.scrollToIndex(blockIndex) 将块滑入可视区域；
  - 等待 positionIndex 更新后再执行插值定位；
- 高度估算：heightEst 提供足够精度以完成第一次定位，大偏差由次帧校正收敛。

性能与打点
- 打点：scroll_sync_start → anchor_apply_end 的耗时分布（p50/p95）
- 丢帧监测：滚动期间 rAF 落空计数；预览侧 patch 次数与节点替换数。
- 监控指标：
  - 锚点误差（行）：p50/p95/p99
  - 滚动期间 FPS 与掉帧率
  - 事件处理耗时（监听→rAF→滚动应用）

验收标准（对齐 Step 9）
- 锚点误差 ≤ 1 行；滚动流畅无抖动。
- 编辑驱动为主，预览驱动可配置。
- 监听器为 passive + rAF 节流，无明显阻塞主线程。

实施步骤建议
1. API 与属性埋点：为 BlockRenderer 增加 data-* 属性；为 VirtualPreview 暴露位置查询与滚动 API。
2. LineIndex/PositionIndex 接入：
   - 从 BlockStore 读取 getBlockAtLine()；
   - 新增 PositionIndex 并与 ResizeObserver 绑定。
3. useScrollSync 初版实现：仅 editor_drives，单向同步，插值定位 + 次帧校正。
4. 锚点跳转与目录/搜索集成：实现 scrollToAnchor/onTocJump/onSearchJump 接口。
5. 双向模式与节流完善：加入预览驱动可配置、syncLock、rAF 合并。
6. 测试与指标：在 performance_tests 中加入精度与流畅度测试，生成报告。

风险与缓解
- 高度估算误差：通过 ResizeObserver 次帧校正与渐进小步滚动避免视觉跳。
- 未挂载块定位：先 scrollToIndex，再插值；必要时加 overscan 提前挂载。
- 复杂 Markdown（嵌套列表/表格）：按块处理，行内插值采用文本行估算；若误差较大，为该块类型引入特例估算（表格以行数 × 行高估计）。
- 事件循环触发：严格使用 syncLock 与时间窗，防止两侧来回震荡。

落地文件与改造点
- src/components/Preview/BlockRenderer.tsx（data-*、RO 回调）
- src/components/Preview/VirtualPreview.tsx（位置查询/滚动 API、PositionIndex）
- src/hooks/useScrollSync.ts（核心算法与调度）
- src/components/Editor/Editor.tsx（getTopLine/getCursorLine 暴露）
- performance_tests/scroll-sync.spec.ts（精度与流畅度测试）
