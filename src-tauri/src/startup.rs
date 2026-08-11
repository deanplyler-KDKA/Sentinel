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
// reliably exposed to user-mode apps, so it is NOT reported.
//
// SECURITY (F1/N1): the Command field originates from user-writable HKCU\Run,
// so the extracted path is untrusted. Before touching the filesystem the path
// must (a) be drive-letter rooted (`^[A-Za-z]:\`), rejecting UNC
// (`\\host\...`, an SMB/NTLM-leak vector), `\\?\`, device and drive-relative
// paths; and (b) live on a DriveType 'Fixed' volume, rejecting a mapped
// network drive (HKCU\Network is user-writable too, so `Z:` → `\\attacker\`
// would otherwise reinstate the same vector). GetDriveType is a local call
// and does not connect. Test-Path/Get-Item use -LiteralPath so wildcards
// (`*.exe`) cannot expand. Both original vectors were verified to otherwise
// block past the 20s collector timeout, which would blank the very list that
// is supposed to expose a malicious startup entry.
//
// $q = [char]34 supplies a double-quote without putting a literal `"` in the
// command line (see the no-double-quotes invariant in powershell.rs).
// The PSModulePath pin must stay the first statement.
const SCRIPT: &str = r#"
$env:PSModulePath = [Environment]::GetFolderPath('System') + '\WindowsPowerShell\v1.0\Modules;' + [Environment]::GetFolderPath('ProgramFiles') + '\WindowsPowerShell\Modules';
[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$ErrorActionPreference='Stop';
$q = [char]34;
$approved = @{};
foreach ($p in 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run',
               'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder',
               'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run') {
  try {
    $item = Get-Item -LiteralPath $p -ErrorAction Stop;
    foreach ($name in $item.Property) {
      $v = $item.GetValue($name);
      if ($v -is [byte[]] -and $v.Length -gt 0) { $approved[$name] = (($v[0] -band 1) -eq 0) }
    }
  } catch { }
};
$apps = @(Get-CimInstance Win32_StartupCommand | ForEach-Object {
  $cmd = [string]$_.Command;
  $publisher = $null;
  try {
    $exe = $null;
    if ($cmd -match ('^\s*' + $q + '([^' + $q + ']+\.exe)' + $q)) { $exe = $Matches[1] }
    elseif ($cmd -match ('^\s*([^\s' + $q + ']+\.exe)')) { $exe = $Matches[1] };
    if ($exe -and ($exe -match '^[A-Za-z]:\\') -and
        ([System.IO.DriveInfo]::new($exe.Substring(0,3)).DriveType -eq 'Fixed') -and
        (Test-Path -LiteralPath $exe)) {
      $company = (Get-Item -LiteralPath $exe).VersionInfo.CompanyName;
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
