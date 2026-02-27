import { useState, useEffect, useCallback, useMemo } from 'react';
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
}

export function FileTree({ currentFilePath, onFileSelect, onFolderOpen }: FileTreeProps) {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Derive root from current file path
  useEffect(() => {
    if (currentFilePath && isTauri()) {
      const dir = currentFilePath.split(/[/\\]/).slice(0, -1).join('/');
      if (dir && dir !== rootPath) {
        setRootPath(dir);
      }
    }
  }, [currentFilePath, rootPath]);

  // Load directory contents
  const loadDirectory = useCallback(async (dirPath: string): Promise<FileEntry[]> => {
    if (!isTauri()) return [];
    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const items = await fs.readDir(dirPath);
      const fileEntries: FileEntry[] = [];

      for (const item of items) {
        const name = item.name;
        if (!name || name.startsWith('.')) continue; // skip hidden files
        const fullPath = `${dirPath}/${name}`;
        const isDir = item.isDirectory;

        if (isDir || /\.(md|markdown|txt)$/i.test(name)) {
          fileEntries.push({ name, path: fullPath, isDir });
        }
      }

      // Sort: dirs first, then alphabetical
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

  // Load root directory
  useEffect(() => {
    if (!rootPath) return;
    setLoading(true);
    loadDirectory(rootPath).then(items => {
      setEntries(items);
      setLoading(false);
    });
  }, [rootPath, loadDirectory]);

  // Open folder dialog
  const handleOpenFolder = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const dialog = await import('@tauri-apps/plugin-dialog');
      const selected = await dialog.open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setRootPath(selected);
        setExpandedDirs(new Set());
        onFolderOpen?.(selected);
      }
    } catch (e) {
      console.error('[FileTree] Failed to open folder:', e);
    }
  }, [onFolderOpen]);

  // Toggle directory expansion
  const toggleDir = useCallback(async (entry: FileEntry) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(entry.path)) {
      newExpanded.delete(entry.path);
    } else {
      newExpanded.add(entry.path);
      // Load children if not already loaded
      if (!entry.children) {
        const children = await loadDirectory(entry.path);
        entry.children = children;
        // Force re-render by creating new entries array
        setEntries(prev => [...prev]);
      }
    }
    setExpandedDirs(newExpanded);
  }, [expandedDirs, loadDirectory]);

  const rootName = useMemo(() => {
    if (!rootPath) return null;
    return rootPath.split(/[/\\]/).pop() || rootPath;
  }, [rootPath]);

  // Render a single entry
  const renderEntry = (entry: FileEntry, depth: number = 0): React.JSX.Element => {
    const isExpanded = expandedDirs.has(entry.path);
    const isActive = entry.path === currentFilePath;

    return (
      <div key={entry.path}>
        <div
          className={`file-tree-item ${isActive ? 'active' : ''} ${entry.isDir ? 'is-dir' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (entry.isDir) {
              toggleDir(entry);
            } else {
              onFileSelect(entry.path);
            }
          }}
        >
          <span className="file-tree-icon">
            {entry.isDir ? (isExpanded ? '📂' : '📁') : '📄'}
          </span>
          <span className="file-tree-name">{entry.name}</span>
        </div>
        {entry.isDir && isExpanded && entry.children && (
          <div className="file-tree-children">
            {entry.children.map(child => renderEntry(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

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
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="file-tree-title">文件</span>
        <button className="file-tree-open-btn" onClick={handleOpenFolder} title="打开文件夹">
          📂
        </button>
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
          <div className="file-tree-root-name" title={rootPath}>
            {rootName}
          </div>
          {entries.length === 0 ? (
            <div className="file-tree-empty">无 Markdown 文件</div>
          ) : (
            entries.map(entry => renderEntry(entry))
          )}
        </div>
      )}
    </div>
  );
}
