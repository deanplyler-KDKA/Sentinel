# Sentinel — Roadmap

## Phase 1 — Read-only monitoring (current)

Everything below is collected without admin rights and without modifying anything:

- Defender: enabled, real-time, cloud, behavior monitoring, tamper protection,
  signature version/age, last quick/full scan
- Ransomware: Controlled Folder Access state
- Firewall: Domain / Private / Public profiles
- System: Secure Boot, BitLocker, Windows version/build, computer name, uptime,
  Windows Update last check/install, pending reboot
- Network: active profile (Public/Private), DNS servers, secure-DNS classification
- NordVPN: installed, running, connected (NordLynx adapter)
- Security score 0–100 with tunable weights + plain-language recommendations

## Phase 2 — Score refinement

- Tune weights with real usage; per-check "why this matters" explainers
- History of score over time (needs Phase 4 storage)

## Phase 3 — Safe actions

- Quick Scan / signature update via Defender's own interfaces (`Start-MpScan`,
  `Update-MpSignature`) as fixed, allow-listed commands
- "Fix" buttons that **open Windows Security** at the right page (`windowsdefender:`
  URI) rather than changing settings directly; direct toggles come last, if ever
- Requires adding the opener plugin + explicit security review (see SECURITY.md)

## Phase 4 — Security timeline

- SQLite (via `tauri-plugin-sql` or `rusqlite`) storing events locally:
  definition updates, scan completions, VPN connect/disconnect, firewall changes,
  network changes, score changes
- No cloud, no account, no telemetry

## Phase 5 — Network dashboard

- Per-app active connections (`Get-NetTCPConnection` + process mapping)
- Public IP / protocol display for VPN
- "Which programs are talking to the internet"

## Phase 6 — Household dashboard

- Tiny Sentinel agent on each family PC; main PC aggregates scores
  (LAN-only, mutually authenticated — design doc required before any code)

## Known limitations (Phase 1)

- Tamper protection state comes from `Get-MpComputerStatus IsTamperProtected`; on some
  builds this can lag the Settings UI briefly after a change.
- "Windows updated" is approximated from last successful install/search dates + pending
  reboot; enumerating *pending* updates reliably needs the Windows Update Agent COM
  searcher, which is slow (seconds) — deferred to Phase 3.
- NordVPN "connected" is inferred from the NordLynx adapter being Up (covers NordLynx
  protocol; OpenVPN-TAP fallback also checked). Server name/protocol require Nord's CLI
  and are deferred.
- Third-party AV counts as protection only when its SecurityCenter2 `productState`
  says real-time protection is on (bit 0x1000); a registered-but-disabled/expired
  product fails closed. Its definitions age (low byte) is not yet checked.
- The Rust side still resolves the PowerShell path from the `SystemRoot` environment
  variable (scripts themselves now use `[Environment]::GetFolderPath`, which asks the
  OS); moving the Rust side to `GetSystemDirectoryW` is backlog. IPv6 DNS resolvers
  are not collected/assessed yet.
- "Encrypted DNS" passes only for VPN-tunneled DNS or Windows DoH actually enabled per
  adapter. A reputable public resolver over plain UDP/53 deliberately does not pass;
  DoT and router-side encryption are invisible to Sentinel.
