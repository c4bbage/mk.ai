/**
 * useDragDrop — listen for native Tauri file drag-and-drop events.
 * In web mode, falls back to HTML5 drag-and-drop on the document.
 *
 * Handles both markdown files (.md/.markdown/.txt) and image files.
 *
 * Uses a ref to hold the latest callback so the Tauri listener is
 * registered only once and never torn down due to dependency changes.
 */
import { useEffect, useRef, useState } from 'react';
import { isTauri } from '../lib/file';

const MD_EXTENSIONS = /\.(md|markdown|txt)$/i;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|tiff?|apng)$/i;

export interface DroppedFile {
  path: string;
  isImage: boolean;
}

export interface DragDropHandler {
  onDropFiles: (files: DroppedFile[]) => void;
}

export function useDragDrop({ onDropFiles }: DragDropHandler) {
  const [isDragOver, setIsDragOver] = useState(false);

  // Ref to always hold the latest callback without triggering re-subscription
  const cbRef = useRef(onDropFiles);
  useEffect(() => { cbRef.current = onDropFiles; });

  useEffect(() => {
    if (!isTauri()) {
      const handleDragOver = (e: DragEvent) => {
        if (e.dataTransfer?.types.includes('Files')) {
          e.preventDefault();
          setIsDragOver(true);
        }
      };
      const handleDragLeave = (e: DragEvent) => {
        if (e.relatedTarget === null) setIsDragOver(false);
      };
      const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const files = Array.from(e.dataTransfer?.files ?? []);
        const dropped: DroppedFile[] = files
          .filter(f => MD_EXTENSIONS.test(f.name) || IMAGE_EXTENSIONS.test(f.name))
          .map(f => ({ path: f.name, isImage: IMAGE_EXTENSIONS.test(f.name) }));
        if (dropped.length > 0) cbRef.current(dropped);
      };

      window.addEventListener('dragover', handleDragOver);
      window.addEventListener('dragleave', handleDragLeave);
      window.addEventListener('drop', handleDrop);
      return () => {
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('drop', handleDrop);
      };
    }

    // Tauri: register listener once
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        if (cancelled) return;
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === 'enter') {
            const hasSupported = payload.paths.some(
              (p: string) => MD_EXTENSIONS.test(p) || IMAGE_EXTENSIONS.test(p)
            );
            if (hasSupported) setIsDragOver(true);
          } else if (payload.type === 'drop') {
            setIsDragOver(false);
            const dropped: DroppedFile[] = payload.paths
              .filter((p: string) => MD_EXTENSIONS.test(p) || IMAGE_EXTENSIONS.test(p))
              .map((p: string) => ({ path: p, isImage: IMAGE_EXTENSIONS.test(p) }));
            if (dropped.length > 0) cbRef.current(dropped);
          } else if (payload.type === 'leave') {
            setIsDragOver(false);
          }
        });
        if (cancelled && unlisten) {
          unlisten();
          unlisten = null;
        }
      } catch (e) {
        console.error('[useDragDrop] Failed to set up Tauri drag-drop listener:', e);
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return { isDragOver };
}
