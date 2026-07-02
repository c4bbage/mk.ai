// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    // ─── File Menu ───
    let new_item = MenuItem::with_id(app, "file:new", "New", true, Some("CmdOrCtrl+N"))?;
    let open_item = MenuItem::with_id(app, "file:open", "Open...", true, Some("CmdOrCtrl+O"))?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let save_item = MenuItem::with_id(app, "file:save", "Save", true, Some("CmdOrCtrl+S"))?;
    let save_as_item =
        MenuItem::with_id(app, "file:save_as", "Save As...", true, Some("CmdOrCtrl+Shift+S"))?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let export_html =
        MenuItem::with_id(app, "file:export_html", "Export as HTML", true, None::<&str>)?;
    let export_pdf =
        MenuItem::with_id(app, "file:export_pdf", "Export as PDF", true, None::<&str>)?;
    let export_image =
        MenuItem::with_id(app, "file:export_image", "Export as Image", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let copy_html = MenuItem::with_id(
        app,
        "file:copy_html",
        "Copy as HTML",
        true,
        None::<&str>,
    )?;
    let copy_markdown = MenuItem::with_id(
        app,
        "file:copy_markdown",
        "Copy as Markdown",
        true,
        None::<&str>,
    )?;
    let copy_wechat = MenuItem::with_id(
        app,
        "file:copy_wechat",
        "Copy as WeChat Format",
        true,
        Some("CmdOrCtrl+Shift+C"),
    )?;
    let sep3b = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit"))?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &new_item,
            &open_item,
            &sep1,
            &save_item,
            &save_as_item,
            &sep2,
            &export_html,
            &export_pdf,
            &export_image,
            &sep3,
            &copy_html,
            &copy_markdown,
            &copy_wechat,
            &sep3b,
            &quit,
        ],
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

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[&undo, &redo, &sep4, &cut, &copy, &paste, &select_all, &sep5, &find_item],
    )?;

    // ─── Format Menu ───
    let bold = MenuItem::with_id(app, "fmt:bold", "Bold", true, Some("CmdOrCtrl+B"))?;
    let italic = MenuItem::with_id(app, "fmt:italic", "Italic", true, Some("CmdOrCtrl+I"))?;
    let underline =
        MenuItem::with_id(app, "fmt:underline", "Underline", true, Some("CmdOrCtrl+U"))?;
    let strikethrough = MenuItem::with_id(
        app,
        "fmt:strikethrough",
        "Strikethrough",
        true,
        Some("CmdOrCtrl+Shift+X"),
    )?;
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
    let normal =
        MenuItem::with_id(app, "fmt:normal", "Normal Paragraph", true, Some("CmdOrCtrl+0"))?;

    let format_menu = Submenu::with_items(
        app,
        "Format",
        true,
        &[
            &bold, &italic, &underline, &strikethrough, &code, &sep6, &link, &sep7, &h1, &h2, &h3,
            &h4, &h5, &h6, &normal,
        ],
    )?;

    // ─── View Menu ───
    let toggle_source = MenuItem::with_id(
        app,
        "view:toggle_source",
        "Toggle Source / Preview",
        true,
        Some("CmdOrCtrl+/"),
    )?;
    let toggle_outline = MenuItem::with_id(
        app,
        "view:toggle_outline",
        "Toggle Outline",
        true,
        Some("CmdOrCtrl+\\"),
    )?;
    let toggle_filetree = MenuItem::with_id(
        app,
        "view:toggle_filetree",
        "Toggle File Tree",
        true,
        Some("CmdOrCtrl+Shift+\\"),
    )?;
    let sep8 = PredefinedMenuItem::separator(app)?;
    let zoom_in = MenuItem::with_id(app, "view:zoom_in", "Zoom In", true, Some("CmdOrCtrl+="))?;
    let zoom_out = MenuItem::with_id(app, "view:zoom_out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
    let zoom_reset =
        MenuItem::with_id(app, "view:zoom_reset", "Reset Zoom", true, Some("CmdOrCtrl+Shift+0"))?;
    let sep9 = PredefinedMenuItem::separator(app)?;
    let toggle_autosave =
        MenuItem::with_id(app, "view:toggle_autosave", "Toggle Auto Save", true, None::<&str>)?;
    let toggle_dark_mode = MenuItem::with_id(
        app,
        "view:toggle_dark_mode",
        "Toggle Dark Mode",
        true,
        Some("CmdOrCtrl+Shift+D"),
    )?;
    let toggle_vim = MenuItem::with_id(
        app,
        "view:toggle_vim",
        "Toggle Vim Mode",
        true,
        Some("CmdOrCtrl+Shift+V"),
    )?;

    // Font submenu
    let font_system = MenuItem::with_id(app, "font:system", "System Default", true, None::<&str>)?;
    let font_pingfang = MenuItem::with_id(app, "font:pingfang", "PingFang SC", true, None::<&str>)?;
    let font_yahei = MenuItem::with_id(app, "font:yahei", "Microsoft YaHei", true, None::<&str>)?;
    let font_sourcererif = MenuItem::with_id(app, "font:source-han-serif", "Source Han Serif", true, None::<&str>)?;
    let font_optima = MenuItem::with_id(app, "font:optima", "Optima", true, None::<&str>)?;
    let font_menu = Submenu::with_items(
        app,
        "Font",
        true,
        &[&font_system, &font_pingfang, &font_yahei, &font_sourcererif, &font_optima],
    )?;

    // Code Font submenu
    let cf_jetbrains = MenuItem::with_id(app, "codefont:jetbrains", "JetBrains Mono", true, None::<&str>)?;
    let cf_fira = MenuItem::with_id(app, "codefont:fira", "Fira Code", true, None::<&str>)?;
    let cf_consolas = MenuItem::with_id(app, "codefont:consolas", "Consolas", true, None::<&str>)?;
    let cf_monaco = MenuItem::with_id(app, "codefont:monaco", "Monaco", true, None::<&str>)?;
    let codefont_menu = Submenu::with_items(
        app,
        "Code Font",
        true,
        &[&cf_jetbrains, &cf_fira, &cf_consolas, &cf_monaco],
    )?;

    // Image Storage submenu
    let img_base64 = MenuItem::with_id(app, "image:base64", "Base64 (Inline)", true, None::<&str>)?;
    let img_assets = MenuItem::with_id(app, "image:assets", "Assets Folder (Typora)", true, None::<&str>)?;
    let img_images = MenuItem::with_id(app, "image:images", "Images Folder", true, None::<&str>)?;
    let img_absolute = MenuItem::with_id(app, "image:absolute", "Absolute Path", true, None::<&str>)?;
    let image_menu = Submenu::with_items(
        app,
        "Image Storage",
        true,
        &[&img_base64, &img_assets, &img_images, &img_absolute],
    )?;

    // Autosave Delay submenu
    let asd_1s = MenuItem::with_id(app, "autosave_delay:1000", "1 second", true, None::<&str>)?;
    let asd_2s = MenuItem::with_id(app, "autosave_delay:2000", "2 seconds", true, None::<&str>)?;
    let asd_5s = MenuItem::with_id(app, "autosave_delay:5000", "5 seconds", true, None::<&str>)?;
    let asd_10s = MenuItem::with_id(app, "autosave_delay:10000", "10 seconds", true, None::<&str>)?;
    let asd_menu = Submenu::with_items(
        app,
        "Auto-Save Delay",
        true,
        &[&asd_1s, &asd_2s, &asd_5s, &asd_10s],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &toggle_source,
            &toggle_outline,
            &toggle_filetree,
            &sep8,
            &zoom_in,
            &zoom_out,
            &zoom_reset,
            &sep9,
            &toggle_autosave,
            &toggle_dark_mode,
            &toggle_vim,
            &font_menu,
            &codefont_menu,
            &image_menu,
            &asd_menu,
        ],
    )?;

    // ─── Theme Menu ───
    let theme_github = MenuItem::with_id(app, "theme:github", "GitHub", true, None::<&str>)?;
    let theme_wechat_elegant = MenuItem::with_id(app, "theme:wechat-elegant", "WeChat Elegant", true, None::<&str>)?;
    let theme_wechat_green = MenuItem::with_id(app, "theme:wechat-green", "WeChat Green", true, None::<&str>)?;
    let theme_wechat_blue = MenuItem::with_id(app, "theme:wechat-blue", "WeChat Blue", true, None::<&str>)?;
    let theme_pure_dark = MenuItem::with_id(app, "theme:pure-dark", "Pure Dark", true, None::<&str>)?;
    let theme_newsprint = MenuItem::with_id(app, "theme:newsprint", "Newsprint", true, None::<&str>)?;
    let theme_lavender = MenuItem::with_id(app, "theme:lavender", "Lavender", true, None::<&str>)?;
    let theme_mdc_light = MenuItem::with_id(app, "theme:mdc-light", "MDC Light", true, None::<&str>)?;
    let theme_mdc_dark = MenuItem::with_id(app, "theme:mdc-dark", "MDC Dark", true, None::<&str>)?;
    let theme_mmd_default = MenuItem::with_id(app, "theme:mmd-default", "MMD Default", true, None::<&str>)?;
    let theme_mmd_breeze = MenuItem::with_id(app, "theme:mmd-breeze", "MMD Breeze", true, None::<&str>)?;

    let theme_menu = Submenu::with_items(
        app,
        "Theme",
        true,
        &[
            &theme_github,
            &theme_wechat_elegant,
            &theme_wechat_green,
            &theme_wechat_blue,
            &theme_pure_dark,
            &theme_newsprint,
            &theme_lavender,
            &theme_mdc_light,
            &theme_mdc_dark,
            &theme_mmd_default,
            &theme_mmd_breeze,
        ],
    )?;

    // ─── Tools Menu ───
    let extract_images = MenuItem::with_id(
        app,
        "tools:extract_images",
        "Extract Images to Files",
        true,
        None::<&str>,
    )?;

    let tools_menu = Submenu::with_items(app, "Tools", true, &[&extract_images])?;

    // ─── Help Menu ───
    let about = MenuItem::with_id(app, "help:about", "About MD.AI", true, None::<&str>)?;

    let help_menu = Submenu::with_items(app, "Help", true, &[&about])?;

    Menu::with_items(
        app,
        &[
            &file_menu,
            &edit_menu,
            &format_menu,
            &view_menu,
            &theme_menu,
            &tools_menu,
            &help_menu,
        ],
    )
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;

            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                let id = event.id().as_ref().to_string();
                let _ = handle.emit("menu-event", &id);
            });

            // Log window creation
            if let Some(window) = app.get_webview_window("main") {
                println!("[setup] window created, label: {}", window.label());
                let _ = window.set_focus();
            } else {
                eprintln!("[setup] ERROR: main window not found!");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
