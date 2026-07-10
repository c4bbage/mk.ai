import { useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editor';

interface AutoSaveOptions {
  enabled: boolean;
  delay?: number;
  content: string;
  filePath?: string;
  isModified: boolean;
  onSave: () => Promise<void>;
}

const BACKUP_PREFIX = 'md-ai-backup-';
const BACKUP_INTERVAL = 8000; // 8 seconds
const BACKUP_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

export interface BackupEntry {
  tabId: string;
  content: string;
  fileName: string;
  filePath?: string;
  timestamp: number;
}

/**
 * 自动保存 Hook — 防抖保存到文件 + 定期备份到 localStorage
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
  const lastFilePathRef = useRef<string | undefined>(filePath);
  const contentRef = useRef(content);
  const filePathRef = useRef(filePath);
  const isModifiedRef = useRef(isModified);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    contentRef.current = content;
    filePathRef.current = filePath;
    isModifiedRef.current = isModified;
    onSaveRef.current = onSave;
  }, [content, filePath, isModified, onSave]);

  // Reset lastSavedContentRef when filePath changes (tab switch / file open)
  // so auto-save compares against the correct baseline
  useEffect(() => {
    if (filePath !== lastFilePathRef.current) {
      lastSavedContentRef.current = content;
      lastFilePathRef.current = filePath;
    }
  }, [filePath, content]);

  // 防抖保存到文件
  useEffect(() => {
    if (!enabled || !filePath || !isModified) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      if (contentRef.current !== lastSavedContentRef.current && filePathRef.current && isModifiedRef.current) {
        await onSaveRef.current();
        lastSavedContentRef.current = contentRef.current;
      }
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, enabled, delay, filePath, isModified]);

  // 失焦时保存到文件
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = async () => {
      if (document.hidden && filePathRef.current && isModifiedRef.current) {
        await onSaveRef.current();
        lastSavedContentRef.current = contentRef.current;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled]);

  // beforeunload: flush all tabs to backup
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = () => {
      flushAllBackups();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled]);
}

/**
 * Flush all modified tabs to localStorage backup.
 * Called on beforeunload and periodically.
 */
export function flushAllBackups() {
  const state = useEditorStore.getState();
  const { tabs } = state;

  for (const tab of tabs) {
    if (!tab.isModified) continue;
    const key = `${BACKUP_PREFIX}${tab.id}`;
    const entry: BackupEntry = {
      tabId: tab.id,
      content: tab.content,
      fileName: tab.fileName,
      filePath: tab.filePath,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(key, JSON.stringify(entry));
    } catch (e) {
      // Quota exceeded — try clearing old backups then retry
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        cleanStaleBackups();
        try {
          localStorage.setItem(key, JSON.stringify(entry));
        } catch {
          console.warn('[backup] Quota exceeded, skipping tab', tab.fileName);
        }
      } else {
        console.warn('[backup] Failed to write backup:', e);
      }
    }
  }
}

/**
 * Periodic backup runner — call this once from App.
 * Backs up all modified tabs every 8 seconds.
 */
export function usePeriodicBackup(enabled: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    intervalRef.current = setInterval(() => {
      flushAllBackups();
    }, BACKUP_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled]);
}

/**
 * Get all valid backups for restore on startup.
 * Returns entries sorted by timestamp (newest first).
 * Cleans up stale backups (>24h old) automatically.
 */
export function getBackupsForRestore(): BackupEntry[] {
  const results: BackupEntry[] = [];
  const now = Date.now();

  // Collect all keys first to avoid index shift during removal
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(BACKUP_PREFIX)) keys.push(key);
  }

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const entry: BackupEntry = JSON.parse(raw);

      // Skip stale backups
      if (now - entry.timestamp > BACKUP_MAX_AGE) {
        localStorage.removeItem(key);
        continue;
      }

      // Validate content integrity — must have content and fileName
      if (typeof entry.content !== 'string' || typeof entry.fileName !== 'string') {
        localStorage.removeItem(key);
        continue;
      }

      results.push(entry);
    } catch {
      localStorage.removeItem(key);
    }
  }

  // Sort newest first
  results.sort((a, b) => b.timestamp - a.timestamp);
  return results;
}

/**
 * Remove a specific tab's backup after successful restore or save.
 */
export function clearBackup(tabId: string) {
  localStorage.removeItem(`${BACKUP_PREFIX}${tabId}`);
}

/**
 * Clean up backups older than 24h. Called on quota overflow.
 */
export function cleanStaleBackups() {
  const now = Date.now();
  const toRemove: string[] = [];

  // Collect keys first to avoid index shift during iteration
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(BACKUP_PREFIX)) keys.push(key);
  }

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const entry = JSON.parse(raw);
      if (now - entry.timestamp > BACKUP_MAX_AGE) {
        toRemove.push(key);
      }
    } catch {
      toRemove.push(key);
    }
  }

  for (const key of toRemove) {
    localStorage.removeItem(key);
  }
}

// ─── Legacy compatibility (deprecated, use getBackupsForRestore) ───
export function getLocalBackup(): { content: string; filePath?: string; timestamp: number } | null {
  const entries = getBackupsForRestore();
  return entries.length > 0
    ? { content: entries[0].content, filePath: entries[0].filePath, timestamp: entries[0].timestamp }
    : null;
}

export function clearLocalBackup(): void {
  const entries = getBackupsForRestore();
  for (const e of entries) {
    clearBackup(e.tabId);
  }
}
