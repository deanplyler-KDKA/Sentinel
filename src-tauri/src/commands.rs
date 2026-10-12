use crate::models::{CollectorError, HardwareInfo, NetworkDetail, SecuritySnapshot, SettingsTarget,
    SpeedTestRow, StartupApp, TimelineEvent};
use crate::platform::{actions, defender, firewall, hardware, netinfo, network, nord, startup,
    system};
use crate::{appdata, diag, netprobe, perf, settings, speedtest, timeline};
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

pub fn collect_snapshot() -> SecuritySnapshot {
    // Collectors are independent; run them in parallel so a snapshot takes
    // about as long as the slowest single PowerShell call.
    let (defender, firewall, system, network, vpn) = std::thread::scope(|s| {
        let d = s.spawn(|| diag::track("security/defender", defender::collect));
        let f = s.spawn(|| diag::track("security/firewall", firewall::collect));
        let sys = s.spawn(|| diag::track("security/system", system::collect));
        let n = s.spawn(|| diag::track("security/network", network::collect));
        let v = s.spawn(|| diag::track("security/vpn", nord::collect));
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

// ── Performance / hardware / network intelligence ────────────────────────
// Every command below is zero-argument (docs/SECURITY.md): the WebView can
// only ask for a whole, predefined dataset.

/// Latest full performance snapshot from the in-memory sampler. `null` for
/// the first ~2 seconds after launch — UI renders "Checking".
#[tauri::command]
pub fn get_perf_overview() -> Option<perf::PerfOverview> {
    perf::get_overview()
}

/// Rolling ~6-minute window of 2-second samples for the live charts.
#[tauri::command]
pub fn get_perf_series() -> Vec<perf::PerfPoint> {
    perf::get_series()
}

#[tauri::command]
pub async fn get_hardware_info() -> Result<HardwareInfo, String> {
    tauri::async_runtime::spawn_blocking(|| diag::track("hardware", hardware::collect))
        .await
        .map_err(|e| format!("task failed: {e}"))?
}

#[tauri::command]
pub async fn get_network_detail() -> Result<NetworkDetail, String> {
    tauri::async_runtime::spawn_blocking(|| diag::track("network/detail", netinfo::collect))
        .await
        .map_err(|e| format!("task failed: {e}"))?
}

/// Active connection-quality probe (TCP latency/jitter/loss + DNS timing).
#[tauri::command]
pub async fn run_net_probe() -> Result<netprobe::NetProbe, String> {
    tauri::async_runtime::spawn_blocking(|| diag::track("network/probe", netprobe::probe))
        .await
        .map_err(|e| format!("task failed: {e}"))?
}

/// User-initiated internet speed test. `engine` is a closed enum (see
/// speedtest::SpeedEngine) — the WebView selects a service, it cannot supply
/// a URL.
#[tauri::command]
pub async fn run_speed_test(
    engine: speedtest::SpeedEngine,
) -> Result<speedtest::SpeedTestResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        diag::track("network/speedtest", || speedtest::run(engine))
    })
    .await
    .map_err(|e| format!("task failed: {e}"))?
}

#[tauri::command]
pub fn get_speedtest_history() -> Result<Vec<SpeedTestRow>, String> {
    timeline::list_speedtests()
}

#[tauri::command]
pub async fn get_startup_apps() -> Result<Vec<StartupApp>, String> {
    tauri::async_runtime::spawn_blocking(|| diag::track("startup-apps", startup::collect))
        .await
        .map_err(|e| format!("task failed: {e}"))?
}

/// Collector health for the developer diagnostics area.
#[tauri::command]
pub fn get_diagnostics() -> Vec<diag::CollectorStatus> {
    diag::all()
}

/// Opens a Windows settings page so the user can act on a suggestion.
///
/// This is the one command that takes a parameter, and deliberately so: the
/// type is a closed enum (see actions.rs), not a string. serde rejects any
/// value outside the listed variants, so the WebView selects from a fixed
/// menu rather than supplying a target. Sentinel still changes nothing — it
/// only navigates the user to Windows' own UI.
#[tauri::command]
pub fn open_windows_setting(target: SettingsTarget) -> Result<(), String> {
    actions::open(target)
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

/// Saves a shareable health report. The frontend renders the text (it already
/// holds the scores and suggestions); the backend owns the destination path.
#[tauri::command]
pub fn export_report(app: tauri::AppHandle, content: String) -> Result<String, String> {
    appdata::export_report(&app, &content)
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

// ── Settings ─────────────────────────────────────────────────────────────

/// Current user preferences. Zero arguments.
#[tauri::command]
pub fn get_settings() -> settings::Settings {
    settings::get()
}

/// Saves preferences and applies the side effects that belong to the OS:
/// registering or clearing the login item. Values are clamped in
/// `settings::save` — the frontend cannot set a 0-minute polling loop.
#[tauri::command]
pub fn set_settings(
    app: tauri::AppHandle,
    value: settings::Settings,
) -> Result<settings::Settings, String> {
    let saved = settings::save(value)?;
    apply_autostart(&app, saved.start_with_system)?;
    Ok(saved)
}

/// Autostart is a real change to the user's machine, so it is only ever made
/// in response to an explicit toggle, and failures surface rather than being
/// silently swallowed.
fn apply_autostart(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let currently = manager.is_enabled().unwrap_or(false);
    if enabled && !currently {
        manager.enable().map_err(|e| format!("couldn't add Sentinel to startup: {e}"))?;
        appdata::log("autostart enabled");
    } else if !enabled && currently {
        manager.disable().map_err(|e| format!("couldn't remove Sentinel from startup: {e}"))?;
        appdata::log("autostart disabled");
    }
    Ok(())
}
