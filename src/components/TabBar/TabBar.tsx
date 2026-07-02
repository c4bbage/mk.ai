import { memo, useCallback, useRef } from 'react';
import { useEditorStore } from '../../stores/editor';

export const TabBar = memo(function TabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const switchTab = useEditorStore((s) => s.switchTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const dragTabId = useRef<string | null>(null);

  const handleClick = useCallback((id: string) => {
    switchTab(id);
  }, [switchTab]);

  const handleClose = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    closeTab(id);
  }, [closeTab]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    dragTabId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(() => {
    // Tab reordering could be added here in the future
    dragTabId.current = null;
  }, []);

  if (tabs.length <= 1) return null;

  return (
    <div className="tab-bar">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => handleClick(tab.id)}
          draggable
          onDragStart={(e) => handleDragStart(e, tab.id)}
          onDragOver={handleDragOver}
          onDrop={() => handleDrop()}
          title={tab.filePath || tab.fileName}
        >
          <span className="tab-name">{tab.isModified ? '● ' : ''}{tab.fileName}</span>
          <button
            className="tab-close"
            onClick={(e) => handleClose(e, tab.id)}
            title="关闭"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
});
