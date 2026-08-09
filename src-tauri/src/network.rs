use crate::models::NetworkStatus;
use crate::powershell::run_json;

// Read-only: active connection profiles and per-interface IPv4 DNS servers.
// Arrays are forced with @(...) + -InputObject so single elements stay arrays.
const SCRIPT: &str = r#"
[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$ErrorActionPreference='Stop';
$profiles = @(Get-NetConnectionProfile | ForEach-Object {
  [pscustomobject]@{
    name = [string]$_.Name;
    interface = [string]$_.InterfaceAlias;
    category = [string]$_.NetworkCategory;
    connected = (($_.IPv4Connectivity -eq 'Internet') -or ($_.IPv6Connectivity -eq 'Internet'))
  }
});
$dns = @(Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses } | ForEach-Object {
  [pscustomobject]@{
    interface = [string]$_.InterfaceAlias;
    servers = @($_.ServerAddresses | ForEach-Object { [string]$_ })
  }
});
ConvertTo-Json -InputObject ([pscustomobject]@{ profiles = $profiles; dns = $dns }) -Depth 5 -Compress
"#;

pub fn collect() -> Result<NetworkStatus, String> {
    run_json(SCRIPT)
}
