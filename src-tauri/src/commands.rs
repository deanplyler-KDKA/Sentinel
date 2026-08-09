use crate::models::{CollectorError, SecuritySnapshot, TimelineEvent};
use crate::{appdata, defender, firewall, network, nord, timeline, windows};
use serde::Serialize;

/// The only IPC command in Phase 1. Zero arguments by design — the frontend
/// cannot influence what runs (see docs/SECURITY.md).
#[tauri::command]
pub async fn get_security_snapshot() -> SecuritySnapshot {
    tauri::async_runtime::spawn_blocking(collect_snapshot)
        .await
        .unwrap_or_else(|e| SecuritySnapshot {
            collected_at: chrono::Utc::now().to_rfc3339(),
            defender: None,
            firewall: None,
            system: None,
            network: None,
            vpn: None,
            errors: vec![CollectorError {
                source: "runtime".into(),
                message: format!("snapshot task failed: {e}"),
            }],
        })
}

fn collect_snapshot() -> SecuritySnapshot {
    // Collectors are independent; run them in parallel so a snapshot takes
    // about as long as the slowest single PowerShell call.
    let (defender, firewall, system, network, vpn) = std::thread::scope(|s| {
        let d = s.spawn(defender::collect);
        let f = s.spawn(firewall::collect);
        let sys = s.spawn(windows::collect);
        let n = s.spawn(network::collect);
        let v = s.spawn(nord::collect);
        (
            d.join().unwrap_or_else(|_| Err("defender collector panicked".into())),
            f.join().unwrap_or_else(|_| Err("firewall collector panicked".into())),
            sys.join().unwrap_or_else(|_| Err("system collector panicked".into())),
            n.join().unwrap_or_else(|_| Err("network collector panicked".into())),
            v.join().unwrap_or_else(|_| Err("vpn collector panicked".into())),
        )
    });

    let mut errors = Vec::new();

    fn take<T>(errors: &mut Vec<CollectorError>, source: &str, result: Result<T, String>) -> Option<T> {
        match result {
            Ok(v) => Some(v),
            Err(message) => {
                errors.push(CollectorError {
                    source: source.into(),
                    message,
                });
                None
            }
        }
    }

    let defender = take(&mut errors, "defender", defender);
    let firewall = take(&mut errors, "firewall", firewall);
    let system = take(&mut errors, "system", system);
    let network = take(&mut errors, "network", network);
    let vpn = take(&mut errors, "vpn", vpn);

    for e in &errors {
        appdata::log(&format!("collector error [{}]: {}", e.source, e.message));
    }

    let snapshot = SecuritySnapshot {
        collected_at: chrono::Utc::now().to_rfc3339(),
        defender,
        firewall,
        system,
        network,
        vpn,
        errors,
    };
    timeline::record(&snapshot);
    snapshot
}

/// Returns the most recent timeline events (newest first). Zero arguments.
#[tauri::command]
pub fn get_timeline() -> Result<Vec<TimelineEvent>, String> {
    timeline::list()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub log_path: String,
}

/// Version and data-location info for the About page. Zero arguments.
#[tauri::command]
pub fn get_app_info() -> AppInfo {
    let dir = appdata::data_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "(not initialized)".into());
    AppInfo {
        version: env!("CARGO_PKG_VERSION").into(),
        log_path: format!("{dir}\\logs\\sentinel.log"),
        data_dir: dir,
    }
}

/// Writes a diagnostics bundle to Downloads; returns its path. Zero arguments.
#[tauri::command]
pub fn export_diagnostics(app: tauri::AppHandle) -> Result<String, String> {
    appdata::export_diagnostics(&app)
}

/// Resets Sentinel's own stored data (never Windows state). Zero arguments.
#[tauri::command]
pub fn reset_app_data(app: tauri::AppHandle) -> Result<String, String> {
    appdata::reset(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// End-to-end smoke test: runs the real collectors on this machine and
    /// requires every section to parse. Run with `cargo test -- --nocapture`.
    #[test]
    fn snapshot_collects_every_section() {
        let snap = collect_snapshot();
        println!("{}", serde_json::to_string_pretty(&snap).unwrap());
        assert!(snap.errors.is_empty(), "collector errors: {:?}", snap.errors);
        assert!(snap.defender.is_some());
        assert!(snap.firewall.is_some());
        assert!(snap.system.is_some());
        assert!(snap.network.is_some());
        assert!(snap.vpn.is_some());
    }
}
