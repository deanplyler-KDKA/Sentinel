//! Network adapter detail for the Network page: link speed, media type,
//! gateway, addresses. Link speed is the LOCAL link, deliberately kept
//! separate from internet speed in the UI.


use crate::models::NetworkDetail;
use super::powershell::run_json;

// Read-only. The PSModulePath pin must stay the first statement.
const SCRIPT: &str = r#"
$env:PSModulePath = [Environment]::GetFolderPath('System') + '\WindowsPowerShell\v1.0\Modules;' + [Environment]::GetFolderPath('ProgramFiles') + '\WindowsPowerShell\Modules';
[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$ErrorActionPreference='Stop';
$adapters = @(Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object {
  [pscustomobject]@{
    name = [string]$_.Name;
    description = [string]$_.InterfaceDescription;
    linkSpeed = [string]$_.LinkSpeed;
    wifi = ($_.PhysicalMediaType -match '802\.11')
  }
});
$configs = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway } | ForEach-Object {
  [pscustomobject]@{
    interface = [string]$_.InterfaceAlias;
    gateway = [string]$_.IPv4DefaultGateway.NextHop;
    ipv4 = $(if ($_.IPv4Address) { [string]($_.IPv4Address | Select-Object -First 1).IPAddress } else { $null });
    ipv6 = ($null -ne $_.IPv6Address)
  }
});
ConvertTo-Json -InputObject ([pscustomobject]@{ adapters = $adapters; configs = $configs }) -Depth 4 -Compress
"#;

pub fn collect() -> Result<NetworkDetail, String> {
    run_json(SCRIPT)
}
