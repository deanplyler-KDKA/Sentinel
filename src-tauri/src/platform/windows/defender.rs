use crate::models::DefenderStatus;
use super::powershell::run_json;

// Read-only: Get-MpComputerStatus / Get-MpPreference query Defender state, and
// SecurityCenter2 names any third-party AV (so Defender passive mode isn't
// misread as "unprotected"). Scan/signature ages of 4294967295 mean "never".
// thirdPartyAv includes only products whose productState says real-time
// protection is ON (bit 0x1000 of the 0xXXYYZZ bitfield) — a registered but
// expired/disabled product must NOT count as protection. Missing or
// undecodable productState fails closed (excluded).
// The PSModulePath pin must stay the first statement — see powershell.rs.
const SCRIPT: &str = r#"
$env:PSModulePath = [Environment]::GetFolderPath('System') + '\WindowsPowerShell\v1.0\Modules;' + [Environment]::GetFolderPath('ProgramFiles') + '\WindowsPowerShell\Modules';
[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$ErrorActionPreference='Stop';
$s = Get-MpComputerStatus;
$p = Get-MpPreference;
$av = @();
try { $av = @(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntiVirusProduct -ErrorAction Stop | Where-Object { ([int]$_.productState -band 4096) -ne 0 } | ForEach-Object { [string]$_.displayName }) } catch { };
[pscustomobject]@{
  antivirusEnabled = [bool]$s.AntivirusEnabled;
  realTimeProtection = [bool]$s.RealTimeProtectionEnabled;
  behaviorMonitoring = [bool]$s.BehaviorMonitorEnabled;
  tamperProtection = [bool]$s.IsTamperProtected;
  cloudProtection = ($p.MAPSReporting -gt 0);
  puaProtection = ($p.PUAProtection -eq 1);
  controlledFolderAccess = ($p.EnableControlledFolderAccess -eq 1);
  signatureVersion = [string]$s.AntivirusSignatureVersion;
  signatureAgeDays = $(if ($s.AntivirusSignatureAge -lt 4294967295) { [uint32]$s.AntivirusSignatureAge } else { $null });
  signatureLastUpdated = $(if ($s.AntivirusSignatureLastUpdated) { $s.AntivirusSignatureLastUpdated.ToString('o') } else { $null });
  quickScanEnd = $(if ($s.QuickScanEndTime) { $s.QuickScanEndTime.ToString('o') } else { $null });
  quickScanAgeDays = $(if ($s.QuickScanAge -lt 4294967295) { [uint32]$s.QuickScanAge } else { $null });
  fullScanEnd = $(if ($s.FullScanEndTime) { $s.FullScanEndTime.ToString('o') } else { $null });
  fullScanAgeDays = $(if ($s.FullScanAge -lt 4294967295) { [uint32]$s.FullScanAge } else { $null });
  runningMode = [string]$s.AMRunningMode;
  thirdPartyAv = @($av | Where-Object { $_ -notmatch 'Windows Defender|Microsoft Defender' })
} | ConvertTo-Json -Compress
"#;

pub fn collect() -> Result<DefenderStatus, String> {
    run_json(SCRIPT)
}
