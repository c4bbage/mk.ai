import { useEffect, useRef } from 'react';

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>(content);
  // Use refs for values accessed in timers to avoid stale closures
  const contentRef = useRef(content);
  const filePathRef = useRef(filePath);
  const isModifiedRef = useRef(isModified);
  const onSaveRef = useRef(onSave);

  // Keep refs in sync
  contentRef.current = content;
  filePathRef.current = filePath;
  isModifiedRef.current = isModified;
  onSaveRef.current = onSave;

  // 防抖保存 — only depends on content changes, uses refs for latest values
  useEffect(() => {
    if (!enabled || !filePath || !isModified) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      if (contentRef.current !== lastSavedContentRef.current && filePathRef.current && isModifiedRef.current) {
        await onSaveRef.current();
        lastSavedContentRef.current = contentRef.current;
      }
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [content, enabled, delay, filePath, isModified]);

  // 失焦保存
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = async () => {
      if (document.hidden && filePathRef.current && isModifiedRef.current) {
        await onSaveRef.current();
        lastSavedContentRef.current = contentRef.current;
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isModifiedRef.current) {
        e.preventDefault();
        localStorage.setItem('md-ai-backup', JSON.stringify({
          content: contentRef.current,
          filePath: filePathRef.current,
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
  }, [enabled]);

  // 本地备份（每 30 秒）
  useEffect(() => {
    if (!enabled) return;

    const backupInterval = setInterval(() => {
      if (isModifiedRef.current) {
        localStorage.setItem('md-ai-backup', JSON.stringify({
          content: contentRef.current,
          filePath: filePathRef.current,
          timestamp: Date.now(),
        }));
      }
    }, 30000);

    return () => clearInterval(backupInterval);
  }, [enabled]);
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
