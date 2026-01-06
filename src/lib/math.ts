import katex from 'katex';

/**
 * 渲染页面中的数学公式
 */
export function renderMathInElement(container: HTMLElement): void {
  // 渲染块级公式
  const blockElements = container.querySelectorAll('.math-block');
  blockElements.forEach((el) => {
    const tex = decodeURIComponent(el.getAttribute('data-tex') || '');
    if (tex) {
      try {
        el.innerHTML = katex.renderToString(tex, {
          displayMode: true,
          throwOnError: false,
          strict: false,
        });
        el.classList.add('math-rendered');
      } catch (e) {
        el.innerHTML = `<span class="math-error">公式错误: ${tex}</span>`;
      }
    }
  });

  // 渲染行内公式
  const inlineElements = container.querySelectorAll('.math-inline');
  inlineElements.forEach((el) => {
    const tex = decodeURIComponent(el.getAttribute('data-tex') || '');
    if (tex) {
      try {
        el.innerHTML = katex.renderToString(tex, {
          displayMode: false,
          throwOnError: false,
          strict: false,
        });
        el.classList.add('math-rendered');
      } catch (e) {
        el.innerHTML = `<span class="math-error">公式错误: ${tex}</span>`;
      }
    }
  });
}
