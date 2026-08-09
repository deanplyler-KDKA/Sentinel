use serde::{Deserialize, Serialize};

/// The full normalized security state sent to the frontend.
/// A `None` section means that collector failed — details land in `errors`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecuritySnapshot {
    pub collected_at: String,
    pub defender: Option<DefenderStatus>,
    pub firewall: Option<FirewallStatus>,
    pub system: Option<SystemStatus>,
    pub network: Option<NetworkStatus>,
    pub vpn: Option<VpnStatus>,
    pub errors: Vec<CollectorError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectorError {
    pub source: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefenderStatus {
    pub antivirus_enabled: bool,
    pub real_time_protection: bool,
    pub behavior_monitoring: bool,
    pub tamper_protection: bool,
    pub cloud_protection: bool,
    pub pua_protection: bool,
    pub controlled_folder_access: bool,
    pub signature_version: String,
    pub signature_age_days: Option<u32>,
    pub signature_last_updated: Option<String>,
    pub quick_scan_end: Option<String>,
    pub quick_scan_age_days: Option<u32>,
    pub full_scan_end: Option<String>,
    pub full_scan_age_days: Option<u32>,
    pub running_mode: String,
    /// Non-Defender antivirus products registered in SecurityCenter2.
    #[serde(default)]
    pub third_party_av: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirewallStatus {
    pub domain: bool,
    pub private: bool,
    pub public: bool,
}

/// Raw shape emitted by the windows.rs PowerShell script; BitLocker arrives
/// as the Shell COM protection code and is mapped to a state string in Rust.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawSystemStatus {
    pub os_name: String,
    pub os_version: String,
    pub display_version: Option<String>,
    pub computer_name: String,
    pub last_boot: String,
    pub secure_boot: Option<bool>,
    pub bitlocker: Option<i64>,
    pub update_last_search: Option<String>,
    pub update_last_install: Option<String>,
    pub reboot_required: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub os_name: String,
    pub os_version: String,
    pub display_version: Option<String>,
    pub computer_name: String,
    pub last_boot: String,
    pub secure_boot: Option<bool>,
    pub bitlocker: BitLockerState,
    pub update_last_search: Option<String>,
    pub update_last_install: Option<String>,
    pub reboot_required: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BitLockerState {
    On,
    Off,
    Encrypting,
    Decrypting,
    Suspended,
    Locked,
    Unknown,
}

impl BitLockerState {
    /// Maps the Shell `System.Volume.BitLockerProtection` property codes.
    pub fn from_code(code: Option<i64>) -> Self {
        match code {
            Some(1) => Self::On,
            Some(0) | Some(2) => Self::Off,
            Some(3) => Self::Encrypting,
            Some(4) => Self::Decrypting,
            Some(5) => Self::Suspended,
            Some(6) => Self::Locked,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProfile {
    pub name: String,
    pub interface: String,
    pub category: String,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsEntry {
    pub interface: String,
    pub servers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStatus {
    pub profiles: Vec<NetworkProfile>,
    pub dns: Vec<DnsEntry>,
    /// Server addresses with DoH actually enabled on some interface
    /// (Dnscache registry), not merely DoH-capable.
    #[serde(default)]
    pub doh_servers: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub id: i64,
    pub ts: String,
    pub category: String,
    pub kind: String,
    pub severity: String,
    pub message: String,
    pub detail: Option<String>,
    /// True when the change was detected on launch — it happened at some
    /// point while Sentinel was closed, not at `ts`.
    pub after_gap: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VpnStatus {
    pub installed: bool,
    pub service_running: bool,
    pub app_running: bool,
    pub connected: bool,
    pub adapter: Option<String>,
}
