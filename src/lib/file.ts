/**
 * 文件操作服务
 * 支持 Tauri 桌面环境和 Web 浏览器环境
 */

// 检测是否在 Tauri 环境中
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * 打开文件对话框并读取 Markdown 文件
 */
export async function openFile(): Promise<{ content: string; path: string } | null> {
  if (isTauri()) {
    // Tauri 环境
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    
    const filePath = await open({
      multiple: false,
      filters: [{
        name: 'Markdown',
        extensions: ['md', 'markdown', 'txt']
      }]
    });
    
    if (filePath && typeof filePath === 'string') {
      const content = await readTextFile(filePath);
      return { content, path: filePath };
    }
    return null;
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
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    
    // 如果有当前路径，直接保存；否则弹出保存对话框
    let filePath = currentPath;
    
    if (!filePath) {
      filePath = await save({
        filters: [{
          name: 'Markdown',
          extensions: ['md']
        }],
        defaultPath: 'untitled.md'
      }) ?? undefined;
    }
    
    if (filePath) {
      await writeTextFile(filePath, content);
      return filePath;
    }
    return null;
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
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    
    const filePath = await save({
      filters: [{
        name: 'Markdown',
        extensions: ['md']
      }],
      defaultPath: 'untitled.md'
    });
    
    if (filePath) {
      await writeTextFile(filePath, content);
      return filePath;
    }
    return null;
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
