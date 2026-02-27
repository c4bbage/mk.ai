# DOM Patch 设计与集成说明

## 目标
- 在预览块级容器内使用原生 DOM Patch（Range + DocumentFragment）执行原位替换，避免 React 对块内部 HTML 的重建
- 降低重排/重绘开销，保持未变更块的节点与事件稳定
- 可观测：输出替换节点数量与 patch 耗时等指标

## API
```ts
interface PatchMetrics {
  replacedNodes: number;
  patchTimeMs: number;
  reflowCount: number; // 目前为 0，补充时机由调用方选择
}

function applyHtmlPatch(container: HTMLElement, nextHtml: string): PatchMetrics
function isHtmlDifferent(a?: string | null, b?: string | null): boolean
```

## 使用要点
- container 为块级固定包裹元素，组件内部不销毁该元素，避免事件绑定丢失
- 对比当前 HTML 与目标 HTML，仅在不一致时执行 patch
- patch 后异步触发 KaTeX/Mermaid 渲染，避免阻塞输入帧
- 与 Pipeline Worker 的两阶段渲染协作：
  - Phase 1：Worker 返回快速 HTML（无语法高亮）
  - Phase 2：可视时请求高亮，收到后再次 patch 替换

## 集成位置
- src/lib/dom-patch.ts：通用 Patch 工具
- src/components/Preview/VirtualPreview.tsx：块级渲染组件 BlockRenderer 使用 patch 替代 dangerouslySetInnerHTML

## 可观测性
- 在开发模式下于 VirtualPreview 中汇总 Patch 次数、替换节点数量、平均耗时
- 后续可与 perf 面板结合上报 input→patch 的端到端延迟

## 风险与回退
- 如果容器不存在或 HTML 未变化，跳过 patch
- 事件保留：由于不替换容器本身，绑定在容器上的事件不会丢失
- 需要注意：绑定在子元素上的事件可能因内容替换而失效，建议事件统一挂载在容器或上层（事件委托）
