# Sentinel — Architecture

Sentinel is a Windows-only personal security dashboard. It is **not** an antivirus engine.
Microsoft Defender does the protection; Sentinel is the command center that reads security
state from Windows and presents it in a consumer-friendly UI.

## Stack

```
React + TypeScript (Vite)          UI, scoring, presentation
        │  invoke("get_security_snapshot")
Tauri 2 (Rust backend)             collectors, normalization, typed models
        │  fixed PowerShell / CIM / registry / COM queries
Windows                            Defender, Firewall, Secure Boot, BitLocker,
                                   Windows Update, network stack, NordVPN
```

## Process model

- The frontend calls exactly one Tauri command in Phase 1: `get_security_snapshot`.
- The backend runs five independent **collectors** (defender, firewall, system/windows,
  network, nord) in parallel threads. Each collector executes a **compile-time constant**
  PowerShell script via `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass`
  with a hidden window and a hard timeout, and parses the JSON the script emits.
- A collector that fails produces `null` for its section plus an entry in
  `snapshot.errors`; the rest of the dashboard still renders. The UI shows "Unknown"
  rather than guessing.
- The frontend polls the snapshot every 60 seconds and on manual refresh.

## Directory layout

```
Sentinel/
├── src/                        React frontend
│   ├── components/             ScoreRing, SecurityCard, StatusPill, DetailRow, Recommendations
│   ├── pages/                  Dashboard
│   ├── lib/                    api.ts (invoke + mock fallback), score.ts, format.ts, mock.ts
│   └── types/                  security.ts — mirrors the Rust models
├── src-tauri/
│   ├── src/
│   │   ├── main.rs             entry point
│   │   ├── lib.rs              Tauri builder + command registration
│   │   ├── commands.rs         get_security_snapshot (the only IPC surface)
│   │   ├── models.rs           serde structs — the normalized security state
│   │   ├── powershell.rs       runner for fixed scripts (takes &'static str only)
│   │   ├── defender.rs         Defender collector
│   │   ├── firewall.rs         Firewall collector
│   │   ├── windows.rs          OS / Secure Boot / BitLocker / Windows Update collector
│   │   ├── network.rs          network profile + DNS collector
│   │   └── nord.rs             NordVPN collector
│   └── capabilities/default.json
└── docs/                       ARCHITECTURE.md, SECURITY.md, ROADMAP.md, CLAUDE.md
```

## Data sources per metric (all verified on Windows 11 25H2, standard user, no admin)

| Metric | Source | Admin? |
|---|---|---|
| Defender enabled / real-time / behavior monitoring / tamper | `Get-MpComputerStatus` | No |
| Cloud protection (MAPS), PUA, Controlled Folder Access | `Get-MpPreference` | No |
| Signature version / age / last updated | `Get-MpComputerStatus` | No |
| Last quick scan / full scan times & ages | `Get-MpComputerStatus` (`FullScanAge = 4294967295` ⇒ never ran) | No |
| Firewall Domain / Private / Public | `Get-NetFirewallProfile` | No |
| Secure Boot | Registry `HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot\State\UEFISecureBootEnabled` — the documented cmdlet `Confirm-SecureBootUEFI` requires admin, so the registry key is the least-privilege source; both are read | Cmdlet: yes · Registry: no |
| BitLocker (C:) | Shell COM property `System.Volume.BitLockerProtection` (1=on, 2=off, 3=encrypting, 4=decrypting, 5=suspended, 6=locked) — `Get-BitLockerVolume` requires admin | COM: no |
| Windows Update last check / last install | `Microsoft.Update.AutoUpdate` COM `.Results` | No |
| Reboot pending | Registry `...\WindowsUpdate\Auto Update\RebootRequired` key exists | No |
| OS name/version/build, boot time, computer name | `Win32_OperatingSystem` CIM + `CurrentVersion\DisplayVersion` | No |
| Network profile (Public/Private/Domain) | `Get-NetConnectionProfile` | No |
| DNS servers per interface | `Get-DnsClientServerAddress` | No |
| NordVPN installed | `C:\Program Files\NordVPN` exists **or** `nordvpn-service` service exists | No |
| NordVPN running | `NordVPN` / `nordvpn-service` processes | No |
| NordVPN connected | `NordLynx` (or TAP) adapter status `Up` via `Get-NetAdapter` | No |

**Nothing in Phase 1 requires administrator privileges.** Sentinel runs as a standard
user by design (see SECURITY.md).

## Normalized data model

Rust structs in `src-tauri/src/models.rs` serialize with `serde` to camelCase JSON;
`src/types/security.ts` mirrors them 1:1. Shape:

```
SecuritySnapshot {
  collectedAt: ISO datetime
  defender:  DefenderStatus | null      // null = collector failed, see errors[]
  firewall:  FirewallStatus | null
  system:    SystemStatus  | null
  network:   NetworkStatus | null
  vpn:       VpnStatus     | null
  errors:    { source, message }[]
}
```

Booleans are normalized in PowerShell/Rust (e.g. `MAPSReporting: 2` → `cloudProtection:
true`; BitLocker code `1` → `"on"`). Timestamps are converted to ISO-8601 strings inside
the PowerShell scripts (`.ToString('o')`) so no locale-dependent parsing happens in Rust.
Tri-state values use `boolean | null` — `null` always renders as "Unknown", never as a
passing or failing state.

## Scoring (frontend, `src/lib/score.ts`)

Weights sum to 100 and live in one table so they're easy to tune:

| Check | Points |
|---|---|
| Real-time protection | 25 |
| Cloud-delivered protection | 5 |
| Tamper protection | 5 |
| Definitions < 24h old | 5 |
| Firewall: Private / Public / Domain | 5 / 5 / 3 |
| Secure Boot | 8 |
| BitLocker on | 8 |
| Windows updated (install < 30 days, no pending reboot) | 10 |
| Secure DNS | 5 |
| VPN installed / connected | 3 / 3 |
| Controlled Folder Access | 10 |

Bands: 95–100 Excellent · 85–94 Protected · 70–84 Needs attention · 50–69 At risk · 0–49 Critical.
A check whose underlying data is `null`/unknown scores 0 and is labeled "Unknown" in the
breakdown rather than "failed".

## Frontend/backend contract rules

- The frontend can never send strings that reach a shell. `get_security_snapshot` takes
  **zero arguments**.
- All collector scripts are `&'static str` constants in Rust; `powershell.rs` only
  accepts `&'static str`, so a dynamically built command cannot compile.
- Single-element JSON arrays are forced with `ConvertTo-Json -InputObject @(...)` to
  avoid PowerShell 5.1's array-unwrapping; output is forced to UTF-8.
