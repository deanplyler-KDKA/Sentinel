mod appdata;
mod commands;
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
