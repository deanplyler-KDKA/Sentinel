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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestRow {
    pub id: i64,
    pub ts: String,
    pub down_mbps: f64,
    /// None when the upload leg didn't complete (SQL NULL) — not 0.
    pub up_mbps: Option<f64>,
    pub ping_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    /// "cloudflare" | "mlab" — results from different services are not
    /// directly comparable, so baselines are computed per engine.
    pub engine: String,
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

// ── Cross-platform collector contracts ───────────────────────────────────
// These shapes are the agreement between any platform backend and the UI.
// A macOS collector fills the same structs a Windows one does; anything a
// platform can't determine is None/empty and renders as "Unavailable".

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub driver: String,
    /// Reported VRAM; can understate the real figure on some systems, so the
    /// UI labels it as reported rather than authoritative.
    pub vram_mb: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    /// Platform status code (Windows Win32_Battery semantics; macOS maps onto
    /// the same small set).
    pub status: i32,
    pub charge_pct: Option<i32>,
    /// Full-charge vs design capacity. Often unsupported by PC firmware;
    /// macOS usually does report it. None renders as "Unavailable", never as
    /// a made-up 100%.
    pub health_pct: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalDiskInfo {
    pub model: String,
    pub media: String,
    pub health: String,
    pub bus: String,
    pub size_gb: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub gpus: Vec<GpuInfo>,
    pub battery: Option<BatteryInfo>,
    pub physical_disks: Vec<PhysicalDiskInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterInfo {
    pub name: String,
    pub description: String,
    pub link_speed: String,
    pub wifi: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpConfigInfo {
    pub interface: String,
    pub gateway: String,
    pub ipv4: Option<String>,
    pub ipv6: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDetail {
    pub adapters: Vec<AdapterInfo>,
    pub configs: Vec<IpConfigInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupApp {
    pub name: String,
    pub command: String,
    pub location: String,
    pub publisher: Option<String>,
    /// Whether it is set to run at sign-in. Read-only: Sentinel never changes
    /// this on any platform.
    pub enabled: bool,
}

/// The complete set of places Sentinel may send the user. Each platform maps
/// these to its own settings URLs; the frontend picks from this fixed menu and
/// can never supply a destination of its own.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SettingsTarget {
    WindowsUpdate,
    WindowsSecurity,
    VirusProtection,
    RansomwareProtection,
    FirewallProtection,
    DeviceEncryption,
    Storage,
    StartupApps,
    NetworkStatus,
    WifiSettings,
    PowerAndBattery,
}
