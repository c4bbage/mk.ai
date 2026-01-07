# Tauri 插件配置指南

## 问题回顾：plugin dialog not found 错误

### 问题现象
```
[Error] plugin dialog not found
[Error] plugin fs not found
```

### 根本原因

这是 **Tauri 2.x 版本**的配置问题，有两个主要原因：

#### 1. 主要问题：Rust 后端未注册插件

**问题**：在 `Cargo.toml` 中添加了插件依赖，但在 `main.rs` 中没有初始化插件。

```toml
# Cargo.toml - 添加了依赖 ✅
[dependencies]
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
```

```rust
// main.rs - 但没有初始化插件 ❌
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())  // 只有 shell
        // 缺少 fs 和 dialog 插件的初始化！
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**解决方案**：
```rust
// main.rs - 正确的配置 ✅
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())      // ✅ 添加 fs 插件
        .plugin(tauri_plugin_dialog::init())  // ✅ 添加 dialog 插件
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### 2. 次要问题：tauri.conf.json 使用了旧版本配置格式

**问题**：在 Tauri 2.x 中，插件配置格式已经改变。

```json
// tauri.conf.json - Tauri 1.x 的配置格式 ❌
{
  "plugins": {
    "fs": {
      "scope": ["**"]  // ❌ Tauri 2.x 中不再支持
    }
  }
}
```

**错误信息**：
```
Error deserializing 'plugins.fs': unknown field `scope`, 
expected `requireLiteralLeadingDot`
```

**解决方案**：
```json
// tauri.conf.json - Tauri 2.x 的配置格式 ✅
{
  "plugins": {}  // ✅ 空对象或删除 plugins 字段
}
```

**权限配置迁移到 capabilities 文件**：
```json
// src-tauri/capabilities/default.json ✅
{
  "identifier": "default",
  "permissions": [
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "dialog:default",
    "dialog:allow-open",
    "dialog:allow-save",
    {
      "identifier": "fs:scope",
      "allow": [
        "$HOME/**",
        "/Users/**"
      ]
    }
  ]
}
```

## Tauri 2.x 插件配置最佳实践

### 步骤 1：安装插件依赖

#### 1.1 安装前端依赖
```bash
npm install @tauri-apps/plugin-dialog
npm install @tauri-apps/plugin-fs
npm install @tauri-apps/plugin-shell
```

#### 1.2 安装 Rust 依赖
```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-shell = "2"
```

### 步骤 2：在 Rust 后端注册插件

**⚠️ 关键步骤**：必须在 `main.rs` 中初始化每个插件！

```rust
// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**记忆口诀**：
- ✅ **Cargo.toml 添加依赖 → main.rs 必须初始化**
- ❌ 只添加依赖不初始化 = 插件不可用

### 步骤 3：配置插件权限（capabilities）

在 Tauri 2.x 中，权限配置通过 `capabilities` 文件管理：

```json
// src-tauri/capabilities/default.json
{
  "$schema": "https://schema.tauri.app/config/2/capability",
  "identifier": "default",
  "description": "Default capabilities",
  "windows": ["main"],
  "permissions": [
    // Core 权限
    "core:default",
    
    // Dialog 插件权限
    "dialog:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "dialog:allow-message",
    "dialog:allow-confirm",
    
    // FS 插件权限
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-write-file",
    "fs:allow-read-file",
    "fs:allow-exists",
    "fs:allow-mkdir",
    "fs:allow-create",
    "fs:allow-copy-file",
    "fs:allow-remove",
    "fs:allow-rename",
    "fs:allow-read-dir",
    
    // FS 文件系统访问范围
    {
      "identifier": "fs:scope",
      "allow": [
        "**",
        "$HOME/**",
        "$DOCUMENT/**",
        "$DESKTOP/**",
        "$DOWNLOAD/**",
        "/Users/**",
        "/Volumes/**"
      ]
    }
  ]
}
```

### 步骤 4：清理 tauri.conf.json

Tauri 2.x 中 `tauri.conf.json` 的 `plugins` 部分应该保持简洁：

```json
{
  "plugins": {}  // ✅ 空对象或完全省略
}
```

**不要在这里配置插件选项**，所有权限配置都在 `capabilities/*.json` 中。

### 步骤 5：在前端使用插件

```typescript
// src/lib/file.ts
import * as dialog from '@tauri-apps/plugin-dialog';
import * as fs from '@tauri-apps/plugin-fs';

// 打开文件
const filePath = await dialog.open({
  multiple: false,
  filters: [{ name: 'Markdown', extensions: ['md'] }]
});

// 读取文件
const content = await fs.readTextFile(filePath);

// 保存文件
await fs.writeTextFile(filePath, content);
```

## 常见错误与解决方案

### 错误 1：plugin not found

**原因**：Rust 后端未初始化插件

**解决**：
```rust
// ❌ 错误
fn main() {
    tauri::Builder::default()
        .run(...)
}

// ✅ 正确
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .run(...)
}
```

### 错误 2：unknown field `scope` in plugins.fs

**原因**：使用了 Tauri 1.x 的配置格式

**解决**：
```json
// ❌ 错误 (Tauri 1.x)
{
  "plugins": {
    "fs": { "scope": ["**"] }
  }
}

// ✅ 正确 (Tauri 2.x)
{
  "plugins": {}
}
```

权限配置移至 `capabilities/default.json`。

### 错误 3：Permission denied

**原因**：`capabilities` 中未配置足够的权限

**解决**：在 `capabilities/default.json` 中添加所需权限：
```json
{
  "permissions": [
    "fs:allow-read-text-file",
    {
      "identifier": "fs:scope",
      "allow": ["$HOME/**"]
    }
  ]
}
```

## Tauri 1.x vs 2.x 插件配置对比

| 配置项 | Tauri 1.x | Tauri 2.x |
|--------|-----------|-----------|
| 插件依赖 | `Cargo.toml` | `Cargo.toml` (相同) |
| 插件初始化 | `main.rs` | `main.rs` (相同) |
| 权限配置 | `tauri.conf.json` 的 `plugins` 字段 | `capabilities/*.json` ⚠️ 已迁移 |
| 文件系统 scope | `plugins.fs.scope` | `capabilities` 中的 `fs:scope` ⚠️ 已迁移 |
| 前端 API | `@tauri-apps/api` | `@tauri-apps/plugin-*` ⚠️ 已分离 |

## 检查清单

新增 Tauri 插件时，按此清单检查：

- [ ] 1. 安装前端依赖：`npm install @tauri-apps/plugin-xxx`
- [ ] 2. 添加 Rust 依赖：在 `Cargo.toml` 中添加 `tauri-plugin-xxx`
- [ ] 3. **初始化插件**：在 `main.rs` 中添加 `.plugin(tauri_plugin_xxx::init())`
- [ ] 4. 配置权限：在 `capabilities/default.json` 中添加权限
- [ ] 5. 清理旧配置：确保 `tauri.conf.json` 的 `plugins` 字段为空
- [ ] 6. 重启开发服务器：`npm run tauri:dev`

## 参考资料

- [Tauri 2.x 插件文档](https://v2.tauri.app/plugin/)
- [Tauri 2.x Capabilities 配置](https://v2.tauri.app/security/capabilities/)
- [Tauri 2.x Migration Guide](https://v2.tauri.app/start/migrate/from-tauri-1/)
- [Dialog 插件文档](https://v2.tauri.app/plugin/dialog/)
- [FS 插件文档](https://v2.tauri.app/plugin/fs/)

## 总结

**核心原则**：
1. 🔑 **依赖 + 初始化 = 可用**：在 Cargo.toml 添加依赖后，必须在 main.rs 中初始化
2. 🔐 **权限在 capabilities**：Tauri 2.x 的所有权限配置都在 `capabilities/*.json`
3. 🧹 **清理旧配置**：删除 `tauri.conf.json` 中的 `plugins` 配置

**调试技巧**：
- 遇到 `plugin not found`：检查 `main.rs` 的插件初始化
- 遇到 `unknown field`：检查 `tauri.conf.json` 是否有旧配置
- 遇到 `permission denied`：检查 `capabilities/*.json` 的权限配置
