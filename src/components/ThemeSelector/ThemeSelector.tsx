import { useRef, useEffect } from 'react';
import { THEMES } from '../../themes';
import './ThemeSelector.css';

interface ThemeSelectorProps {
  theme: string;
  onChange: (theme: string) => void;
}

export function ThemeSelector({ theme, onChange }: ThemeSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndex = THEMES.findIndex(t => t.id === theme);

  // 滚动到当前选中的主题
  useEffect(() => {
    if (containerRef.current) {
      const activeBtn = containerRef.current.querySelector('.theme-btn.active');
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [theme]);

  // 键盘左右切换
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && activeIndex > 0) {
      onChange(THEMES[activeIndex - 1].id);
    } else if (e.key === 'ArrowRight' && activeIndex < THEMES.length - 1) {
      onChange(THEMES[activeIndex + 1].id);
    }
  };

  // 鼠标滚轮切换
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaX > 0 || e.deltaY > 0) {
      // 向右/向下滚动 -> 下一个主题
      if (activeIndex < THEMES.length - 1) {
        onChange(THEMES[activeIndex + 1].id);
      }
    } else if (e.deltaX < 0 || e.deltaY < 0) {
      // 向左/向上滚动 -> 上一个主题
      if (activeIndex > 0) {
        onChange(THEMES[activeIndex - 1].id);
      }
    }
  };

  return (
    <div 
      className="theme-selector"
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      tabIndex={0}
    >
      {/* 左箭头 */}
      <button
        className="theme-arrow theme-arrow-left"
        onClick={() => activeIndex > 0 && onChange(THEMES[activeIndex - 1].id)}
        disabled={activeIndex === 0}
        title="上一个主题"
      >
        ‹
      </button>

      {/* 主题按钮列表 */}
      <div className="theme-list" ref={containerRef}>
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={`theme-btn ${t.id === theme ? 'active' : ''}`}
            onClick={() => onChange(t.id)}
            style={{
              '--theme-color': getThemeColor(t.id),
            } as React.CSSProperties}
          >
            <span className="theme-dot" />
            <span className="theme-name">{t.name}</span>
          </button>
        ))}
      </div>

      {/* 右箭头 */}
      <button
        className="theme-arrow theme-arrow-right"
        onClick={() => activeIndex < THEMES.length - 1 && onChange(THEMES[activeIndex + 1].id)}
        disabled={activeIndex === THEMES.length - 1}
        title="下一个主题"
      >
        ›
      </button>

      {/* 进度指示器 */}
      <div className="theme-indicator">
        {THEMES.map((t) => (
          <span
            key={t.id}
            className={`indicator-dot ${t.id === theme ? 'active' : ''}`}
            onClick={() => onChange(t.id)}
            style={{
              '--dot-color': getThemeColor(t.id),
            } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

// 获取主题对应的颜色
function getThemeColor(themeId: string): string {
  const colors: Record<string, string> = {
    'github': '#0366d6',
    'wechat-elegant': '#ff6827',
    'wechat-green': '#07c160',
    'wechat-blue': '#409eff',
  };
  return colors[themeId] || '#666';
}
