/**
 * 文件操作服务
 * 支持 Tauri 桌面环境和 Web 浏览器环境
 */

import * as dialog from '@tauri-apps/plugin-dialog';
import * as fs from '@tauri-apps/plugin-fs';

// 检测是否在 Tauri 环境中
export function isTauri(): boolean {
  const hasTauri = typeof window !== 'undefined' && '__TAURI__' in window;
  console.log('[file.ts] isTauri check:', hasTauri);
  console.log('[file.ts] dialog module:', dialog);
  console.log('[file.ts] fs module:', fs);
  return hasTauri;
}

/**
 * 打开文件对话框并读取 Markdown 文件
 */
export async function openFile(): Promise<{ content: string; path: string } | null> {
  if (isTauri()) {
    // Tauri 环境
    try {
      console.log('[file.ts] Opening file dialog in Tauri...');
      console.log('[file.ts] dialog.open:', dialog.open);
      
      const filePath = await dialog.open({
        multiple: false,
        filters: [{
          name: 'Markdown',
          extensions: ['md', 'markdown', 'txt']
        }]
      });
      
      console.log('[file.ts] Selected file:', filePath);
      
      if (filePath && typeof filePath === 'string') {
        const content = await fs.readTextFile(filePath);
        console.log('[file.ts] File read successfully, length:', content.length);
        return { content, path: filePath };
      }
      return null;
    } catch (error) {
      console.error('[file.ts] Error opening file:', error);
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
      console.log('[file.ts] Saving file, currentPath:', currentPath);
      
      // 如果有当前路径，直接保存；否则弹出保存对话框
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
      
      console.log('[file.ts] Saving to:', filePath);
      
      if (filePath) {
        await fs.writeTextFile(filePath, content);
        console.log('[file.ts] File saved successfully');
        return filePath;
      }
      return null;
    } catch (error) {
      console.error('[file.ts] Error saving file:', error);
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
      console.log('[file.ts] Save As dialog...');
      
      const filePath = await dialog.save({
        filters: [{
          name: 'Markdown',
          extensions: ['md']
        }],
        defaultPath: 'untitled.md'
      });
      
      console.log('[file.ts] Save As path:', filePath);
      
      if (filePath) {
        await fs.writeTextFile(filePath, content);
        console.log('[file.ts] Save As completed successfully');
        return filePath;
      }
      return null;
    } catch (error) {
      console.error('[file.ts] Error in Save As:', error);
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
