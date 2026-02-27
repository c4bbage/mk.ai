/**
 * 性能优化工具库
 */

export function perfMark(name: string) {
  try { performance.mark(name); } catch { /* no-op */ }
}

export function perfMeasure(name: string, start: string, end: string): number | null {
  try {
    performance.measure(name, start, end);
    const e = performance.getEntriesByName(name).pop();
    return e?.duration ?? null;
  } catch {
    return null;
  }
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 懒加载模块
 */
export async function lazyLoadMermaid() {
  // Mermaid 自身内联样式为主，无需 CSS，但可在此按需加载主题样式
  const { initMermaid, renderMermaidInElement } = await import('./mermaid');
  return { initMermaid, renderMermaidInElement };
}

let katexCssLoaded = false;

export async function lazyLoadKaTeX() {
  if (!katexCssLoaded) {
    await import('katex/dist/katex.min.css');
    katexCssLoaded = true;
  }
  const { renderMathInElement } = await import('./math');
  return { renderMathInElement };
}

/**
 * 请求空闲时间执行
 */
export function runWhenIdle(callback: () => void, timeout = 1000) {
  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts: { timeout: number }) => number })
      .requestIdleCallback(callback, { timeout });
  } else {
    // 使用 setTimeout 作为回退，避免阻塞输入帧
    setTimeout(callback, 0);
  }
}

/**
 * 检测大文档（> 10000 字符）
 */
export function isLargeDocument(content: string): boolean {
  return content.length > 10000;
}

/**
 * 获取渲染延迟时间（基于文档大小动态调整）
 */
export function getRenderDelay(content: string): number {
  const len = content.length;
  if (len < 5000) return 100;
  if (len < 20000) return 200;
  if (len < 50000) return 300;
  return 500;
}
