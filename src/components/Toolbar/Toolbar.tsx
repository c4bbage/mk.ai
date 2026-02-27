import { useState, useRef, useEffect } from 'react';
import { ThemeSelector } from '../ThemeSelector';
import type { ImageStorageStrategy } from '../../types';
import './Toolbar.css';

interface ToolbarProps {
  theme: string;
  onThemeChange: (theme: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  showEditor: boolean;
  showPreview: boolean;
  showOutline: boolean;
  showFileTree?: boolean;
  onToggleEditor: () => void;
  onTogglePreview: () => void;
  onToggleOutline: () => void;
  onToggleFileTree?: () => void;
  // 文件操作
  fileName?: string;
  isModified?: boolean;
  onOpenFile: () => void;
  onSaveFile: () => void;
  onSaveFileAs: () => void;
  onExportHTML: () => void;
  onExportPDF: () => void;
  onExportImage: () => void;
  onCopyWeChat?: () => void;
  // 图片存储设置
  imageStorage?: ImageStorageStrategy;
  onImageStorageChange?: (strategy: ImageStorageStrategy) => void;
  // 自动保存
  autoSave?: boolean;
  onAutoSaveChange?: (enabled: boolean) => void;
}

const IMAGE_STORAGE_OPTIONS: { value: ImageStorageStrategy; label: string; icon: string }[] = [
  { value: 'assets', label: '同名文件夹', icon: '📁' },
  { value: 'images', label: './images/', icon: '🖼️' },
  { value: 'base64', label: '内嵌 Base64', icon: '📎' },
];

export function Toolbar({
  theme,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  showEditor,
  showPreview,
  showOutline,
  showFileTree,
  onToggleEditor,
  onTogglePreview,
  onToggleOutline,
  onToggleFileTree,
  fileName = 'untitled.md',
  isModified = false,
  onOpenFile,
  onSaveFile,
  onSaveFileAs,
  onExportHTML,
  onExportPDF,
  onExportImage,
  onCopyWeChat,
  imageStorage = 'assets',
  onImageStorageChange,
  autoSave = true,
  onAutoSaveChange,
}: ToolbarProps) {
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target as Node)) {
        setShowFileMenu(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="toolbar-brand">
          <span className="brand-icon">📝</span>
          <span className="brand-text">MD.AI</span>
        </div>

        {/* 文件菜单 */}
        <div className="menu-container" ref={fileMenuRef}>
          <button
            className="toolbar-btn menu-trigger"
            onClick={() => setShowFileMenu(!showFileMenu)}
          >
            <span className="btn-icon">📄</span>
            <span className="btn-text">文件</span>
            <span className="menu-arrow">▾</span>
          </button>
          {showFileMenu && (
            <div className="dropdown-menu">
              <button className="menu-item" onClick={() => { onOpenFile(); setShowFileMenu(false); }}>
                <span className="menu-icon">📂</span>
                <span className="menu-label">打开</span>
                <span className="menu-shortcut">⌘O</span>
              </button>
              <button className="menu-item" onClick={() => { onSaveFile(); setShowFileMenu(false); }}>
                <span className="menu-icon">💾</span>
                <span className="menu-label">保存</span>
                <span className="menu-shortcut">⌘S</span>
              </button>
              <button className="menu-item" onClick={() => { onSaveFileAs(); setShowFileMenu(false); }}>
                <span className="menu-icon">📑</span>
                <span className="menu-label">另存为</span>
                <span className="menu-shortcut">⇧⌘S</span>
              </button>
              <div className="menu-divider" />
              <div className="menu-submenu-container" ref={exportMenuRef}>
                <button
                  className="menu-item has-submenu"
                  onClick={() => setShowExportMenu(!showExportMenu)}
                >
                  <span className="menu-icon">📤</span>
                  <span className="menu-label">导出</span>
                  <span className="menu-arrow">▸</span>
                </button>
                {showExportMenu && (
                  <div className="dropdown-submenu">
                    <button className="menu-item" onClick={() => { onExportHTML(); setShowFileMenu(false); setShowExportMenu(false); }}>
                      <span className="menu-icon">🌐</span>
                      <span className="menu-label">HTML</span>
                    </button>
                    <button className="menu-item" onClick={() => { onExportPDF(); setShowFileMenu(false); setShowExportMenu(false); }}>
                      <span className="menu-icon">📕</span>
                      <span className="menu-label">PDF</span>
                    </button>
                    <button className="menu-item" onClick={() => { onExportImage(); setShowFileMenu(false); setShowExportMenu(false); }}>
                      <span className="menu-icon">🖼️</span>
                      <span className="menu-label">图片 (PNG)</span>
                    </button>
                    {onCopyWeChat && (
                      <>
                        <div className="menu-divider" />
                        <button className="menu-item" onClick={() => { onCopyWeChat(); setShowFileMenu(false); setShowExportMenu(false); }}>
                          <span className="menu-icon">📋</span>
                          <span className="menu-label">复制公众号格式</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 文件名显示 */}
        <div className="file-name">
          <span className="file-name-text">{fileName}</span>
          {isModified && <span className="file-modified">•</span>}
        </div>

        {/* 设置菜单 */}
        <div className="menu-container" ref={settingsMenuRef}>
          <button
            className="toolbar-btn menu-trigger"
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            title="设置"
          >
            <span className="btn-icon">⚙️</span>
          </button>
          {showSettingsMenu && (
            <div className="dropdown-menu settings-menu">
              <div className="menu-section-title">图片存储方式</div>
              {IMAGE_STORAGE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  className={`menu-item ${imageStorage === option.value ? 'active' : ''}`}
                  onClick={() => {
                    onImageStorageChange?.(option.value);
                    setShowSettingsMenu(false);
                  }}
                >
                  <span className="menu-icon">{option.icon}</span>
                  <span className="menu-label">{option.label}</span>
                  {imageStorage === option.value && <span className="menu-check">✓</span>}
                </button>
              ))}
              
              <div className="menu-divider" />
              
              <div className="menu-section-title">自动保存</div>
              <button
                className={`menu-item ${autoSave ? 'active' : ''}`}
                onClick={() => {
                  onAutoSaveChange?.(!autoSave);
                }}
              >
                <span className="menu-icon">{autoSave ? '✅' : '⬜'}</span>
                <span className="menu-label">自动保存</span>
                <span className="menu-hint">{autoSave ? '已开启' : '已关闭'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-center">
        {/* 视图切换 */}
        <div className="toolbar-group">
          {onToggleFileTree && (
            <button
              className={`toolbar-btn ${showFileTree ? 'active' : ''}`}
              onClick={onToggleFileTree}
              title="显示/隐藏文件树"
            >
              <span className="btn-icon">📁</span>
              <span className="btn-text">文件</span>
            </button>
          )}
          <button
            className={`toolbar-btn ${showOutline ? 'active' : ''}`}
            onClick={onToggleOutline}
            title="显示/隐藏大纲"
          >
            <span className="btn-icon">📑</span>
            <span className="btn-text">大纲</span>
          </button>
          <button
            className={`toolbar-btn ${showEditor ? 'active' : ''}`}
            onClick={onToggleEditor}
            title="显示/隐藏编辑器"
          >
            <span className="btn-icon">✏️</span>
            <span className="btn-text">编辑</span>
          </button>
          <button
            className={`toolbar-btn ${showPreview ? 'active' : ''}`}
            onClick={onTogglePreview}
            title="显示/隐藏预览"
          >
            <span className="btn-icon">👁️</span>
            <span className="btn-text">预览</span>
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* 字体大小 */}
        <div className="toolbar-group">
          <label className="toolbar-label">字号</label>
          <div className="font-size-control">
            <button
              className="font-btn"
              onClick={() => fontSize > 12 && onFontSizeChange(fontSize - 1)}
              disabled={fontSize <= 12}
            >
              −
            </button>
            <span className="font-size-value">{fontSize}</span>
            <button
              className="font-btn"
              onClick={() => fontSize < 24 && onFontSizeChange(fontSize + 1)}
              disabled={fontSize >= 24}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="toolbar-right">
        {/* 主题滑动选择器 */}
        <ThemeSelector theme={theme} onChange={onThemeChange} />
      </div>
    </div>
  );
}
