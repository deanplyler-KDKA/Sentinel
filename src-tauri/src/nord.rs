use crate::models::VpnStatus;
use crate::powershell::run_json;

// Read-only: detects the NordVPN install, service, app process, and whether a
// tunnel adapter (NordLynx, or TAP for OpenVPN) is up. Never touches Nord config.
const SCRIPT: &str = r#"
[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$svc = Get-Service -Name 'nordvpn-service' -ErrorAction SilentlyContinue;
$installed = (Test-Path 'C:\Program Files\NordVPN') -or ($null -ne $svc);
$app = Get-Process -Name 'NordVPN' -ErrorAction SilentlyContinue;
$lynx = Get-NetAdapter -Name 'NordLynx' -ErrorAction SilentlyContinue;
$tap = Get-NetAdapter -InterfaceDescription 'TAP-NordVPN*' -ErrorAction SilentlyContinue;
$lynxUp = ($null -ne $lynx) -and ($lynx.Status -eq 'Up');
$tapUp = ($null -ne $tap) -and (@($tap | Where-Object Status -eq 'Up').Count -gt 0);
[pscustomobject]@{
  installed = [bool]$installed;
  serviceRunning = (($null -ne $svc) -and ($svc.Status -eq 'Running'));
  appRunning = ($null -ne $app);
  connected = ($lynxUp -or $tapUp);
  adapter = $(if ($lynxUp) { 'NordLynx' } elseif ($tapUp) { 'OpenVPN (TAP)' } else { $null })
} | ConvertTo-Json -Compress
"#;

pub fn collect() -> Result<VpnStatus, String> {
    run_json(SCRIPT)
}
