/**
 * Shared placeholder protection for math, mermaid, and code blocks.
 * Used by both markdown.ts (main thread) and pipeline.worker.ts (worker).
 */

export interface PlaceholderResult {
  processed: string;
  mathBlocks: string[];
  mermaidBlocks: string[];
}

/**
 * Protect math, mermaid, and code blocks from being mangled by marked.
 * Replaces them with placeholders, returns the processed string and block arrays.
 */
export function protectSpecialBlocks(content: string): PlaceholderResult {
  const mathBlocks: string[] = [];
  const mermaidBlocks: string[] = [];
  const codeBlocks: string[] = [];

  let processed = content;

  // Protect Mermaid code blocks first (before generic code blocks)
  processed = processed.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    mermaidBlocks.push(`<div class="mermaid-block" data-code="${encodeURIComponent(code.trim())}"></div>`);
    return `%%MERMAID_BLOCK_${mermaidBlocks.length - 1}%%`;
  });

  // Protect all triple-backtick code blocks
  processed = processed.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, (m) => {
    codeBlocks.push(m);
    return `%%CODE_BLOCK_${codeBlocks.length - 1}%%`;
  });

  // Protect block-level math $$...$$
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    mathBlocks.push(`<div class="math-block" data-tex="${encodeURIComponent(tex.trim())}"></div>`);
    return `%%MATH_BLOCK_${mathBlocks.length - 1}%%`;
  });

  // Protect inline math $...$
  processed = processed.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    mathBlocks.push(`<span class="math-inline" data-tex="${encodeURIComponent(tex.trim())}"></span>`);
    return `%%MATH_BLOCK_${mathBlocks.length - 1}%%`;
  });

  // Restore code block placeholders so marked can parse them correctly
  codeBlocks.forEach((blockSrc, i) => {
    processed = processed.replace(`%%CODE_BLOCK_${i}%%`, blockSrc);
  });

  return { processed, mathBlocks, mermaidBlocks };
}

/**
 * Restore math and mermaid placeholders in the rendered HTML.
 */
export function restoreSpecialBlocks(html: string, mathBlocks: string[], mermaidBlocks: string[]): string {
  let restored = html;

  mathBlocks.forEach((placeholder, i) => {
    restored = restored.replace(`%%MATH_BLOCK_${i}%%`, placeholder);
    restored = restored.replace(`<p>%%MATH_BLOCK_${i}%%</p>`, placeholder);
  });

  mermaidBlocks.forEach((placeholder, i) => {
    restored = restored.replace(`%%MERMAID_BLOCK_${i}%%`, placeholder);
    restored = restored.replace(`<p>%%MERMAID_BLOCK_${i}%%</p>`, placeholder);
  });

  return restored;
}
