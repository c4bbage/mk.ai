# MD.AI

A modern, cross-platform Markdown editor with a Typora-style design, built on Tauri 2 + React 19 + CodeMirror 6.

## Features

- **Live Preview** — Real-time rendering with bidirectional scroll sync between editor and preview
- **22 Article Themes** — GitHub, WeChat series, Mdnice series, Pure Dark, Newsprint, Lavender, and more
- **7 Code Highlight Themes** — Atom One Dark/Light, Monokai, GitHub, VS2015, XCode, Mac
- **Orthogonal Themes** — Article and code themes can be mixed freely
- **Multi-format Export** — HTML, PDF (print), Image (copy to clipboard)
- **Multi-format Copy** — WeChat Official Account format, Rich HTML, Markdown source
- **Math Formulas** — KaTeX rendering for inline `$...$` and block `$$...$$`
- **Mermaid Diagrams** — Flowcharts, sequence diagrams, Gantt charts, mind maps — no text clipping
- **Outline Panel** — Auto-extracted headings with drag-to-reorder, level adjust, click-to-jump, theme-synced colors
- **File Tree** — Browse project directories with context menu (create/rename/delete)
- **Multi-tab** — Edit multiple documents simultaneously with crash recovery
- **Auto Save** — Configurable delay (1s/2s/5s/10s), periodic backup
- **Recent Files** — Native menu `File ▸ Open Recent`, up to 15 entries, persisted
- **Favorite Themes Top 3** — Auto-tracks theme usage on export/copy, shown at top of `View ▸ Theme`
- **Vim Mode** — Optional Vim keybindings
- **Smart Image Handling** — Paste/drag images with Base64/Assets/Images/Absolute path storage
- **Status Bar** — Save status, filename, view mode switcher, cursor position, selection count, quick theme switch, word count
- **Dark Mode** — Follow system or manual toggle, fully adapted

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+N` | New |
| `Cmd/Ctrl+O` | Open |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+Shift+S` | Save As |
| `Cmd/Ctrl+B` | Bold |
| `Cmd/Ctrl+I` | Italic |
| `Cmd/Ctrl+K` | Link |
| `Cmd/Ctrl+\` | Toggle Outline |
| `Cmd/Ctrl+Shift+\` | Toggle File Tree |
| `Cmd/Ctrl+Shift+C` | Copy WeChat Format |
| `Cmd/Ctrl+Shift+D` | Toggle Dark Mode |
| `Cmd/Ctrl+Shift+V` | Toggle Vim |
| `Cmd/Ctrl+/` | Toggle Comment (in editor) |

## Build

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/)

### Development

```bash
npm install
npm run tauri:dev
```

### Production Build

```bash
# macOS (Apple Silicon)
npm run tauri:build:mac-arm

# macOS (Intel / Universal)
npm run tauri:build:mac-intel
npm run tauri:build:mac-universal

# Windows
npm run tauri:build:windows
```

### Tests

```bash
npm test          # Unit tests
npm run lint      # ESLint
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri 2 |
| Frontend | React 19 + TypeScript 5.9 + Vite 7 |
| Editor | CodeMirror 6 |
| Markdown | marked + marked-highlight + highlight.js |
| Math | KaTeX |
| Diagrams | Mermaid 11 |
| State | Zustand 5 (persist) |
| Backend | Rust |

## Project Structure

```
md.ai/
├── src/                    # React frontend
│   ├── App.tsx             # Main app
│   ├── components/         # Components (Editor, Preview, Outline, FileTree, StatusBar, TabBar)
│   ├── themes/             # Theme CSS + registry
│   ├── stores/             # Zustand store
│   ├── hooks/              # useMenuEvents, useAutoSave, usePipelineWorker
│   ├── lib/                # Export, Markdown parse, image, math, mermaid
│   └── workers/            # Web Worker (Markdown pipeline)
├── src-tauri/              # Rust backend
│   ├── src/main.rs         # Native menu + Tauri commands
│   └── tauri.conf.json     # App config
└── package.json
```

## Download

Go to [Releases](../../releases) to download the installer for your platform:

- **macOS (Apple Silicon)**: `MD.AI_1.0.0_aarch64.dmg`
- **macOS (Intel)**: `MD.AI_1.0.0_x64.dmg`
- **Windows**: `MD.AI_1.0.0_x64-setup.exe`

## License

MIT
