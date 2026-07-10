import { memo, useCallback, useRef } from 'react';
import { useEditorStore } from '../../stores/editor';

export const TabBar = memo(function TabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const switchTab = useEditorStore((s) => s.switchTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const reorderTabs = useEditorStore((s) => s.reorderTabs);
  const dragTabId = useRef<string | null>(null);

  const handleClick = useCallback((id: string) => {
    switchTab(id);
  }, [switchTab]);

  const handleClose = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.id === id);
    if (tab?.isModified) {
      if (!window.confirm(`"${tab.fileName}" 有未保存的修改，确定关闭？`)) return;
    }
    closeTab(id);
  }, [closeTab, tabs]);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    dragTabId.current = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((targetId: string) => {
    if (dragTabId.current && dragTabId.current !== targetId) {
      reorderTabs(dragTabId.current, targetId);
    }
    dragTabId.current = null;
  }, [reorderTabs]);

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
          onDrop={() => handleDrop(tab.id)}
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
