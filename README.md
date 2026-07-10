# MD.AI

一款现代、跨平台的 Markdown 编辑器，采用 Typora 风格设计，基于 Tauri 2 + React 19 + CodeMirror 6 构建。

## 特性

- **所见即所得** — 实时预览，编辑器与预览双向滚动同步
- **22 套文章主题** — GitHub、微信系列、Mdnice 系列、纯暗、暖纸、薰衣草等
- **7 套代码高亮主题** — Atom One Dark/Light、Monokai、GitHub、VS2015、XCode、Mac
- **主题与代码主题正交** — 文章主题和代码主题可任意搭配
- **多格式导出** — HTML、PDF（打印）、图片（复制到剪贴板）
- **多格式复制** — 微信公众号格式、富文本 HTML、Markdown 原文
- **数学公式** — KaTeX 渲染行内公式 `$...$` 和块级公式 `$$...$$`
- **Mermaid 图表** — 流程图、时序图、甘特图、脑图等，文字不裁剪
- **大纲面板** — 自动提取标题，支持拖拽排序、升降级、点击跳转，颜色跟随主题
- **文件树** — 浏览项目目录，右键菜单支持新建/重命名/删除
- **多标签页** — 同时编辑多个文档，崩溃恢复
- **自动保存** — 可配置延迟（1s/2s/5s/10s），定时备份
- **最近打开文件** — 原生菜单 `File ▸ Open Recent`，最多 15 条，持久化
- **常用主题 Top 3** — 自动统计导出/复制时使用的主题，在 `View ▸ Theme` 顶部展示
- **Vim 模式** — 可选 Vim 快捷键
- **图片智能处理** — 粘贴/拖拽图片自动插入，支持 Base64/Assets/Images/绝对路径存储
- **状态栏** — 保存状态、文件名、视图模式切换、光标位置、选中字数、主题快切、字数统计
- **暗色模式** — 跟随系统/手动切换，全组件适配

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl+N` | 新建 |
| `Cmd/Ctrl+O` | 打开 |
| `Cmd/Ctrl+S` | 保存 |
| `Cmd/Ctrl+Shift+S` | 另存为 |
| `Cmd/Ctrl+B` | 加粗 |
| `Cmd/Ctrl+I` | 斜体 |
| `Cmd/Ctrl+K` | 链接 |
| `Cmd/Ctrl+\` | 大纲 |
| `Cmd/Ctrl+Shift+\` | 文件树 |
| `Cmd/Ctrl+Shift+C` | 复制公众号格式 |
| `Cmd/Ctrl+Shift+D` | 切换暗色模式 |
| `Cmd/Ctrl+Shift+V` | 切换 Vim |
| `Cmd/Ctrl+/` | 注释/取消注释（编辑器内） |

## 构建

### 前置条件

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri 2 前置依赖](https://tauri.app/start/prerequisites/)

### 本地开发

```bash
npm install
npm run tauri:dev
```

### 生产构建

```bash
# macOS (Apple Silicon)
npm run tauri:build:mac-arm

# macOS (Intel / Universal)
npm run tauri:build:mac-intel
npm run tauri:build:mac-universal

# Windows
npm run tauri:build:windows
```

### 测试

```bash
npm test          # 单元测试
npm run lint      # ESLint
```

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript 5.9 + Vite 7 |
| 编辑器 | CodeMirror 6 |
| Markdown | marked + marked-highlight + highlight.js |
| 公式 | KaTeX |
| 图表 | Mermaid 11 |
| 状态管理 | Zustand 5 (persist) |
| 后端 | Rust |

## 项目结构

```
md.ai/
├── src/                    # React 前端
│   ├── App.tsx             # 主应用
│   ├── components/         # 组件 (Editor, Preview, Outline, FileTree, StatusBar, TabBar)
│   ├── themes/             # 主题 CSS + 注册表
│   ├── stores/             # Zustand store
│   ├── hooks/              # useMenuEvents, useAutoSave, usePipelineWorker
│   ├── lib/                # 导出、Markdown 解析、图片处理、数学、Mermaid
│   └── workers/            # Web Worker (Markdown 解析流水线)
├── src-tauri/              # Rust 后端
│   ├── src/main.rs         # 原生菜单 + Tauri 命令
│   └── tauri.conf.json     # 应用配置
└── package.json
```

## 下载

前往 [Releases](../../releases) 下载对应平台的安装包：

- **macOS (Apple Silicon)**: `MD.AI_1.0.0_aarch64.dmg`
- **macOS (Intel)**: `MD.AI_1.0.0_x64.dmg`
- **Windows**: `MD.AI_1.0.0_x64-setup.exe`

## License

MIT
