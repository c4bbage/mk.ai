import type { ImageStorageStrategy } from '../types';

/**
 * 将文件转换为 Base64 Data URL
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * 从剪贴板事件中获取图片文件
 */
export function getImageFromClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}

/**
 * 从拖拽事件中获取图片文件
 */
export function getImageFromDrop(event: DragEvent): File | null {
  const files = event.dataTransfer?.files;
  if (!files) return null;

  for (const file of files) {
    if (file.type.startsWith('image/')) {
      return file;
    }
  }
  return null;
}

/**
 * 处理图片并返回 Markdown 图片语法
 */
export async function processImage(
  file: File,
  strategy: ImageStorageStrategy = 'base64'
): Promise<string> {
  const fileName = file.name || `image-${Date.now()}`;
  
  switch (strategy) {
    case 'base64': {
      const dataUrl = await fileToBase64(file);
      return `![${fileName}](${dataUrl})`;
    }
    case 'url': {
      // URL 策略：创建临时 URL（仅在当前会话有效）
      const url = URL.createObjectURL(file);
      return `![${fileName}](${url})`;
    }
    case 'local':
    default: {
      // 默认使用 base64
      const dataUrl = await fileToBase64(file);
      return `![${fileName}](${dataUrl})`;
    }
  }
}

/**
 * 生成唯一的图片文件名
 */
export function generateImageFileName(originalName: string): string {
  const ext = originalName.split('.').pop() || 'png';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `image-${timestamp}-${random}.${ext}`;
}
