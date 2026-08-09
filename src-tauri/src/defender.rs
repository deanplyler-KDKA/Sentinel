use crate::models::DefenderStatus;
use crate::powershell::run_json;

// Read-only: Get-MpComputerStatus / Get-MpPreference query Defender state.
// FullScanAge/QuickScanAge of 4294967295 means "never ran" and becomes null.
const SCRIPT: &str = r#"
[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$ErrorActionPreference='Stop';
$s = Get-MpComputerStatus;
$p = Get-MpPreference;
[pscustomobject]@{
  antivirusEnabled = [bool]$s.AntivirusEnabled;
  realTimeProtection = [bool]$s.RealTimeProtectionEnabled;
  behaviorMonitoring = [bool]$s.BehaviorMonitorEnabled;
  tamperProtection = [bool]$s.IsTamperProtected;
  cloudProtection = ($p.MAPSReporting -gt 0);
  puaProtection = ($p.PUAProtection -eq 1 -or $p.PUAProtection -eq 2);
  controlledFolderAccess = ($p.EnableControlledFolderAccess -eq 1);
  signatureVersion = [string]$s.AntivirusSignatureVersion;
  signatureAgeDays = [uint32]$s.AntivirusSignatureAge;
  signatureLastUpdated = $(if ($s.AntivirusSignatureLastUpdated) { $s.AntivirusSignatureLastUpdated.ToString('o') } else { $null });
  quickScanEnd = $(if ($s.QuickScanEndTime) { $s.QuickScanEndTime.ToString('o') } else { $null });
  quickScanAgeDays = $(if ($s.QuickScanAge -lt 4294967295) { [uint32]$s.QuickScanAge } else { $null });
  fullScanEnd = $(if ($s.FullScanEndTime) { $s.FullScanEndTime.ToString('o') } else { $null });
  fullScanAgeDays = $(if ($s.FullScanAge -lt 4294967295) { [uint32]$s.FullScanAge } else { $null });
  runningMode = [string]$s.AMRunningMode
} | ConvertTo-Json -Compress
"#;

pub fn collect() -> Result<DefenderStatus, String> {
    run_json(SCRIPT)
}
