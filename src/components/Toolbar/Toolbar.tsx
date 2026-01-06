import { ThemeSelector } from '../ThemeSelector';
import './Toolbar.css';

interface ToolbarProps {
  theme: string;
  onThemeChange: (theme: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  showEditor: boolean;
  showPreview: boolean;
  onToggleEditor: () => void;
  onTogglePreview: () => void;
}

export function Toolbar({
  theme,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  showEditor,
  showPreview,
  onToggleEditor,
  onTogglePreview,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="toolbar-brand">
          <span className="brand-icon">📝</span>
          <span className="brand-text">MD.AI</span>
        </div>
      </div>

      <div className="toolbar-center">
        {/* 视图切换 */}
        <div className="toolbar-group">
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
