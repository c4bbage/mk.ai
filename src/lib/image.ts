import type { ImageStorageStrategy } from '../types';
import { isTauri } from './file';

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
 * 将 File 转换为 Uint8Array
 */
export function fileToUint8Array(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      resolve(new Uint8Array(arrayBuffer));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
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
 * 生成唯一的图片文件名
 */
export function generateImageFileName(originalName?: string): string {
  const ext = originalName?.split('.').pop() || 'png';
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = date.toTimeString().slice(0, 8).replace(/:/g, '');
  const random = Math.random().toString(36).substring(2, 6);
  return `image-${dateStr}-${timeStr}-${random}.${ext}`;
}

/**
 * 从文件路径获取 assets 目录名（Typora 风格）
 * 例如：/path/to/document.md → /path/to/document.assets
 */
export function getAssetsDir(filePath: string): string {
  // 移除扩展名，添加 .assets
  const basePath = filePath.replace(/\.(md|markdown)$/i, '');
  return `${basePath}.assets`;
}

/**
 * 从文件路径获取 images 目录
 * 例如：/path/to/document.md → /path/to/images
 */
export function getImagesDir(filePath: string): string {
  const dir = filePath.split(/[/\\]/).slice(0, -1).join('/');
  return dir ? `${dir}/images` : 'images';
}

/**
 * 获取相对路径
 */
export function getRelativePath(_fromDir: string, toPath: string): string {
  // 简化处理：假设在同一目录下
  const fileName = toPath.split(/[/\\]/).pop() || toPath;
  const assetsDir = toPath.split(/[/\\]/).slice(-2, -1)[0] || '';
  return `./${assetsDir}/${fileName}`;
}

/**
 * 处理图片并返回 Markdown 图片语法
 * @param file 图片文件
 * @param strategy 存储策略
 * @param documentPath 当前文档路径（用于计算相对路径）
 */
export async function processImage(
  file: File,
  strategy: ImageStorageStrategy = 'base64',
  documentPath?: string
): Promise<string> {
  const altText = file.name?.replace(/\.[^.]+$/, '') || 'image';
  const newFileName = generateImageFileName(file.name);
  
  switch (strategy) {
    case 'base64': {
      const dataUrl = await fileToBase64(file);
      return `![${altText}](${dataUrl})`;
    }
    
    case 'assets': {
      // Typora 风格：./文档名.assets/
      if (!documentPath) {
        // 没有保存的文档，回退到 base64
        console.warn('Document not saved, falling back to base64');
        const dataUrl = await fileToBase64(file);
        return `![${altText}](${dataUrl})`;
      }
      
      if (isTauri()) {
        const saved = await saveImageToLocal(file, documentPath, 'assets', newFileName);
        if (saved) {
          const docName = documentPath.split(/[/\\]/).pop()?.replace(/\.(md|markdown)$/i, '') || 'untitled';
          return `![${altText}](./${docName}.assets/${newFileName})`;
        }
      }
      
      // 回退到 base64
      const dataUrl = await fileToBase64(file);
      return `![${altText}](${dataUrl})`;
    }
    
    case 'images': {
      // 保存到 ./images/
      if (!documentPath) {
        console.warn('Document not saved, falling back to base64');
        const dataUrl = await fileToBase64(file);
        return `![${altText}](${dataUrl})`;
      }
      
      if (isTauri()) {
        const saved = await saveImageToLocal(file, documentPath, 'images', newFileName);
        if (saved) {
          return `![${altText}](./images/${newFileName})`;
        }
      }
      
      const dataUrl = await fileToBase64(file);
      return `![${altText}](${dataUrl})`;
    }
    
    case 'url': {
      // 临时 URL（仅当前会话有效）
      const url = URL.createObjectURL(file);
      return `![${altText}](${url})`;
    }
    
    case 'absolute':
    default: {
      // 默认使用 base64
      const dataUrl = await fileToBase64(file);
      return `![${altText}](${dataUrl})`;
    }
  }
}

/**
 * 保存图片到本地（Tauri 环境）
 */
async function saveImageToLocal(
  file: File,
  documentPath: string,
  mode: 'assets' | 'images',
  fileName: string
): Promise<boolean> {
  try {
    const { writeFile, mkdir, exists } = await import('@tauri-apps/plugin-fs');
    
    // 计算目标目录
    let targetDir: string;
    if (mode === 'assets') {
      targetDir = getAssetsDir(documentPath);
    } else {
      targetDir = getImagesDir(documentPath);
    }
    
    // 确保目录存在
    const dirExists = await exists(targetDir);
    if (!dirExists) {
      await mkdir(targetDir, { recursive: true });
    }
    
    // 保存图片
    const targetPath = `${targetDir}/${fileName}`;
    const imageData = await fileToUint8Array(file);
    await writeFile(targetPath, imageData);
    
    console.log(`Image saved to: ${targetPath}`);
    return true;
  } catch (error) {
    console.error('Failed to save image:', error);
    return false;
  }
}

/**
 * 批量导出文档中的图片
 * 将 Base64 图片提取并保存为文件
 */
export async function extractAndSaveImages(
  content: string,
  documentPath: string,
  mode: 'assets' | 'images' = 'assets'
): Promise<string> {
  if (!isTauri()) {
    console.warn('Image extraction only works in Tauri environment');
    return content;
  }
  
  // 匹配 Base64 图片
  const base64Regex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
  let newContent = content;
  let match;
  let index = 0;
  
  while ((match = base64Regex.exec(content)) !== null) {
    const [fullMatch, altText, dataUrl] = match;
    
    try {
      // 解析 Base64
      const [header, base64Data] = dataUrl.split(',');
      const mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/png';
      const ext = mimeType.split('/')[1] || 'png';
      
      // 生成文件名
      const fileName = generateImageFileName(`image.${ext}`);
      
      // 转换为二进制
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // 创建 File 对象
      const file = new File([bytes], fileName, { type: mimeType });
      
      // 保存文件
      const saved = await saveImageToLocal(file, documentPath, mode, fileName);
      
      if (saved) {
        // 替换为相对路径
        let relativePath: string;
        if (mode === 'assets') {
          const docName = documentPath.split(/[/\\]/).pop()?.replace(/\.(md|markdown)$/i, '') || 'untitled';
          relativePath = `./${docName}.assets/${fileName}`;
        } else {
          relativePath = `./images/${fileName}`;
        }
        
        newContent = newContent.replace(fullMatch, `![${altText}](${relativePath})`);
      }
      
      index++;
    } catch (error) {
      console.error(`Failed to extract image ${index}:`, error);
    }
  }
  
  return newContent;
}
