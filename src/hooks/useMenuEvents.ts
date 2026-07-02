/**
 * useMenuEvents — listen for native Tauri menu events.
 * In web mode, this is a no-op (keyboard shortcuts serve as fallback).
 */
import { useEffect } from 'react';
import { isTauri } from '../lib/file';

export type MenuAction =
  | 'file:new'
  | 'file:open'
  | 'file:save'
  | 'file:save_as'
  | 'file:export_html'
  | 'file:export_pdf'
  | 'file:export_image'
  | 'file:copy_wechat'
  | 'edit:find'
  | 'fmt:bold'
  | 'fmt:italic'
  | 'fmt:underline'
  | 'fmt:strikethrough'
  | 'fmt:code'
  | 'fmt:link'
  | 'fmt:h1'
  | 'fmt:h2'
  | 'fmt:h3'
  | 'fmt:h4'
  | 'fmt:h5'
  | 'fmt:h6'
  | 'fmt:normal'
  | 'view:toggle_source'
  | 'view:toggle_outline'
  | 'view:toggle_filetree'
  | 'view:zoom_in'
  | 'view:zoom_out'
  | 'view:zoom_reset'
  | 'view:toggle_autosave'
  | 'view:toggle_dark_mode'
  | 'view:toggle_vim'
  | 'view:cycle_font'
  | 'view:cycle_codefont'
  | 'view:cycle_autosave_delay'
  | 'tools:extract_images'
  | string;

export function useMenuEvents(handler: (action: MenuAction) => void) {
  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      if (cancelled) return;
      unlisten = await listen<string>('menu-event', (event) => {
        handler(event.payload as MenuAction);
      });
      if (cancelled) {
        unlisten();
        unlisten = null;
      }
    })();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [handler]);
}
