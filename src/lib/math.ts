/**
 * 渲染页面中的数学公式（按需加载 KaTeX）
 */
const katexCache = new Map<string, string>();

export async function renderMathInElement(container: HTMLElement): Promise<void> {
  // 动态加载 KaTeX，避免在启动时拉入大体积依赖
  const katex = (await import('katex')).default;

  // 渲染块级公式
  const blockElements = container.querySelectorAll('.math-block');
  blockElements.forEach((el) => {
    const tex = decodeURIComponent(el.getAttribute('data-tex') || '');
    if (tex) {
      try {
        if (katexCache.has(tex)) {
          el.innerHTML = katexCache.get(tex)!;
        } else {
          const html = katex.renderToString(tex, {
            displayMode: true,
            throwOnError: false,
            strict: false,
          });
          katexCache.set(tex, html);
          el.innerHTML = html;
        }
        el.classList.add('math-rendered');
      } catch (e) {
        el.innerHTML = `<span class=\"math-error\">公式错误: ${tex}</span>`;
      }
    }
  });

  // 渲染行内公式
  const inlineElements = container.querySelectorAll('.math-inline');
  inlineElements.forEach((el) => {
    const tex = decodeURIComponent(el.getAttribute('data-tex') || '');
    if (tex) {
      try {
        if (katexCache.has(tex)) {
          el.innerHTML = katexCache.get(tex)!;
        } else {
          const html = katex.renderToString(tex, {
            displayMode: false,
            throwOnError: false,
            strict: false,
          });
          katexCache.set(tex, html);
          el.innerHTML = html;
        }
        el.classList.add('math-rendered');
      } catch (e) {
        el.innerHTML = `<span class=\"math-error\">公式错误: ${tex}</span>`;
      }
    }
  });
}

