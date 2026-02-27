/**
 * Lightweight DOM Patch utility
 * Applies new HTML to a container element using DocumentFragment + Range,
 * minimizing React involvement. Returns patch metrics for observability.
 */

export interface PatchMetrics {
  replacedNodes: number;
  patchTimeMs: number;
  // Approximate reflow count: number of layout reads we performed inside patch
  // We avoid layout reads in patcher, so this stays 0 unless caller opts-in.
  reflowCount: number;
}

/**
 * Apply HTML patch to a container element.
 * - Does NOT replace the container node itself
 * - Replaces its children content using a single Range operation
 * - Returns metrics (replacedNodes + time)
 */
export function applyHtmlPatch(container: HTMLElement, nextHtml: string): PatchMetrics {
  const t0 = performance.now();

  // Compose fragment from HTML string
  const template = document.createElement('template');
  template.innerHTML = nextHtml;
  const fragment = template.content;

  // Count nodes before replacement
  const beforeCount = container.childNodes.length;

  // Replace current children with the fragment via Range
  const range = document.createRange();
  range.selectNodeContents(container);
  range.deleteContents();
  container.appendChild(fragment);

  const patchTimeMs = performance.now() - t0;
  const metrics: PatchMetrics = {
    replacedNodes: beforeCount,
    patchTimeMs,
    reflowCount: 0,
  };

  return metrics;
}

/**
 * Helper to compare HTML strings quickly to avoid redundant patches.
 */
export function isHtmlDifferent(a: string | undefined | null, b: string | undefined | null): boolean {
  return (a ?? '') !== (b ?? '');
}
