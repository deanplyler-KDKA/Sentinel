//! Slow-changing hardware facts: GPU, battery, physical disk health.
//! One PowerShell spawn, cached for 10 minutes — this data doesn't move.

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::powershell::run_json;

const CACHE_TTL: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub driver: String,
    /// As reported by Win32_VideoController; can understate real VRAM on
    /// some systems — presented as "reported" in the UI.
    pub vram_mb: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    /// Win32_Battery BatteryStatus code (1 = discharging, 2 = on AC, ...).
    pub status: i32,
    pub charge_pct: Option<i32>,
    /// Full-charge vs design capacity — often unsupported by firmware; None
    /// renders as "Unavailable", never as a made-up 100%.
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub gpus: Vec<GpuInfo>,
    pub battery: Option<BatteryInfo>,
    pub physical_disks: Vec<PhysicalDiskInfo>,
}

// Read-only CIM/Storage queries. Battery health tries root\wmi capacity
// classes and fails closed to null (verified unsupported on some firmware).
// Per-query -ErrorAction SilentlyContinue is deliberate (F10): a missing
// battery (desktop) or GPU class is legitimate absence, not an error — each
// section independently degrades to empty/null. The UI renders those as
// "Unavailable", never as fabricated healthy hardware.
// The PSModulePath pin must stay the first statement — see powershell.rs.
const SCRIPT: &str = r#"
$env:PSModulePath = [Environment]::GetFolderPath('System') + '\WindowsPowerShell\v1.0\Modules;' + [Environment]::GetFolderPath('ProgramFiles') + '\WindowsPowerShell\Modules';
[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$gpus = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | ForEach-Object {
  [pscustomobject]@{
    name = [string]$_.Name;
    driver = [string]$_.DriverVersion;
    vramMb = $(if ($_.AdapterRAM -gt 0) { [int64]($_.AdapterRAM / 1MB) } else { $null })
  }
});
$bat = $null;
$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1;
if ($b) {
  $health = $null;
  try {
    $full = (Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity -ErrorAction Stop | Select-Object -First 1).FullChargedCapacity;
    $design = (Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData -ErrorAction Stop | Select-Object -First 1).DesignedCapacity;
    if ($full -gt 0 -and $design -gt 0) { $health = [int][math]::Min(100, [math]::Round($full / $design * 100)) }
  } catch { };
  $bat = [pscustomobject]@{
    status = [int]$b.BatteryStatus;
    chargePct = $(if ($null -ne $b.EstimatedChargeRemaining) { [int]$b.EstimatedChargeRemaining } else { $null });
    healthPct = $health
  }
};
$disks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object {
  [pscustomobject]@{
    model = [string]$_.FriendlyName;
    media = [string]$_.MediaType;
    health = [string]$_.HealthStatus;
    bus = [string]$_.BusType;
    sizeGb = [int64]($_.Size / 1GB)
  }
});
ConvertTo-Json -InputObject ([pscustomobject]@{ gpus = $gpus; battery = $bat; physicalDisks = $disks }) -Depth 4 -Compress
"#;

static CACHE: OnceLock<Mutex<Option<(Instant, HardwareInfo)>>> = OnceLock::new();

pub fn collect() -> Result<HardwareInfo, String> {
    let cache = CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some((at, info)) = guard.as_ref() {
            if at.elapsed() < CACHE_TTL {
                return Ok(info.clone());
            }
        }
    }
    let info: HardwareInfo = run_json(SCRIPT)?;
    if let Ok(mut guard) = cache.lock() {
        *guard = Some((Instant::now(), info.clone()));
    }
    Ok(info)
}
