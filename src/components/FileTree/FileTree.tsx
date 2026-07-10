import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { isTauri } from '../../lib/file';
import './FileTree.css';

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileEntry[];
}

interface FileTreeProps {
  currentFilePath?: string;
  onFileSelect: (path: string) => void;
  onFolderOpen?: (path: string) => void;
  onFileRename?: (oldPath: string, newPath: string) => void;
  onFileDelete?: (path: string) => void;
}

export function FileTree({ currentFilePath, onFileSelect, onFolderOpen, onFileRename, onFileDelete }: FileTreeProps) {
  const [manualRoot, setManualRoot] = useState<string | null>(null);
  const [entriesState, setEntriesState] = useState<FileEntry[]>([]);
  const [loadedRoot, setLoadedRoot] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry | null } | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; originalName: string } | null>(null);
  const [creating, setCreating] = useState<{ parentPath: string; isDir: boolean } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  // Derive rootPath from current file path; manual override takes priority
  const rootPath = useMemo(() => {
    if (manualRoot) return manualRoot;
    if (currentFilePath && isTauri()) {
      const dir = currentFilePath.split(/[/\\]/).slice(0, -1).join('/');
      return dir || null;
    }
    return null;
  }, [manualRoot, currentFilePath]);

  const loading = rootPath !== null && loadedRoot !== rootPath;
  const entries = loadedRoot === rootPath ? entriesState : [];

  const loadDirectory = useCallback(async (dirPath: string): Promise<FileEntry[]> => {
    if (!isTauri()) return [];
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const items = await fs.readDir(dirPath);
      const fileEntries: FileEntry[] = [];

      for (const item of items) {
        const name = item.name;
        if (!name || name.startsWith('.')) continue;
        const fullPath = `${dirPath}/${name}`;
        const isDir = item.isDirectory;

        if (isDir || /\.(md|markdown|txt)$/i.test(name)) {
          fileEntries.push({ name, path: fullPath, isDir });
        }
      }

      fileEntries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return fileEntries;
    } catch (e) {
      console.error('[FileTree] Failed to read directory:', e);
      return [];
    }
  }, []);

  // Reload a directory and update state
  const reloadDir = useCallback(async (dirPath: string) => {
    const items = await loadDirectory(dirPath);
    if (dirPath === rootPath) {
      setEntriesState(items);
    } else {
      // Update children of a subdirectory in entries recursively
      const updateChildren = (list: FileEntry[]): FileEntry[] => {
        return list.map(e => {
          if (e.path === dirPath) {
            const updated = { ...e, children: items };
            return updated;
          }
          if (e.children) {
            return { ...e, children: updateChildren(e.children) };
          }
          return e;
        });
      };
      setEntriesState(prev => updateChildren(prev));
    }
  }, [rootPath, loadDirectory]);

  useEffect(() => {
    if (!rootPath) return;
    let cancelled = false;
    loadDirectory(rootPath).then(items => {
      if (!cancelled) {
        setLoadedRoot(rootPath);
        setEntriesState(items);
      }
    });
    return () => { cancelled = true; };
  }, [rootPath, loadDirectory]);

  const handleOpenFolder = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const dialog = await import('@tauri-apps/plugin-dialog');
      const selected = await dialog.open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setManualRoot(selected);
        setExpandedDirs(new Set());
        onFolderOpen?.(selected);
      }
    } catch (e) {
      console.error('[FileTree] Failed to open folder:', e);
    }
  }, [onFolderOpen]);

  const toggleDir = useCallback(async (entry: FileEntry) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(entry.path)) {
      newExpanded.delete(entry.path);
    } else {
      newExpanded.add(entry.path);
      if (!entry.children) {
        const children = await loadDirectory(entry.path);
        setEntriesState(prev => {
          const updateChildren = (list: FileEntry[]): FileEntry[] =>
            list.map(e => {
              if (e.path === entry.path) return { ...e, children };
              if (e.children) return { ...e, children: updateChildren(e.children) };
              return e;
            });
          return updateChildren(prev);
        });
      }
    }
    setExpandedDirs(newExpanded);
  }, [expandedDirs, loadDirectory]);

  // ─── File operations ───
  const handleCreate = useCallback(async (name: string, parentPath: string, isDir: boolean) => {
    if (!name.trim()) { setCreating(null); return; }
    const fullPath = `${parentPath}/${name.trim()}`;
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      if (isDir) {
        await fs.mkdir(fullPath);
      } else {
        await fs.writeTextFile(fullPath, '');
      }
      await reloadDir(parentPath);
      if (!isDir) {
        onFileSelect(fullPath);
      }
    } catch (e) {
      console.error('[FileTree] Failed to create:', e);
    }
    setCreating(null);
  }, [reloadDir, onFileSelect]);

  const handleRename = useCallback(async (oldPath: string, newName: string) => {
    if (!newName.trim() || !renaming) { setRenaming(null); return; }
    const dir = oldPath.split(/[/\\]/).slice(0, -1).join('/');
    const newPath = `${dir}/${newName.trim()}`;
    if (newPath === oldPath) { setRenaming(null); return; }
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      await fs.rename(oldPath, newPath);
      await reloadDir(dir);
      if (oldPath === currentFilePath) {
        onFileRename?.(oldPath, newPath);
      }
    } catch (e) {
      console.error('[FileTree] Failed to rename:', e);
    }
    setRenaming(null);
  }, [renaming, reloadDir, currentFilePath, onFileRename]);

  const handleDelete = useCallback(async (path: string, isDir: boolean) => {
    const name = path.split(/[/\\]/).pop() || path;
    if (!window.confirm(`确定删除 ${name}？`)) return;
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      if (isDir) {
        await fs.remove(path, { recursive: true });
      } else {
        await fs.remove(path);
      }
      const dir = path.split(/[/\\]/).slice(0, -1).join('/');
      await reloadDir(dir);
      if (path === currentFilePath) {
        onFileDelete?.(path);
      }
    } catch (e) {
      console.error('[FileTree] Failed to delete:', e);
    }
  }, [reloadDir, currentFilePath, onFileDelete]);

  // ─── Context menu ───
  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, []);

  // Focus rename/create inputs when shown
  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming]);
  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  // Get parent path for context menu actions
  const getParentPath = useCallback((entry: FileEntry | null) => {
    if (entry) {
      return entry.isDir ? entry.path : entry.path.split(/[/\\]/).slice(0, -1).join('/');
    }
    return rootPath || '';
  }, [rootPath]);

  const rootName = useMemo(() => {
    if (!rootPath) return null;
    return rootPath.split(/[/\\]/).pop() || rootPath;
  }, [rootPath]);

  const renderEntry = (entry: FileEntry, depth: number = 0): React.JSX.Element => {
    const isExpanded = expandedDirs.has(entry.path);
    const isActive = entry.path === currentFilePath;
    const isRenaming = renaming?.path === entry.path;

    return (
      <div key={entry.path}>
        <div
          className={`file-tree-item ${isActive ? 'active' : ''} ${entry.isDir ? 'is-dir' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (!isRenaming) {
              if (entry.isDir) toggleDir(entry);
              else onFileSelect(entry.path);
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, entry)}
        >
          <span className="file-tree-icon">
            {entry.isDir ? (isExpanded ? '📂' : '📁') : '📄'}
          </span>
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="file-tree-rename-input"
              defaultValue={entry.name}
              onBlur={(e) => handleRename(entry.path, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="file-tree-name">{entry.name}</span>
          )}
        </div>
        {entry.isDir && isExpanded && entry.children && (
          <div className="file-tree-children">
            {creating?.parentPath === entry.path && (
              <div className="file-tree-item" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
                <span className="file-tree-icon">{creating.isDir ? '📁' : '📄'}</span>
                <input
                  ref={createInputRef}
                  className="file-tree-rename-input"
                  placeholder={creating.isDir ? '新文件夹' : '新文件.md'}
                  onBlur={(e) => handleCreate(e.target.value, entry.path, creating.isDir)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setCreating(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            {entry.children.map(child => renderEntry(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // New file/folder button in header
  const handleNewFile = useCallback(() => {
    setCreating({ parentPath: rootPath || '', isDir: false });
  }, [rootPath]);

  if (!isTauri()) {
    return (
      <div className="file-tree">
        <div className="file-tree-header">
          <span className="file-tree-title">文件</span>
        </div>
        <div className="file-tree-empty">
          <span>文件树仅在桌面版可用</span>
        </div>
      </div>
    );
  }

  return (
    <div className="file-tree" onContextMenu={(e) => handleContextMenu(e, null)}>
      <div className="file-tree-header">
        <span className="file-tree-title">{rootName || '文件'}</span>
        <div className="file-tree-actions">
          <button className="file-tree-action-btn" onClick={handleNewFile} title="新建文件">📄+</button>
          <button className="file-tree-action-btn" onClick={() => setCreating({ parentPath: rootPath || '', isDir: true })} title="新建文件夹">📁+</button>
          <button className="file-tree-action-btn" onClick={handleOpenFolder} title="打开文件夹">📂</button>
        </div>
      </div>

      {loading && <div className="file-tree-loading">加载中...</div>}

      {!rootPath && !loading && (
        <div className="file-tree-empty">
          <button className="file-tree-open-folder" onClick={handleOpenFolder}>
            打开文件夹
          </button>
        </div>
      )}

      {rootPath && !loading && (
        <div className="file-tree-content">
          {creating?.parentPath === rootPath && (
            <div className="file-tree-item" style={{ paddingLeft: '8px' }}>
              <span className="file-tree-icon">{creating.isDir ? '📁' : '📄'}</span>
              <input
                ref={createInputRef}
                className="file-tree-rename-input"
                placeholder={creating.isDir ? '新文件夹' : '新文件.md'}
                onBlur={(e) => handleCreate(e.target.value, rootPath, creating.isDir)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setCreating(null);
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {entries.length === 0 && !creating ? (
            <div className="file-tree-empty" onClick={() => handleNewFile()}>无文件，点击新建</div>
          ) : (
            entries.map(entry => renderEntry(entry))
          )}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="file-tree-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.entry ? (
            <>
              <button className="ctx-menu-item" onClick={() => {
                if (!contextMenu.entry!.isDir) onFileSelect(contextMenu.entry!.path);
                setContextMenu(null);
              }}>打开</button>
              <button className="ctx-menu-item" onClick={() => {
                setRenaming({ path: contextMenu.entry!.path, originalName: contextMenu.entry!.name });
                setContextMenu(null);
              }}>重命名</button>
              <div className="ctx-menu-separator" />
              <button className="ctx-menu-item ctx-danger" onClick={() => {
                handleDelete(contextMenu.entry!.path, contextMenu.entry!.isDir);
                setContextMenu(null);
              }}>删除</button>
            </>
          ) : (
            <>
              <button className="ctx-menu-item" onClick={() => {
                setCreating({ parentPath: getParentPath(null), isDir: false });
                setContextMenu(null);
              }}>新建文件</button>
              <button className="ctx-menu-item" onClick={() => {
                setCreating({ parentPath: getParentPath(null), isDir: true });
                setContextMenu(null);
              }}>新建文件夹</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
