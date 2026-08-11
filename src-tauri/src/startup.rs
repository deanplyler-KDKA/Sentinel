//! Startup applications — strictly read-only. Sentinel never enables or
//! disables anything; it explains what starts with Windows and lets the user
//! act in Windows' own settings.

use serde::{Deserialize, Serialize};

use crate::powershell::run_json;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupApp {
    pub name: String,
    pub command: String,
    pub location: String,
    pub publisher: Option<String>,
    /// From Explorer's StartupApproved flags; missing entry = enabled.
    pub enabled: bool,
}

// Read-only: Win32_StartupCommand + StartupApproved byte flags (first byte
// even = enabled). Publisher comes from the executable's version metadata
// when the path can be extracted safely. Measured startup impact is not
// reliably exposed to user-mode apps, so it is NOT reported (the UI says
// "Unavailable" rather than inventing numbers).
// The PSModulePath pin must stay the first statement — see powershell.rs.
const SCRIPT: &str = r#"
$env:PSModulePath = [Environment]::GetFolderPath('System') + '\WindowsPowerShell\v1.0\Modules;' + [Environment]::GetFolderPath('ProgramFiles') + '\WindowsPowerShell\Modules';
[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$approved = @{};
foreach ($p in 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run',
               'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder',
               'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run') {
  try {
    $item = Get-Item $p -ErrorAction Stop;
    foreach ($name in $item.Property) {
      $v = $item.GetValue($name);
      if ($v -is [byte[]] -and $v.Length -gt 0) { $approved[$name] = (($v[0] -band 1) -eq 0) }
    }
  } catch { }
};
$apps = @(Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue | ForEach-Object {
  $cmd = [string]$_.Command;
  $publisher = $null;
  try {
    $exe = $null;
    if ($cmd -match '^\s*\"([^\"]+\.exe)\"') { $exe = $Matches[1] }
    elseif ($cmd -match '^\s*([^\s\"]+\.exe)') { $exe = $Matches[1] };
    if ($exe -and (Test-Path $exe)) {
      $company = (Get-Item $exe).VersionInfo.CompanyName;
      if ($company) { $publisher = [string]$company }
    }
  } catch { };
  $enabled = $true;
  if ($approved.ContainsKey([string]$_.Name)) { $enabled = $approved[[string]$_.Name] };
  [pscustomobject]@{
    name = [string]$_.Name;
    command = $cmd;
    location = [string]$_.Location;
    publisher = $publisher;
    enabled = $enabled
  }
});
ConvertTo-Json -InputObject @($apps) -Depth 3 -Compress
"#;

pub fn collect() -> Result<Vec<StartupApp>, String> {
    run_json(SCRIPT)
}
