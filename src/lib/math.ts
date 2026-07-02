/**
 * 渲染页面中的数学公式（按需加载 KaTeX）
 */
const CACHE_MAX = 500;
const katexCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const val = katexCache.get(key);
  if (val !== undefined) {
    katexCache.delete(key);
    katexCache.set(key, val);
  }
  return val;
}

function cacheSet(key: string, val: string): void {
  if (katexCache.size >= CACHE_MAX) {
    const oldest = katexCache.keys().next().value;
    if (oldest !== undefined) katexCache.delete(oldest);
  }
  katexCache.set(key, val);
}

export async function renderMathInElement(container: HTMLElement): Promise<void> {
  // 动态加载 KaTeX，避免在启动时拉入大体积依赖
  const katex = (await import('katex')).default;

  // 渲染块级公式
  const blockElements = container.querySelectorAll('.math-block');
  blockElements.forEach((el) => {
    const tex = decodeURIComponent(el.getAttribute('data-tex') || '');
    if (tex) {
      try {
        const cached = cacheGet(tex);
        if (cached !== undefined) {
          el.innerHTML = cached;
        } else {
          const html = katex.renderToString(tex, {
            displayMode: true,
            throwOnError: false,
            strict: false,
          });
          cacheSet(tex, html);
          el.innerHTML = html;
        }
        el.classList.add('math-rendered');
      } catch {
        el.textContent = `公式错误: ${tex}`;
      }
    }
  });

  // 渲染行内公式
  const inlineElements = container.querySelectorAll('.math-inline');
  inlineElements.forEach((el) => {
    const tex = decodeURIComponent(el.getAttribute('data-tex') || '');
    if (tex) {
      try {
        const cached = cacheGet(tex);
        if (cached !== undefined) {
          el.innerHTML = cached;
        } else {
          const html = katex.renderToString(tex, {
            displayMode: false,
            throwOnError: false,
            strict: false,
          });
          cacheSet(tex, html);
          el.innerHTML = html;
        }
        el.classList.add('math-rendered');
      } catch {
        el.textContent = `公式错误: ${tex}`;
      }
    }
  });
}
