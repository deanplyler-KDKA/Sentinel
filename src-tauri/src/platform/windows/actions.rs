//! Safe maintenance actions: opening the relevant Windows settings page so a
//! suggestion can be acted on in one click.
//!
//! SECURITY: Sentinel still changes nothing itself — it only asks Windows to
//! show the user the page where *they* can decide. The IPC parameter is a
//! closed `SettingsTarget` enum, not a string: serde rejects anything outside
//! the listed variants, so the WebView can never supply a URI, path, or
//! argument of its own. Each variant maps to a compile-time constant URI, and
//! explorer.exe is invoked by absolute path (same reasoning as
//! powershell.rs::system_powershell — never resolve a launcher by name).

use crate::models::SettingsTarget;
use std::path::PathBuf;
use std::process::Command;


impl SettingsTarget {
    /// Fixed URI per variant. `windowsdefender:` and `ms-settings:` are the
    /// documented Windows protocol handlers for these pages.
    fn uri(self) -> &'static str {
        match self {
            Self::WindowsUpdate => "ms-settings:windowsupdate",
            Self::WindowsSecurity => "windowsdefender:",
            Self::VirusProtection => "windowsdefender://threat",
            Self::RansomwareProtection => "windowsdefender://ransomware",
            Self::FirewallProtection => "windowsdefender://network",
            Self::DeviceEncryption => "ms-settings:deviceencryption",
            Self::Storage => "ms-settings:storagesense",
            Self::StartupApps => "ms-settings:startupapps",
            Self::NetworkStatus => "ms-settings:network-status",
            Self::WifiSettings => "ms-settings:network-wifi",
            Self::PowerAndBattery => "ms-settings:powersleep",
        }
    }
}

fn system_explorer() -> PathBuf {
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    PathBuf::from(system_root).join("explorer.exe")
}

/// Opens the settings page. Returns Ok as soon as the request is handed to
/// Windows — explorer detaches immediately, so there is no exit status worth
/// waiting for.
pub fn open(target: SettingsTarget) -> Result<(), String> {
    Command::new(system_explorer())
        .arg(target.uri())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("couldn't open Windows settings: {e}"))
}
