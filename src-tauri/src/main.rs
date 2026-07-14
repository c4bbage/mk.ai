// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};

/// Stored check menu items for themes and code themes, keyed by menu item id.
type CheckItems = HashMap<String, CheckMenuItem<tauri::Wry>>;

/// Dynamic menu state (recent files + favorite themes), synced from frontend.
#[derive(Clone)]
struct MenuState {
    recents: Vec<String>,
    favorites: Vec<(String, u32)>,
    current_theme: String,
    current_code_theme: String,
}

impl Default for MenuState {
    fn default() -> Self {
        MenuState {
            recents: Vec::new(),
            favorites: Vec::new(),
            current_theme: "github".to_string(),
            current_code_theme: "atom-one-dark".to_string(),
        }
    }
}

#[derive(serde::Deserialize)]
struct FavoriteTheme {
    id: String,
    count: u32,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct MenuStateUpdate {
    recents: Vec<String>,
    favorites: Vec<FavoriteTheme>,
    current_theme: String,
    current_code_theme: String,
}

const THEME_IDS: &[(&str, &str)] = &[
    ("theme:github", "GitHub"),
    ("theme:wechat-elegant", "微信 · 优雅橙"),
    ("theme:wechat-green", "微信 · 清新绿"),
    ("theme:wechat-blue", "微信 · 科技蓝"),
    ("theme:pure-dark", "纯暗"),
    ("theme:newsprint", "暖纸"),
    ("theme:lavender", "薰衣草"),
    ("theme:mdc-light", "MDC 清爽"),
    ("theme:mdc-dark", "MDC 深蓝"),
    ("theme:mmd-default", "MMD 渐变"),
    ("theme:mmd-breeze", "MMD 微风"),
    ("theme:mdnice-default", "Mdnice · 默认"),
    ("theme:mdnice-smartisan", "Mdnice · 锤子便签"),
    ("theme:mdnice-yanqi", "Mdnice · 雁栖湖"),
    ("theme:mdnice-wechat-format", "Mdnice · WeChat格式"),
    ("theme:mdnice-minimal-black", "Mdnice · 极简黑"),
    ("theme:mdnice-shanchui", "Mdnice · 山吹"),
    ("theme:mdnice-hongfei", "Mdnice · 红绯"),
    ("theme:mdnice-lvyi", "Mdnice · 绿意"),
    ("theme:mdnice-nenqing", "Mdnice · 嫩青"),
    ("theme:mdnice-chazi", "Mdnice · 姹紫"),
    ("theme:mdnice-chengxin", "Mdnice · 橙心"),
];

const CODE_THEME_IDS: &[(&str, &str)] = &[
    ("codetheme:atom-one-dark", "Atom One Dark"),
    ("codetheme:atom-one-light", "Atom One Light"),
    ("codetheme:monokai", "Monokai"),
    ("codetheme:github", "GitHub"),
    ("codetheme:vs2015", "VS2015"),
    ("codetheme:xcode", "XCode"),
    ("codetheme:mac", "Mac 风格"),
];

fn build_menu(app: &tauri::AppHandle, state: &MenuState) -> tauri::Result<(Menu<tauri::Wry>, CheckItems)> {
    let mut check_items: CheckItems = HashMap::new();

    // ─── Export submenu (nested under File) ───
    let export_html = MenuItem::with_id(app, "file:export_html", "Export as HTML…", true, None::<&str>)?;
    let export_pdf = MenuItem::with_id(app, "file:export_pdf", "Export as PDF…", true, None::<&str>)?;
    let export_image = MenuItem::with_id(app, "file:export_image", "Copy as Image", true, None::<&str>)?;
    let export_submenu = Submenu::with_items(app, "Export", true, &[&export_html, &export_pdf, &export_image])?;

    // ─── Copy As submenu (nested under Edit) ───
    let copy_wechat = MenuItem::with_id(app, "file:copy_wechat", "WeChat Format", true, Some("CmdOrCtrl+Shift+C"))?;
    let copy_html = MenuItem::with_id(app, "file:copy_html", "Rich HTML", true, None::<&str>)?;
    let copy_markdown = MenuItem::with_id(app, "file:copy_markdown", "Markdown Source", true, None::<&str>)?;
    let copy_as_submenu = Submenu::with_items(app, "Copy As", true, &[&copy_wechat, &copy_html, &copy_markdown])?;

    // ─── Open Recent submenu (dynamic) ───
    let recent_submenu = Submenu::new(app, "Open Recent", true)?;
    if state.recents.is_empty() {
        let no_recent = MenuItem::with_id(app, "recent:empty", "No Recent Files", false, None::<&str>)?;
        recent_submenu.append(&no_recent)?;
    } else {
        for (i, path) in state.recents.iter().enumerate().take(15) {
            let name = std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(path);
            let char_count = name.chars().count();
            let label = if char_count > 50 {
                let truncated: String = name.chars().take(47).collect();
                format!("{}…", truncated)
            } else {
                name.to_string()
            };
            let item = MenuItem::with_id(app, &format!("recent:{}", i), &label, true, None::<&str>)?;
            recent_submenu.append(&item)?;
        }
        let sep_clear = PredefinedMenuItem::separator(app)?;
        recent_submenu.append(&sep_clear)?;
        let clear_item = MenuItem::with_id(app, "recent:clear", "Clear Recent Files", true, None::<&str>)?;
        recent_submenu.append(&clear_item)?;
    }

    // ─── File Menu ───
    let new_item = MenuItem::with_id(app, "file:new", "New", true, Some("CmdOrCtrl+N"))?;
    let open_item = MenuItem::with_id(app, "file:open", "Open…", true, Some("CmdOrCtrl+O"))?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let save_item = MenuItem::with_id(app, "file:save", "Save", true, Some("CmdOrCtrl+S"))?;
    let save_as_item =
        MenuItem::with_id(app, "file:save_as", "Save As…", true, Some("CmdOrCtrl+Shift+S"))?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let extract_images =
        MenuItem::with_id(app, "tools:extract_images", "Extract Images to Files", true, None::<&str>)?;
    let sep3b = PredefinedMenuItem::separator(app)?;
    let sep_export_quit = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit"))?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[&new_item, &open_item, &recent_submenu, &sep1, &save_item, &save_as_item, &sep2,
          &extract_images, &sep3b, &export_submenu, &sep_export_quit, &quit],
    )?;

    // ─── Edit Menu ───
    let undo = PredefinedMenuItem::undo(app, Some("Undo"))?;
    let redo = PredefinedMenuItem::redo(app, Some("Redo"))?;
    let sep4 = PredefinedMenuItem::separator(app)?;
    let cut = PredefinedMenuItem::cut(app, Some("Cut"))?;
    let copy = PredefinedMenuItem::copy(app, Some("Copy"))?;
    let paste = PredefinedMenuItem::paste(app, Some("Paste"))?;
    let select_all = PredefinedMenuItem::select_all(app, Some("Select All"))?;
    let sep5 = PredefinedMenuItem::separator(app)?;
    let find_item = MenuItem::with_id(app, "edit:find", "Find", true, Some("CmdOrCtrl+F"))?;
    let sep5b = PredefinedMenuItem::separator(app)?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[&undo, &redo, &sep4, &cut, &copy, &paste, &select_all, &sep5,
          &find_item, &sep5b, &copy_as_submenu],
    )?;

    // ─── Format Menu ───
    let bold = MenuItem::with_id(app, "fmt:bold", "Bold", true, Some("CmdOrCtrl+B"))?;
    let italic = MenuItem::with_id(app, "fmt:italic", "Italic", true, Some("CmdOrCtrl+I"))?;
    let underline = MenuItem::with_id(app, "fmt:underline", "Underline", true, Some("CmdOrCtrl+U"))?;
    let strikethrough = MenuItem::with_id(app, "fmt:strikethrough", "Strikethrough", true, Some("CmdOrCtrl+Shift+X"))?;
    let code = MenuItem::with_id(app, "fmt:code", "Inline Code", true, Some("CmdOrCtrl+`"))?;
    let sep6 = PredefinedMenuItem::separator(app)?;
    let link = MenuItem::with_id(app, "fmt:link", "Link", true, Some("CmdOrCtrl+K"))?;
    let sep7 = PredefinedMenuItem::separator(app)?;
    let h1 = MenuItem::with_id(app, "fmt:h1", "Heading 1", true, Some("CmdOrCtrl+1"))?;
    let h2 = MenuItem::with_id(app, "fmt:h2", "Heading 2", true, Some("CmdOrCtrl+2"))?;
    let h3 = MenuItem::with_id(app, "fmt:h3", "Heading 3", true, Some("CmdOrCtrl+3"))?;
    let h4 = MenuItem::with_id(app, "fmt:h4", "Heading 4", true, Some("CmdOrCtrl+4"))?;
    let h5 = MenuItem::with_id(app, "fmt:h5", "Heading 5", true, Some("CmdOrCtrl+5"))?;
    let h6 = MenuItem::with_id(app, "fmt:h6", "Heading 6", true, Some("CmdOrCtrl+6"))?;
    let normal = MenuItem::with_id(app, "fmt:normal", "Normal Paragraph", true, Some("CmdOrCtrl+0"))?;

    let format_menu = Submenu::with_items(
        app,
        "Format",
        true,
        &[&bold, &italic, &underline, &strikethrough, &code, &sep6, &link, &sep7,
          &h1, &h2, &h3, &h4, &h5, &h6, &normal],
    )?;

    // ─── View Menu ───
    let toggle_source = MenuItem::with_id(app, "view:toggle_source", "Toggle Source / Preview", true, None::<&str>)?;
    let toggle_outline = MenuItem::with_id(app, "view:toggle_outline", "Toggle Outline", true, Some("CmdOrCtrl+\\"))?;
    let toggle_filetree = MenuItem::with_id(app, "view:toggle_filetree", "Toggle File Tree", true, Some("CmdOrCtrl+Shift+\\"))?;
    let sep8 = PredefinedMenuItem::separator(app)?;
    let zoom_in = MenuItem::with_id(app, "view:zoom_in", "Zoom In", true, Some("CmdOrCtrl+="))?;
    let zoom_out = MenuItem::with_id(app, "view:zoom_out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
    let zoom_reset = MenuItem::with_id(app, "view:zoom_reset", "Reset Zoom", true, Some("CmdOrCtrl+Shift+0"))?;
    let sep9 = PredefinedMenuItem::separator(app)?;
    let toggle_autosave = MenuItem::with_id(app, "view:toggle_autosave", "Toggle Auto Save", true, None::<&str>)?;
    let toggle_dark_mode = MenuItem::with_id(app, "view:toggle_dark_mode", "Toggle Dark Mode", true, Some("CmdOrCtrl+Shift+D"))?;
    let toggle_vim = MenuItem::with_id(app, "view:toggle_vim", "Toggle Vim Mode", true, Some("CmdOrCtrl+Shift+V"))?;

    let font_system = MenuItem::with_id(app, "font:system", "System Default", true, None::<&str>)?;
    let font_pingfang = MenuItem::with_id(app, "font:pingfang", "PingFang SC", true, None::<&str>)?;
    let font_yahei = MenuItem::with_id(app, "font:yahei", "Microsoft YaHei", true, None::<&str>)?;
    let font_sourcererif = MenuItem::with_id(app, "font:source-han-serif", "Source Han Serif", true, None::<&str>)?;
    let font_optima = MenuItem::with_id(app, "font:optima", "Optima", true, None::<&str>)?;
    let font_menu = Submenu::with_items(app, "Font", true, &[&font_system, &font_pingfang, &font_yahei, &font_sourcererif, &font_optima])?;

    let cf_jetbrains = MenuItem::with_id(app, "codefont:jetbrains", "JetBrains Mono", true, None::<&str>)?;
    let cf_fira = MenuItem::with_id(app, "codefont:fira", "Fira Code", true, None::<&str>)?;
    let cf_consolas = MenuItem::with_id(app, "codefont:consolas", "Consolas", true, None::<&str>)?;
    let cf_monaco = MenuItem::with_id(app, "codefont:monaco", "Monaco", true, None::<&str>)?;
    let codefont_menu = Submenu::with_items(app, "Code Font", true, &[&cf_jetbrains, &cf_fira, &cf_consolas, &cf_monaco])?;

    let img_base64 = MenuItem::with_id(app, "image:base64", "Base64 (Inline)", true, None::<&str>)?;
    let img_assets = MenuItem::with_id(app, "image:assets", "Assets Folder (Typora)", true, None::<&str>)?;
    let img_images = MenuItem::with_id(app, "image:images", "Images Folder", true, None::<&str>)?;
    let img_absolute = MenuItem::with_id(app, "image:absolute", "Absolute Path", true, None::<&str>)?;
    let image_menu = Submenu::with_items(app, "Image Storage", true, &[&img_base64, &img_assets, &img_images, &img_absolute])?;

    let asd_1s = MenuItem::with_id(app, "autosave_delay:1000", "1 second", true, None::<&str>)?;
    let asd_2s = MenuItem::with_id(app, "autosave_delay:2000", "2 seconds", true, None::<&str>)?;
    let asd_5s = MenuItem::with_id(app, "autosave_delay:5000", "5 seconds", true, None::<&str>)?;
    let asd_10s = MenuItem::with_id(app, "autosave_delay:10000", "10 seconds", true, None::<&str>)?;
    let asd_menu = Submenu::with_items(app, "Auto-Save Delay", true, &[&asd_1s, &asd_2s, &asd_5s, &asd_10s])?;

    // ─── Theme Menu (with favorite themes section) ───
    let theme_menu = Submenu::new(app, "Theme", true)?;

    if !state.favorites.is_empty() {
        for (theme_id, count) in state.favorites.iter() {
            let theme_name = THEME_IDS.iter()
                .find(|(tid, _)| tid == &format!("theme:{}", theme_id))
                .map(|(_, name)| name.to_string())
                .unwrap_or_else(|| theme_id.clone());
            let label = format!("★ {} ({}次)", theme_name, count);
            let item = MenuItem::with_id(app, &format!("favtheme:{}", theme_id), &label, true, None::<&str>)?;
            theme_menu.append(&item)?;
        }
        let fav_sep = PredefinedMenuItem::separator(app)?;
        theme_menu.append(&fav_sep)?;
    }

    for (i, (id, label)) in THEME_IDS.iter().enumerate() {
        if i == 4 || i == 11 {
            let sep = PredefinedMenuItem::separator(app)?;
            theme_menu.append(&sep)?;
        }
        let checked = *id == format!("theme:{}", state.current_theme);
        let item = CheckMenuItem::with_id(app, *id, *label, true, checked, None::<&str>)?;
        check_items.insert(id.to_string(), item.clone());
        theme_menu.append(&item)?;
    }

    // ─── Code Theme Menu ───
    let code_theme_menu = Submenu::new(app, "Code Theme", true)?;
    for (id, label) in CODE_THEME_IDS.iter() {
        let checked = *id == format!("codetheme:{}", state.current_code_theme);
        let item = CheckMenuItem::with_id(app, *id, *label, true, checked, None::<&str>)?;
        check_items.insert(id.to_string(), item.clone());
        code_theme_menu.append(&item)?;
    }

    let sep_v_themes = PredefinedMenuItem::separator(app)?;
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &toggle_source, &toggle_outline, &toggle_filetree,
            &sep8,
            &zoom_in, &zoom_out, &zoom_reset,
            &sep9,
            &toggle_autosave, &toggle_dark_mode, &toggle_vim,
            &font_menu, &codefont_menu, &image_menu, &asd_menu,
            &sep_v_themes,
            &theme_menu, &code_theme_menu,
        ],
    )?;

    // ─── Help Menu ───
    let about = MenuItem::with_id(app, "help:about", "About MD.AI", true, None::<&str>)?;
    let help_menu = Submenu::with_items(app, "Help", true, &[&about])?;

    let menu = Menu::with_items(
        app,
        &[
            &file_menu,
            &edit_menu,
            &format_menu,
            &view_menu,
            &help_menu,
        ],
    )?;

    Ok((menu, check_items))
}

/// Update checkmarks: uncheck all items in the same group, check the selected one.
fn sync_checkmarks(check_items: &CheckItems, selected_id: &str, prefix: &str) {
    for (id, item) in check_items.iter() {
        if id.starts_with(prefix) {
            let _ = item.set_checked(id == selected_id);
        }
    }
}

fn rebuild_menu(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.try_state::<Mutex<MenuState>>()
        .ok_or("MenuState not found")?;
    let s = state.lock().map_err(|e| e.to_string())?;
    let (menu, check_items) = build_menu(app, &s).map_err(|e| e.to_string())?;
    drop(s);

    if let Some(check_state) = app.try_state::<Mutex<CheckItems>>() {
        let mut cs = check_state.lock().map_err(|e| e.to_string())?;
        *cs = check_items;
    }

    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_menu_state(
    app: tauri::AppHandle,
    menu_state_manager: tauri::State<Mutex<MenuState>>,
    update: MenuStateUpdate,
) -> Result<(), String> {
    {
        let mut s = menu_state_manager.lock().map_err(|e| e.to_string())?;
        s.recents = update.recents;
        s.favorites = update.favorites.iter().map(|f| (f.id.clone(), f.count)).collect();
        s.current_theme = update.current_theme;
        s.current_code_theme = update.current_code_theme;
    }
    rebuild_menu(&app)?;
    Ok(())
}

fn main() {
    // Check for file path in command-line args (Windows/Linux file association)
    let args: Vec<String> = std::env::args().collect();
    let startup_file: Option<String> = args.get(1).and_then(|p| {
        let lower = p.to_lowercase();
        if lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".txt") {
            Some(p.clone())
        } else {
            None
        }
    });

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![update_menu_state])
        .setup(move |app| {
            let initial_state = MenuState::default();
            let (menu, check_items) = build_menu(app.handle(), &initial_state)?;
            app.set_menu(menu)?;
            app.manage(Mutex::new(check_items));
            app.manage(Mutex::new(initial_state));

            let handle = app.handle().clone();
            app.on_menu_event(move |app, event| {
                let id = event.id().as_ref().to_string();

                // Sync radio checkmarks for theme / code-theme groups on click
                if id.starts_with("theme:") || id.starts_with("codetheme:") {
                    let prefix = if id.starts_with("theme:") { "theme:" } else { "codetheme:" };
                    if let Some(state) = app.try_state::<Mutex<CheckItems>>() {
                        if let Ok(check_items) = state.lock() {
                            sync_checkmarks(&check_items, &id, prefix);
                        }
                    }
                }

                let _ = handle.emit("menu-event", &id);
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }

            // Emit startup file (from command-line args) after frontend loads
            if let Some(ref path) = startup_file {
                let handle = app.handle().clone();
                let path = path.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    let _ = handle.emit("open-file", &path);
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    let path_str = path.to_string_lossy().to_string();
                    let _ = app_handle.emit("open-file", &path_str);
                }
            }
        }
        let _ = event; // silence unused warnings on non-macOS
    });
}
