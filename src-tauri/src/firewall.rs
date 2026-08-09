use crate::models::FirewallStatus;
use crate::powershell::run_json;

// Read-only: Get-NetFirewallProfile reports per-profile enablement.
const SCRIPT: &str = r#"
[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$ErrorActionPreference='Stop';
$p = Get-NetFirewallProfile;
[pscustomobject]@{
  domain = (($p | Where-Object Name -eq 'Domain').Enabled -eq 'True');
  private = (($p | Where-Object Name -eq 'Private').Enabled -eq 'True');
  public = (($p | Where-Object Name -eq 'Public').Enabled -eq 'True')
} | ConvertTo-Json -Compress
"#;

pub fn collect() -> Result<FirewallStatus, String> {
    run_json(SCRIPT)
}
