/**
 * 文件操作服务
 * 支持 Tauri 桌面环境和 Web 浏览器环境
 */

import * as dialog from '@tauri-apps/plugin-dialog';
import * as fs from '@tauri-apps/plugin-fs';

// 检测是否在 Tauri 环境中
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/** Maximum file size we allow opening (10 MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed file extensions for open */
const ALLOWED_EXTENSIONS = /\.(md|markdown|txt)$/i;

/**
 * Validate a file path string.
 * Returns an error message or null if valid.
 */
export function validateFilePath(path: string): string | null {
  if (!path || typeof path !== 'string') return '文件路径不能为空';
  if (path.trim().length === 0) return '文件路径不能为空';
  if (path.length > 1024) return '文件路径过长';
  // Block null bytes (path traversal)
  if (path.includes('\0')) return '文件路径包含非法字符';
  return null;
}

/**
 * Validate file content before saving.
 * Returns an error message or null if valid.
 */
export function validateContent(content: string): string | null {
  if (content == null) return '内容不能为空';
  if (typeof content !== 'string') return '内容必须是字符串';
  if (content.length > MAX_FILE_SIZE) return `文件内容过大（最大 ${MAX_FILE_SIZE / 1024 / 1024} MB）`;
  return null;
}

/**
 * Validate file extension is allowed.
 */
export function isAllowedExtension(path: string): boolean {
  return ALLOWED_EXTENSIONS.test(path);
}

/**
 * 打开文件对话框并读取 Markdown 文件
 */
export async function openFile(): Promise<{ content: string; path: string } | null> {
  if (isTauri()) {
    try {
      const filePath = await dialog.open({
        multiple: false,
        filters: [{
          name: 'Markdown',
          extensions: ['md', 'markdown', 'txt']
        }]
      });

      if (filePath && typeof filePath === 'string') {
        const content = await fs.readTextFile(filePath);
        return { content, path: filePath };
      }
      return null;
    } catch (error) {
      console.error('[file] Error opening file:', error);
      alert('打开文件失败: ' + (error as Error).message);
      return null;
    }
  } else {
    // Web 环境 - 使用 File API
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,.txt';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const content = await file.text();
          resolve({ content, path: file.name });
        } else {
          resolve(null);
        }
      };

      input.click();
    });
  }
}

/**
 * 保存文件
 */
export async function saveFile(
  content: string,
  currentPath?: string
): Promise<string | null> {
  if (isTauri()) {
    try {
      let filePath = currentPath;

      if (!filePath) {
        filePath = await dialog.save({
          filters: [{
            name: 'Markdown',
            extensions: ['md']
          }],
          defaultPath: 'untitled.md'
        }) ?? undefined;
      }

      if (filePath) {
        await fs.writeTextFile(filePath, content);
        return filePath;
      }
      return null;
    } catch (error) {
      console.error('[file] Error saving file:', error);
      alert('保存文件失败: ' + (error as Error).message);
      return null;
    }
  } else {
    // Web 环境 - 下载文件
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentPath || 'untitled.md';
    a.click();
    URL.revokeObjectURL(url);
    return currentPath || 'untitled.md';
  }
}

/**
 * 另存为
 */
export async function saveFileAs(content: string): Promise<string | null> {
  if (isTauri()) {
    try {
      const filePath = await dialog.save({
        filters: [{
          name: 'Markdown',
          extensions: ['md']
        }],
        defaultPath: 'untitled.md'
      });

      if (filePath) {
        await fs.writeTextFile(filePath, content);
        return filePath;
      }
      return null;
    } catch (error) {
      console.error('[file] Error in Save As:', error);
      alert('另存为失败: ' + (error as Error).message);
      return null;
    }
  } else {
    return saveFile(content);
  }
}

/**
 * 从文件路径获取文件名
 */
export function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

/**
 * 从文件路径获取目录
 */
export function getDirectory(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  parts.pop();
  return parts.join('/') || '.';
}
