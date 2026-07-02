let renderCounter = 0;
let mermaidRef: typeof import('mermaid') | null = null;
let initPromise: Promise<void> | null = null;
let currentTheme: string = 'default';

async function getMermaid() {
  if (!mermaidRef) {
    mermaidRef = await import('mermaid');
  }
  return mermaidRef.default;
}

/**
 * 初始化 Mermaid（按需加载）
 */
async function initMermaidInternal(theme: 'default' | 'dark' | 'forest' | 'neutral' = 'default'): Promise<void> {
  const mermaid = await getMermaid();
  currentTheme = theme;
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'loose',
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
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
}

/**
 * 渲染页面中的 Mermaid 图表（按需加载）
 */
const CACHE_MAX = 200;
const mermaidCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const val = mermaidCache.get(key);
  if (val !== undefined) {
    mermaidCache.delete(key);
    mermaidCache.set(key, val);
  }
  return val;
}

function cacheSet(key: string, val: string): void {
  if (mermaidCache.size >= CACHE_MAX) {
    const oldest = mermaidCache.keys().next().value;
    if (oldest !== undefined) mermaidCache.delete(oldest);
  }
  mermaidCache.set(key, val);
}

export async function renderMermaidInElement(container: HTMLElement): Promise<void> {
  const mermaid = await getMermaid();

  if (!initPromise) {
    initPromise = initMermaidInternal().catch((e) => {
      initPromise = null;
      throw e;
    });
  }
  await initPromise;

  const elements = container.querySelectorAll('.mermaid-block:not(.mermaid-rendered)');
  if (elements.length === 0) return;

  // 串行渲染（避免 mermaid 并发 DOM 冲突）
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLElement;
    const code = decodeURIComponent(el.getAttribute('data-code') || '');
    if (!code) continue;
    await renderSingleBlock(mermaid, el, code);
  }
}

async function renderSingleBlock(mermaid: typeof import('mermaid')['default'], el: HTMLElement, code: string): Promise<void> {
  el.classList.add('mermaid-rendering');

  try {
    const cached = cacheGet(code);
    if (cached !== undefined) {
      el.innerHTML = cached;
    } else {
      // mermaid v11: 给每个 render 一个唯一的渲染容器 id
      const id = `mermaid-graph-${renderCounter++}`;
      // mermaid.render 会把临时 SVG 插到 body，需要一个容器 id
      const { svg } = await mermaid.render(id, code);
      cacheSet(code, svg);
      el.innerHTML = svg;
    }
    el.classList.remove('mermaid-rendering');
    el.classList.add('mermaid-rendered');
  } catch (e) {
    console.error('Mermaid render error:', e);
    // 清理 mermaid 可能留下的临时 DOM
    document.querySelectorAll('div[id^="dmermaid-graph-"]').forEach(n => n.remove());
    el.innerHTML = `<div class="mermaid-error">图表语法错误，请检查 Mermaid 代码</div>`;
    el.classList.remove('mermaid-rendering');
    el.classList.add('mermaid-rendered');
  }
}

/**
 * 重新初始化 Mermaid（用于主题切换）
 * 清空缓存 + 重新 initialize + 标记所有块需要重新渲染
 */
export async function reinitMermaid(theme: 'default' | 'dark' | 'forest' | 'neutral' = 'default'): Promise<void> {
  if (theme === currentTheme && initPromise) return;
  mermaidCache.clear();
  // 重新初始化 — mermaid v11 支持重复 initialize
  initPromise = initMermaidInternal(theme).catch((e) => {
    initPromise = null;
    throw e;
  });
  await initPromise;
}

export async function initMermaid(theme: 'default' | 'dark' | 'forest' | 'neutral' = 'default'): Promise<void> {
  return reinitMermaid(theme);
}
