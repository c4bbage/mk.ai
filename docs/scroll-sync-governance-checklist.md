# 滚动同步与锚点定位治理清单（Step 9 / Gemini）

目标
- 验证“块顶 + 行内偏移插值 + 次帧校正”的实现达成验收标准：
  - 锚点误差 ≤ 1 行；
  - 滚动流畅无抖动（无明显震荡/往返同步）；
  - 事件监听 passive + rAF 节流；
  - 支持编辑驱动为主，预览驱动可配置。

检查项（实现自查）
- 数据与索引
  - [ ] BlockStore 暴露 getBlockAtLine(line): BlockMeta | undefined
  - [ ] VirtualPreview 暴露 getBlockOffsetById(id): { offsetTop, height }
  - [ ] VirtualPreview 暴露 scrollToOffset(top: number)
  - [ ] BlockRenderer 容器包含 data-block、data-start-line、data-end-line 属性
- 事件与调度
  - [ ] Editor 与 Preview 的 scroll/wheel 监听器均为 { passive: true }
  - [ ] rAF 合并滚动事件，避免多次同步处理
  - [ ] 使用 syncLock 防止循环触发，并在 50–100ms 后释放
  - [ ] 优先级：编辑输入/滚动高优先，预览更新在 rAF 执行
- 算法正确性
  - [ ] 插值比例 r = (line - startLine) / max(1, endLine - startLine)，边界 clamp([0,1])
  - [ ] PositionIndex 命中后直接定位；未命中时采用“先滚入视口，再次定位”的策略
  - [ ] ResizeObserver 次帧校正触发微调，避免大幅跳动
- 可观测性
  - [ ] performance.mark/measure: scroll_sync_start/end、anchor_apply_start/end
  - [ ] 记录锚点误差（单位：行），输出 p50/p95/p99
  - [ ] 记录滚动期间 rAF 落空（掉帧）计数与平均 FPS
- 回退与降级
  - [ ] 当 LineIndex/PositionIndex 不可用时，退化为“滚动比例”映射，避免功能不可用
  - [ ] 在极端文档（超多图片/公式）场景下，校正次数限制，避免抖动

测试计划（performance_tests）
- 场景集
  - [ ] 纯文本长文（10k+ 行）
  - [ ] 代码密集（大量 fenced code）
  - [ ] 图片/公式密集（触发高度波动）
  - [ ] 混合文档
- 用例
  - [ ] 编辑器缓慢滚动 10s：验证预览跟随，无抖动；记录 FPS 与误差分布
  - [ ] 目录（ToC）跳转到随机 50 个锚点：校验定位误差 ≤ 1 行
  - [ ] 搜索跳转（上一处/下一处）连续 100 次：验证误差与抖动
  - [ ] 快速大步滚动（PageUp/Down、滚动条拖动）：验证未挂载块的“先挂载后定位”策略
- 指标门槛（验收）
  - [ ] 锚点误差：p95 ≤ 1 行
  - [ ] rAF 掉帧率：≤ 5%（中端设备）
  - [ ] 监听器耗时：平均 < 1ms

风险与缓解
- [ ] 高度估算误差大：使用估高 + RO 校正 + overscan 提前挂载
- [ ] 双向同步震荡：严格 syncLock + 單向优先（默认 editor_drives）
- [ ] 大图/复杂公式加载突变：限制每帧校正步长，采用小步收敛

产出
- 测试报告：包含误差分布、FPS 曲线、对比“比例法”基线；结论是否达成验收标准与改进建议。
