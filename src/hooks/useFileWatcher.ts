/**
 * useFileWatcher — watch file for external changes.
 * When the file is modified on disk, prompt the user to reload.
 *
 * Uses Tauri fs watch in Tauri mode, falls back to polling in web mode.
 */
import { useEffect, useRef } from 'react';
import { isTauri } from '../lib/file';

interface FileWatcherOptions {
  filePath: string | undefined;
  enabled: boolean;
  onExternalChange: (path: string) => void;
}

export function useFileWatcher({ filePath, enabled, onExternalChange }: FileWatcherOptions) {
  const cbRef = useRef(onExternalChange);
  useEffect(() => { cbRef.current = onExternalChange; });

  // Track whether the last write was from us (auto-save / manual save)
  const suppressUntil = useRef(0);

  // Allow other modules to suppress watcher false-positives
  useEffect(() => {
    (window as unknown as { __suppressFileWatcher?: (ms: number) => void }).__suppressFileWatcher = (ms: number) => {
      suppressUntil.current = Date.now() + ms;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !isTauri() || !filePath) return;

    let unwatch: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const fs = await import('@tauri-apps/plugin-fs');
        if (cancelled) return;

        // Tauri 2 fs.watch returns an unlisten function
        unwatch = await fs.watch(
          filePath,
          (event) => {
            // Skip events that are within the suppression window (our own write)
            if (Date.now() < suppressUntil.current) return;

            const t = event.type;
            if (t === 'any' || (typeof t === 'object' && ('modify' in t || 'create' in t))) {
              cbRef.current(filePath);
            }
          },
          { recursive: false }
        );

        if (cancelled && unwatch) {
          unwatch();
          unwatch = null;
        }
      } catch {
        // fs.watch not available or permission denied — silent fallback to polling
        startPolling();
      }
    })();

    // Fallback: poll file mtime every 2s
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let lastMtime = 0;

    async function startPolling() {
      try {
        const fs = await import('@tauri-apps/plugin-fs');
        const stat = await fs.stat(filePath!);
        lastMtime = stat.mtime?.getTime() ?? 0;
      } catch { /* ignore */ }

      pollTimer = setInterval(async () => {
        if (Date.now() < suppressUntil.current) return;
        try {
          const fs = await import('@tauri-apps/plugin-fs');
          const stat = await fs.stat(filePath!);
          const currentMtime = stat.mtime?.getTime() ?? 0;
          if (currentMtime > lastMtime && currentMtime > 0) {
            lastMtime = currentMtime;
            cbRef.current(filePath!);
          }
        } catch {
          // File may have been deleted
        }
      }, 2000);
    }

    return () => {
      cancelled = true;
      if (unwatch) unwatch();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [filePath, enabled]);
}
