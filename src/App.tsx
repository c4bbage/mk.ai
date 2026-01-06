import { useEditorStore } from './stores/editor';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { Toolbar } from './components/Toolbar';
import './App.css';

function App() {
  const {
    content,
    setContent,
    theme,
    setTheme,
    fontSize,
    setFontSize,
    showEditor,
    showPreview,
    toggleEditor,
    togglePreview,
  } = useEditorStore();

  return (
    <div className="app">
      <Toolbar
        theme={theme}
        onThemeChange={setTheme}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        showEditor={showEditor}
        showPreview={showPreview}
        onToggleEditor={toggleEditor}
        onTogglePreview={togglePreview}
      />
      
      <div className="app-content">
        {showEditor && (
          <div className="editor-panel">
            <Editor
              value={content}
              onChange={setContent}
              fontSize={fontSize}
            />
          </div>
        )}
        
        {showEditor && showPreview && <div className="panel-divider" />}
        
        {showPreview && (
          <div className="preview-panel">
            <Preview
              content={content}
              theme={theme}
              fontSize={fontSize}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
