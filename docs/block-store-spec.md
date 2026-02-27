# BlockStore 规格说明（Step 6）

目标
- 引入块级模型（标题/段落/代码块等），维护行号→块映射、内容哈希与高度估算；仅更新受影响块。
- 通过 LRU 缓存与 IndexedDB 持久化，提升预览增量更新与冷启动性能。

范围与角色
- 运行侧：主线程与 Pipeline Worker 协同。BlockStore 位于主线程，管理索引、缓存与与 Worker 的交互；Worker 返回块级 HTML 与元数据。
- 关联模块：
  - src/lib/markdown-blocks.ts（块切分与高度估算）
  - src/workers/pipeline.worker.ts（块渲染与 sanitize）
  - src/components/Preview/VirtualPreview.tsx（按块渲染与懒装配）

核心数据结构
- BlockId：string（稳定、可复用；建议由“块类型+序号+起始行号哈希”组成）
- BlockMeta：{ id, type, startLine, endLine, level?, hash, heightEst }
- BlockRender：{ id, html, metrics? }
- LineIndex：以起始行号升序的数组或跳表；支持行→块查找与插值。
- Caches：
  - memLRU: Map<hash, BlockRender> with capacity limit
  - id→meta 索引：Map<id, BlockMeta>
  - type/level 辅助索引，用于目录与滚动同步

接口设计（TypeScript）
- 初始化
  - init(content: string): Promise<void>
  - reset(): void
- 更新
  - applyChanges(changes: CodeMirrorChange[]): Promise<BlockPatch[]>
  - setContent(content: string): Promise<BlockPatch[]>
- 查询
  - getMetaById(id: string): BlockMeta | undefined
  - getBlockAtLine(line: number): BlockMeta | undefined
  - getRange(startLine: number, endLine: number): BlockMeta[]
  - getAll(): BlockMeta[]
- 渲染协作
  - warmUp(): Promise<void>（在空闲期对热点块预渲染）
  - hydrateFromCache(metas: BlockMeta[]): BlockRender[]（命中缓存则直接返回）
  - requestRender(metas: BlockMeta[], options): Promise<BlockRender[]>
- 缓存与持久化
  - setLRULimit(maxEntries: number, maxBytes?: number): void
  - persist(): Promise<void>
  - restore(): Promise<void>
- 统计与可观测性
  - getStats(): { blocks: number, cached: number, coldMiss: number, memBytes: number }

增量失效策略
- 基本原则：
  - 任何跨块语义影响的语法（列表、引用、标题层级）采用“保守扩散”，失效当前块及其相邻块（±1），列表连续块按组失效。
  - 链接/图片等资源加载不触发全局失效；按块处理。
- 依赖图（可选）：
  - 对“目录/标题编号/交叉引用”建立轻量关系图；当相关块变化时，触发对应渲染层的次帧修正。

高度估算与滚动稳定
- 初始高度使用 estimateBlockHeight；挂载后由 ResizeObserver 回填真实高度，并更新 BlockMeta.heightEst。
- 虚拟列表根据最新估高重算滚动偏移，仅在差异超过阈值（如 20% 或 40px）时触发 remeasure。

Worker 协议
- 输入：BlockMeta 数组（含 content 片段与 hash）
- 输出：BlockRender 数组（携带 id、html、metrics）
- 版本/序列号：携带 docVersion，主线程仅应用最新响应。
- 取消：可选的 CANCEL 消息或 AbortController。

缓存策略
- Hash 计算：对块的 content 使用稳定哈希（如 xxhash/sha1），避免大对象比较。
- LRU：以条目数与字节数双门限控制；超过上限时淘汰最久未使用条目。
- 命中条件：相同 hash + type + 语言（代码块）视为命中；Math/Mermaid 需考虑参数/主题差异。
- 持久化：
  - IndexedDB 库名：md.ai.blockstore
  - 表：blocks（key: hash, value: { html, type, metrics, time }）
  - 压缩：可选使用 gzip/deflate；避免超过配额。

错误与恢复
- Worker 渲染失败：回退到占位或基础 HTML；记录冷 miss。
- IndexedDB 错误：降级为内存 LRU；提示容量限制。

与现有代码的融合点
- 在 VirtualPreview.tsx：
  - 现有 renderCache 替换为 BlockStore.memLRU，键从“type+content”改为“hash”。
  - 在块可见时调用 hydrateFromCache；未命中则 requestRender。
- 在 usePipelineWorker：
  - 输入从全文 content 改为增量 BlockMeta 列表；返回 block renders 合并到 store。
- 在 markdown-blocks.ts：
  - parseMarkdownToBlocks 返回的块增加稳定 id 与 hash 字段；保留 level。

验收指标与度量
- 仅受影响块重解析，预览 DOM 更新量显著下降（记录节点替换数/commit 次数）。
- 大文档预览延迟 p95 < 200–250ms；输入流畅度提升（长任务比例下降）。
- 冷启动：从 IndexedDB 回放缓存可用，首屏预览显著加速。

实施步骤建议
- Phase A：规格与骨架（本文档 + 接口 stub）
- Phase B：内存 LRU 与主线程索引；无持久化先跑通增量。
- Phase C：Worker 带版本的块渲染与缓存命中；KaTeX 渲染迁移。
- Phase D：IndexedDB 持久化与回放；性能面板指标接入。

测试与验证
- 一致性：撤销/重做、并发输入、跨块编辑下内容与预览一致。
- 性能：基线 vs 引入 BlockStore 后指标对比；缓存命中率统计。

开放问题
- Mermaid 的渲染缓存与主题差异的管理（可仅缓存源码→SVG 片段）。
- 语言高亮包的版本与主题对缓存的影响（在命中条件中加入 language+theme）。
