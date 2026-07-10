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
  const inlineCodeBlocks: string[] = [];

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

  // Protect inline code `...` so $ inside it isn't treated as math
  processed = processed.replace(/`([^`\n]+)`/g, (_m, code) => {
    inlineCodeBlocks.push(`<code>${code}</code>`);
    return `%%INLINE_CODE_${inlineCodeBlocks.length - 1}%%`;
  });

  // Protect block-level math $$...$$
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    mathBlocks.push(`<div class="math-block" data-tex="${encodeURIComponent(tex.trim())}"></div>`);
    return `%%MATH_BLOCK_${mathBlocks.length - 1}%%`;
  });

  // Protect inline math $...$
  // Filter out false positives: dollar amounts ($5) and prose with $ signs
  processed = processed.replace(/\$([^$\n]+?)\$/g, (match, tex) => {
    const inner = tex.trim();
    // Skip dollar amounts: starts with digit (e.g. $5 and $10)
    if (/^\d/.test(inner)) return match;
    // Skip prose: 3+ word groups separated by spaces (e.g. "$5 and $10 is")
    if (/\w\s+\w\s+\w/.test(inner)) return match;
    mathBlocks.push(`<span class="math-inline" data-tex="${encodeURIComponent(inner)}"></span>`);
    return `%%MATH_BLOCK_${mathBlocks.length - 1}%%`;
  });

  // Restore code block placeholders so marked can parse them correctly
  codeBlocks.forEach((blockSrc, i) => {
    processed = processed.replace(`%%CODE_BLOCK_${i}%%`, blockSrc);
  });

  // Restore inline code so marked can parse it (backticks must be present for marked)
  inlineCodeBlocks.forEach((html, i) => {
    // Re-wrap in backticks so marked recognizes it as inline code
    const codeContent = html.match(/<code>([\s\S]*)<\/code>/)?.[1] ?? '';
    processed = processed.replace(`%%INLINE_CODE_${i}%%`, '`' + codeContent + '`');
  });

  return { processed, mathBlocks, mermaidBlocks };
}

/**
 * Restore math and mermaid placeholders in the rendered HTML.
 * Uses replaceAll (global) to handle placeholders that appear multiple times.
 */
export function restoreSpecialBlocks(html: string, mathBlocks: string[], mermaidBlocks: string[]): string {
  let restored = html;

  mathBlocks.forEach((placeholder, i) => {
    restored = restored.replaceAll(`%%MATH_BLOCK_${i}%%`, placeholder);
    restored = restored.replaceAll(`<p>%%MATH_BLOCK_${i}%%</p>`, placeholder);
  });

  mermaidBlocks.forEach((placeholder, i) => {
    restored = restored.replaceAll(`%%MERMAID_BLOCK_${i}%%`, placeholder);
    restored = restored.replaceAll(`<p>%%MERMAID_BLOCK_${i}%%</p>`, placeholder);
  });

  return restored;
}
