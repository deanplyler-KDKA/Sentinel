use tauri::Manager;

mod appdata;
mod commands;

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
mod defender;
mod firewall;
mod models;
mod network;
mod nord;
mod powershell;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Non-fatal: Sentinel still monitors if its own data dir is
            // unavailable — logging and reset just won't work.
            if let Err(e) = appdata::init(app.handle()) {
                eprintln!("appdata init failed: {e}");
            }
            fit_window_to_monitor(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_security_snapshot,
            commands::get_app_info,
            commands::export_diagnostics,
            commands::reset_app_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
