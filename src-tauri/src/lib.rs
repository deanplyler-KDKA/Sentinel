use tauri::Manager;

mod appdata;
mod commands;

/// System tray: open, refresh, quit. Start-with-Windows and background
/// monitoring are deliberately not implemented yet (user-controlled opt-ins,
/// planned with the notifications work — see ROADMAP.md).
fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::tray::TrayIconBuilder;
    use tauri::Emitter;

    let open = MenuItemBuilder::with_id("open", "Open Sentinel").build(app)?;
    let refresh = MenuItemBuilder::with_id("refresh", "Refresh status").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&open, &refresh, &quit]).build()?;

    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Sentinel — Personal Security Center")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "refresh" => {
                show_main_window(app);
                let _ = app.emit("tray-refresh", ());
            }
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// The configured 1100x600 default is small enough to fit even short scaled
/// displays (e.g. an ultrawide at 200% with a ~670px-tall logical work area),
/// so Windows never force-maximizes the window at creation — restoring a
/// window mid-maximize proved racy. On roomier monitors, grow toward
/// 1200x820. Margins leave room for the taskbar and title bar.
fn fit_window_to_monitor(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window("main") else { return };
    let Ok(Some(monitor)) = win.current_monitor() else { return };
    if win.is_maximized().unwrap_or(false) || win.is_minimized().unwrap_or(false) {
        return; // don't fight the window manager or a user action
    }
    let scale = monitor.scale_factor();
    let logical_w = monitor.size().width as f64 / scale;
    let logical_h = monitor.size().height as f64 / scale;
    // Short displays (scaled ultrawides) trade width for height: the UI
    // switches to a sidebar layout that needs the extra columns.
    let max_w = if logical_h < 760.0 { 1640.0 } else { 1200.0 };
    let w = f64::min(max_w, logical_w - 80.0).max(860.0);
    let h = f64::min(820.0, logical_h - 110.0).max(520.0);
    let _ = win.set_size(tauri::LogicalSize::new(w, h));
    let _ = win.center();
}
mod actions;
mod defender;
mod diag;
mod firewall;
mod hardware;
mod models;
mod netinfo;
mod netprobe;
mod network;
mod nord;
mod perf;
mod powershell;
mod speedtest;
mod startup;
mod timeline;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Non-fatal: Sentinel still monitors if its own data dir is
            // unavailable — logging and reset just won't work.
            if let Err(e) = appdata::init(app.handle()) {
                eprintln!("appdata init failed: {e}");
            } else if let Some(dir) = appdata::data_dir() {
                // Timeline is best-effort: without it Sentinel still monitors.
                if let Err(e) = timeline::init(dir) {
                    appdata::log(&format!("timeline init failed: {e}"));
                }
            }
            fit_window_to_monitor(app.handle());
            perf::start_sampler();
            if let Err(e) = setup_tray(app.handle()) {
                appdata::log(&format!("tray setup failed: {e}"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_security_snapshot,
            commands::get_app_info,
            commands::export_diagnostics,
            commands::reset_app_data,
            commands::get_timeline,
            commands::get_perf_overview,
            commands::get_perf_series,
            commands::get_hardware_info,
            commands::get_network_detail,
            commands::run_net_probe,
            commands::run_speed_test,
            commands::get_speedtest_history,
            commands::get_startup_apps,
            commands::get_diagnostics,
            commands::open_windows_setting
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
