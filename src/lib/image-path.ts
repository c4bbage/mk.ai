/**
 * Image path resolution for Tauri.
 * Converts relative image paths in markdown HTML to asset:// URLs
 * that the Tauri webview can load.
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from './file';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|tiff?|apng)$/i;

/** Check if a string is an absolute path (Unix or Windows) */
function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);
}

/** Check if a src is a remote URL, data URI, blob, or already an asset URL */
function isExternalSrc(src: string): boolean {
  return /^(https?:|data:|blob:|asset:|http:\/\/asset\.localhost|tauri:)/i.test(src);
}

/**
 * Get the directory of a file path.
 * /path/to/doc.md → /path/to
 */
function getDir(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx >= 0 ? path.substring(0, idx) : '.';
}

/**
 * Resolve a relative path against a base directory.
 * Handles ./, ../, and bare relative paths.
 * Returns an absolute path.
 */
function resolvePath(baseDir: string, relPath: string): string {
  const rel = relPath.replace(/^\.\//, '').replace(/\\/g, '/');
  const baseParts = baseDir.replace(/\\/g, '/').split('/').filter(Boolean);
  const leadingSlash = baseDir.startsWith('/');

  for (const part of rel.split('/')) {
    if (part === '..') baseParts.pop();
    else if (part === '.' || part === '') continue;
    else baseParts.push(part);
  }

  return (leadingSlash ? '/' : '') + baseParts.join('/');
}

/**
 * Resolve relative image src in an HTML string (synchronous).
 * Only converts relative paths; leaves http/data/blob/asset URLs untouched.
 */
export function resolveImagePathsInHtml(html: string, filePath: string | undefined): string {
  if (!isTauri() || !filePath) return html;

  const baseDir = getDir(filePath);

  return html.replace(
    /<img\s+src="(?!https?:|data:|blob:|asset:|http:\/\/asset\.localhost|tauri:)([^"]+)"/g,
    (_match, src: string) => {
      const absolute = isAbsolutePath(src) ? src : resolvePath(baseDir, src);
      try {
        return `<img src="${convertFileSrc(absolute)}"`;
      } catch {
        return `<img src="${absolute}"`;
      }
    }
  );
}

/**
 * Resolve relative image src in a DOM container.
 * Used by VirtualPreview where HTML is applied per-block via DOM patches.
 */
export function resolveImagePathsInDom(container: HTMLElement, filePath: string | undefined): void {
  if (!isTauri() || !filePath) return;

  const baseDir = getDir(filePath);
  const imgs = container.querySelectorAll<HTMLImageElement>('img[src]');

  for (const img of imgs) {
    const src = img.getAttribute('src');
    if (!src || isExternalSrc(src)) continue;

    const absolute = isAbsolutePath(src) ? src : resolvePath(baseDir, src);
    try {
      img.src = convertFileSrc(absolute);
    } catch {
      // ignore
    }
  }
}

export { IMAGE_EXTENSIONS, isAbsolutePath, getDir, resolvePath };
