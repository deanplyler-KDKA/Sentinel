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

## Phase 4 — Security timeline (shipped in 0.2.0)

- ✅ rusqlite (bundled, backend-only — deliberately NOT tauri-plugin-sql, which would
  expose SQL to the WebView) storing events locally: definition updates, scans,
  VPN connect/disconnect, firewall/Defender/ransomware toggles, network and DNS
  changes, Windows updates, Secure Boot/BitLocker changes
- ✅ Cross-session detection: state persists, so changes made while Sentinel was
  closed appear on next launch tagged "while Sentinel was closed"
- ✅ 5000-event retention, day-grouped Timeline panel, no cloud/account/telemetry
- Remaining: score-change events (needs backend scoring), richer filtering/search

## Phase 5 — System intelligence expansion (shipped in 0.3.0)

- ✅ Eight-section navigation (Dashboard, Protect, Performance, Network, Health,
  Devices, History, Settings) on centralized design tokens with a light theme
- ✅ Live performance monitoring (Rust-native sysinfo sampler: CPU, memory, disk
  activity, network rates, top processes) with restrained in-memory charts
- ✅ Hardware facts: GPU, battery, physical disk SMART health
- ✅ Network intelligence: adapter/link detail, TCP latency/jitter/loss probe,
  user-initiated Cloudflare speed test with local history and baseline comparisons
- ✅ PC Health / Network Health / Overall scoring with severity overrides and
  unsupported-capability exclusion; deterministic plain-language explanations
- ✅ Startup apps (read-only), collector diagnostics area, Pressure Test report
- ✅ System tray (open / refresh / quit)

## Phase 5.1 — Next (not yet implemented)

- Tray: optional start-with-Windows (autostart plugin) and close-to-tray background
  monitoring, both user-controlled and off by default
- Calm notifications on meaningful changes (protection off, disk critically low,
  restart pending, speed below baseline) with deduplication — requires the
  notification plugin + capability review
- Scheduled speed tests (opt-in), score-change timeline events, history retention
  options, per-app network attribution (needs elevated ETW — may stay out)
- Wi-Fi signal quality (WlanQueryInterface), pending-updates count via WUA COM

## Phase 6 — Per-app connections & household dashboard

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
