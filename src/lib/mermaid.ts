let initialized = false;
let renderCounter = 0;
let mermaidRef: typeof import('mermaid') | null = null;

async function getMermaid() {
  if (!mermaidRef) {
    mermaidRef = await import('mermaid');
  }
  return mermaidRef.default || (mermaidRef as any);
}

/**
 * 初始化 Mermaid（按需加载）
 */
export async function initMermaid(theme: 'default' | 'dark' | 'forest' | 'neutral' = 'default'): Promise<void> {
  const mermaid = await getMermaid();
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'loose',
    fontFamily: '-apple-system, BlinkMacSystemFont, \"PingFang SC\", sans-serif',
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
    },
    sequence: {
      useMaxWidth: true,
    },
    themeVariables: {
      primaryColor: '#667eea',
      primaryTextColor: '#fff',
      primaryBorderColor: '#764ba2',
      lineColor: '#667eea',
      secondaryColor: '#f0f0f0',
      tertiaryColor: '#fafafa',
    },
  });
  initialized = true;
}

/**
 * 渲染页面中的 Mermaid 图表（按需加载）
 */
const mermaidCache = new Map<string, string>();

export async function renderMermaidInElement(container: HTMLElement): Promise<void> {
  const mermaid = await getMermaid();

  if (!initialized) {
    await initMermaid();
  }

  const elements = container.querySelectorAll('.mermaid-block:not(.mermaid-rendered)');
  if (elements.length === 0) return;

  // 并发限制（一次最多渲染 2 个）
  const concurrency = 2;
  let running = 0;
  let index = 0;

  return new Promise<void>((resolve) => {
    const next = async () => {
      if (index >= elements.length) {
        if (running === 0) resolve();
        return;
      }
      while (running < concurrency && index < elements.length) {
        const el = elements[index++] as HTMLElement;
        const code = decodeURIComponent(el.getAttribute('data-code') || '');
        if (!code) continue;

        // 使用唯一的 ID
        const id = `mermaid-graph-${renderCounter++}`;

        running++;
        (async () => {
          try {
      // 标记为正在渲染
      el.classList.add('mermaid-rendering');

      if (mermaidCache.has(code)) {
        el.innerHTML = mermaidCache.get(code)!;
      } else {
        const { svg } = await mermaid.render(id, code);
        mermaidCache.set(code, svg);
        el.innerHTML = svg;
      }
      el.classList.remove('mermaid-rendering');
      el.classList.add('mermaid-rendered');
    } catch (e) {
      console.error('Mermaid render error:', e);
      el.innerHTML = `<div class=\"mermaid-error\">图表语法错误，请检查 Mermaid 代码</div>`;
      el.classList.remove('mermaid-rendering');
      el.classList.add('mermaid-rendered');
    } finally {
      running--;
      next();
    }
    })();
      }
    };
    next();
  });
}

/**
 * 重新初始化 Mermaid（用于主题切换）
 */
export async function reinitMermaid(theme: 'default' | 'dark' | 'forest' | 'neutral' = 'default'): Promise<void> {
  initialized = false;
  await initMermaid(theme);
}

