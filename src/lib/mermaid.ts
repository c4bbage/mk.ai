import mermaid from 'mermaid';

let initialized = false;
let renderCounter = 0;

/**
 * 初始化 Mermaid
 */
export function initMermaid(theme: 'default' | 'dark' | 'forest' | 'neutral' = 'default'): void {
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
  initialized = true;
}

/**
 * 渲染页面中的 Mermaid 图表
 */
export async function renderMermaidInElement(container: HTMLElement): Promise<void> {
  if (!initialized) {
    initMermaid();
  }

  const elements = container.querySelectorAll('.mermaid-block:not(.mermaid-rendered)');
  
  if (elements.length === 0) return;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as HTMLElement;
    const code = decodeURIComponent(el.getAttribute('data-code') || '');
    
    if (code) {
      // 使用唯一的 ID
      const id = `mermaid-graph-${renderCounter++}`;
      
      try {
        // 标记为正在渲染
        el.classList.add('mermaid-rendering');
        
        const { svg } = await mermaid.render(id, code);
        el.innerHTML = svg;
        el.classList.remove('mermaid-rendering');
        el.classList.add('mermaid-rendered');
      } catch (e) {
        console.error('Mermaid render error:', e);
        el.innerHTML = `<div class="mermaid-error">图表语法错误，请检查 Mermaid 代码</div>`;
        el.classList.remove('mermaid-rendering');
        el.classList.add('mermaid-rendered');
      }
    }
  }
}

/**
 * 重新初始化 Mermaid（用于主题切换）
 */
export function reinitMermaid(theme: 'default' | 'dark' | 'forest' | 'neutral' = 'default'): void {
  initialized = false;
  initMermaid(theme);
}
