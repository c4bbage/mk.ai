import { useEffect, useRef, useCallback } from 'react';

interface AutoSaveOptions {
  /** 是否启用自动保存 */
  enabled: boolean;
  /** 防抖延迟（毫秒），默认 2000ms */
  delay?: number;
  /** 内容 */
  content: string;
  /** 文件路径（未保存则为 undefined） */
  filePath?: string;
  /** 是否已修改 */
  isModified: boolean;
  /** 保存回调 */
  onSave: () => Promise<void>;
}

/**
 * 自动保存 Hook
 * 
 * 功能：
 * 1. 防抖保存 - 停止输入后 N 秒自动保存
 * 2. 失焦保存 - 窗口失去焦点时保存
 * 3. 定时备份 - localStorage 防止意外丢失
 */
export function useAutoSave({
  enabled,
  delay = 2000,
  content,
  filePath,
  isModified,
  onSave,
}: AutoSaveOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedContent = useRef<string>(content);

  // 防抖保存
  const debouncedSave = useCallback(() => {
    if (!enabled || !filePath || !isModified) return;
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    timerRef.current = setTimeout(async () => {
      if (content !== lastSavedContent.current) {
        await onSave();
        lastSavedContent.current = content;
        console.log('[AutoSave] File saved');
      }
    }, delay);
  }, [enabled, filePath, isModified, content, delay, onSave]);

  // 监听内容变化，触发防抖保存
  useEffect(() => {
    debouncedSave();
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [content, debouncedSave]);

  // 失焦保存
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = async () => {
      if (document.hidden && filePath && isModified) {
        await onSave();
        lastSavedContent.current = content;
        console.log('[AutoSave] Saved on blur');
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isModified) {
        e.preventDefault();
        // 保存到 localStorage 作为备份
        localStorage.setItem('md-ai-backup', JSON.stringify({
          content,
          filePath,
          timestamp: Date.now(),
        }));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, filePath, isModified, content, onSave]);

  // 本地备份（每 30 秒）
  useEffect(() => {
    if (!enabled) return;

    const backupInterval = setInterval(() => {
      if (isModified) {
        localStorage.setItem('md-ai-backup', JSON.stringify({
          content,
          filePath,
          timestamp: Date.now(),
        }));
        console.log('[AutoSave] Local backup created');
      }
    }, 30000);

    return () => clearInterval(backupInterval);
  }, [enabled, content, filePath, isModified]);
}

/**
 * 恢复本地备份
 */
export function getLocalBackup(): { content: string; filePath?: string; timestamp: number } | null {
  try {
    const backup = localStorage.getItem('md-ai-backup');
    if (backup) {
      return JSON.parse(backup);
    }
  } catch {
    console.error('Failed to parse backup');
  }
  return null;
}

/**
 * 清除本地备份
 */
export function clearLocalBackup(): void {
  localStorage.removeItem('md-ai-backup');
}
