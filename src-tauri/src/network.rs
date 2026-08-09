use crate::models::NetworkStatus;
use crate::powershell::run_json;

// Read-only: active connection profiles, per-interface IPv4 DNS servers, and
// which servers have DoH actually enabled (Dnscache registry — the
// Get-DnsClientDohServerAddress list only names DoH-*capable* servers).
// DohFlags must equal 1 (encrypted-only): other values, including
// "encrypted preferred, unencrypted allowed", fail closed and earn nothing.
// Arrays are forced with @(...) + -InputObject so single elements stay arrays.
// The PSModulePath pin must stay the first statement — see powershell.rs.
const SCRIPT: &str = r#"
$env:PSModulePath = [Environment]::GetFolderPath('System') + '\WindowsPowerShell\v1.0\Modules;' + [Environment]::GetFolderPath('ProgramFiles') + '\WindowsPowerShell\Modules';
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
$doh = @();
try {
  $doh = @(Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services\Dnscache\InterfaceSpecificParameters' -Recurse -ErrorAction Stop |
    Where-Object { $_.PSParentPath -match '\\Doh6?$' } |
    Where-Object { try { (Get-ItemProperty -Path $_.PSPath -Name DohFlags -ErrorAction Stop).DohFlags -eq 1 } catch { $false } } |
    ForEach-Object { [string]$_.PSChildName })
} catch { };
ConvertTo-Json -InputObject ([pscustomobject]@{ profiles = $profiles; dns = $dns; dohServers = $doh }) -Depth 5 -Compress
"#;

pub fn collect() -> Result<NetworkStatus, String> {
    run_json(SCRIPT)
}
