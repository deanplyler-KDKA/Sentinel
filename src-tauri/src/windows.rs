use crate::models::{BitLockerState, RawSystemStatus, SystemStatus};
use crate::powershell::run_json;

// Read-only sources, all usable without elevation:
// - Secure Boot: HKLM SecureBoot\State registry value (Confirm-SecureBootUEFI needs admin)
// - BitLocker: Shell COM property System.Volume.BitLockerProtection (Get-BitLockerVolume needs admin)
// - Windows Update: Microsoft.Update.AutoUpdate COM results + RebootRequired key
//   presence. The COM DateTimes arrive Kind=Unspecified but are UTC — SpecifyKind
//   makes ToString('o') emit the offset so the frontend doesn't skew them.
const SCRIPT: &str = r#"
$env:PSModulePath = [Environment]::GetFolderPath('System') + '\WindowsPowerShell\v1.0\Modules;' + [Environment]::GetFolderPath('ProgramFiles') + '\WindowsPowerShell\Modules';
[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$ErrorActionPreference='Stop';
$os = Get-CimInstance Win32_OperatingSystem;
$dv = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue).DisplayVersion;
$sb = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State' -ErrorAction SilentlyContinue).UEFISecureBootEnabled;
$bl = $null;
try { $bl = (New-Object -ComObject Shell.Application).NameSpace('C:').Self.ExtendedProperty('System.Volume.BitLockerProtection') } catch { };
$ls = $null; $li = $null;
try {
  $r = (New-Object -ComObject Microsoft.Update.AutoUpdate).Results;
  if ($r.LastSearchSuccessDate -is [datetime]) { $ls = [datetime]::SpecifyKind($r.LastSearchSuccessDate, 'Utc').ToString('o') };
  if ($r.LastInstallationSuccessDate -is [datetime]) { $li = [datetime]::SpecifyKind($r.LastInstallationSuccessDate, 'Utc').ToString('o') }
} catch { };
$rb = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired';
[pscustomobject]@{
  osName = [string]$os.Caption;
  osVersion = [string]$os.Version;
  displayVersion = $(if ($dv) { [string]$dv } else { $null });
  computerName = $env:COMPUTERNAME;
  lastBoot = $os.LastBootUpTime.ToString('o');
  secureBoot = $(if ($null -ne $sb) { $sb -eq 1 } else { $null });
  bitlocker = $(if ($null -ne $bl) { [int64]$bl } else { $null });
  updateLastSearch = $ls;
  updateLastInstall = $li;
  rebootRequired = [bool]$rb
} | ConvertTo-Json -Compress
"#;

pub fn collect() -> Result<SystemStatus, String> {
    let raw: RawSystemStatus = run_json(SCRIPT)?;
    Ok(SystemStatus {
        os_name: raw.os_name,
        os_version: raw.os_version,
        display_version: raw.display_version,
        computer_name: raw.computer_name,
        last_boot: raw.last_boot,
        secure_boot: raw.secure_boot,
        bitlocker: BitLockerState::from_code(raw.bitlocker),
        update_last_search: raw.update_last_search,
        update_last_install: raw.update_last_install,
        reboot_required: raw.reboot_required,
    })
}
