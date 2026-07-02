# Step 2: 快速收益改造（编辑优先 + 降渲染） - Codex 实施记录

变更目标：
- 预览解析/高亮防抖 100–200ms，空闲期补齐
- useDeferredValue/startTransition 降低预览优先级
- IME 组合输入保护（compositionstart/end 暂停预览刷新）
- CodeMirror 配置稳定（Compartment），仅订阅必要事务

具体改动：

1) 预览防抖与并发特性
- src/components/Preview/Preview.tsx
  - 引入 getDebounceDelay，统一将预览内容更新防抖到 100–200ms（根据文档大小自适应）
  - 使用 useDeferredValue(debouncedContent) 降低解析优先级
  - 特殊元素（KaTeX/Mermaid）渲染通过 runWhenIdle 在空闲期执行，减少对输入的抢占
  - 新增 isComposing 属性，组合输入期间暂停更新，并在结束后立即触发一次刷新
  - 组件使用 React.memo，包含 isComposing 参与比较，避免无关重渲染

- src/App.tsx
  - 对 setContent 使用 startTransition 包裹，降低预览相关更新优先级
  - 在 <Preview/> 与 <VirtualPreview/> 传入 isComposing

2) IME 组合输入保护
- src/components/Editor/Editor.tsx
  - 监听 compositionstart/compositionend 事件
  - 暴露 onCompositionStart/onCompositionEnd 回调至父组件；App 中维护 isComposing 状态

3) CodeMirror 运行期配置稳定
- src/components/Editor/Editor.tsx
  - 引入 Compartment 管理字体大小主题；运行时仅 reconfigure，而不重建 EditorView
  - 其它主题样式与插件保持稳定引用，避免因 props 变更引发 EditorView 重建

4) 虚拟预览与 Worker 解析的组合输入保护
- src/components/Preview/VirtualPreview.tsx
  - 新增 isComposing 属性；组合输入期间冻结解析内容（effectiveContent），结束后统一更新

备注：
- 当前 markdown.ts 仍在主线程解析，下一步按 Step 4/5 迁移解析与高亮到 Worker，并引入增量 patch 协议。
- 滚动同步与锚点定位将在 Step 9 按计划实现。

影响评估（预期）：
- 输入期间预览更新降频与低优先级执行，可显著减少 p95 输入延迟（目标 ≥30% 下降）
- 组合输入保护避免 IME 阶段的预览抖动与错误拆分
- Compartment 避免字体变更等触发 EditorView 重建，稳定编辑体验

回归风险：
- isComposing 状态边界逻辑需在中文/日文等 IME 下充分验证
- runWhenIdle 回退路径使用 setTimeout，低端设备上收益需实测

后续计划：
- 将 markdown.parse/highlight/katex 渲染迁移到 Worker（Step 4）
- 引入增量 patch 与块缓存（Step 5/6）
