# Bringing Sentinel to macOS

## The actual blocker

It is not the code — it is that **Tauri cannot build a macOS app from Windows**.
Apple's SDK, linker and code-signing tools only run on macOS. Everything else is
ordinary work.

Three ways to get a Mac to build on, cheapest first:

| Option | Cost | Notes |
|---|---|---|
| **GitHub Actions macOS runner** | Free for a public repo; private repos get a monthly minute allowance where macOS counts at a higher multiplier — still enough for a handful of builds a month | Recommended. `.github/workflows/build.yml` already does this. No hardware, no maintenance. |
| Borrow a Mac for an afternoon | Free | Fine for the first port; painful as an ongoing release process. |
| Buy a used Mac mini | A few hundred dollars | Only worth it if macOS becomes a primary target. |

CI is the right answer for a project whose whole appeal is being cheap to keep
alive. It also builds Windows in the same run, so both installers come out of
one push.

## What already works unchanged

Roughly half the app is platform-neutral today:

- `perf.rs` — `sysinfo` covers CPU, memory, disks and network on macOS
- `ndt7.rs`, `netprobe.rs`, `speedtest.rs` — pure Rust networking
- `timeline.rs`, `settings.rs`, `monitor.rs`, `appdata.rs`, `diag.rs` — no OS calls
- The entire frontend: scoring, suggestions, the report, every page

## What needs a macOS implementation

Each Windows collector needs a sibling. The command surface in `commands.rs`
stays identical, so the UI never learns which platform it is on — it already
renders anything unavailable as "Unavailable" rather than assuming.

| Concept | Windows today | macOS equivalent |
|---|---|---|
| Antivirus | Defender via `Get-MpComputerStatus` | XProtect / MRT versions; macOS has no user-facing AV toggle, so several Defender checks become **not applicable** rather than failing |
| Firewall | `Get-NetFirewallProfile` | `socketfilterfw --getglobalstate` (one global state, not three profiles) |
| Disk encryption | BitLocker via Shell COM | FileVault via `fdesetup status` |
| Secure boot | UEFI registry key | `csrutil status` (SIP) + `spctl --status` (Gatekeeper) — related but not identical, so report them as themselves |
| Updates | Windows Update COM | `softwareupdate -l`, or the last-check defaults key (the full check is slow — cache it) |
| Hardware | CIM `Win32_*` | `system_profiler -json SPHardwareDataType SPPowerDataType SPStorageDataType` — note **macOS reports battery cycle count and condition**, which Windows usually will not |
| Network detail | `Get-NetAdapter` | `networksetup`, `scutil --dns`, `ifconfig` |
| VPN | NordVPN service/adapter | Nord's macOS app plus `scutil --nwi` for the tunnel interface |
| Startup items | `Win32_StartupCommand` | `launchctl list` plus `~/Library/LaunchAgents` |
| Open settings page | `ms-settings:` URIs | `x-apple.systempreferences:` URLs — same closed-enum pattern in `actions.rs` |

The **not-applicable** scoring added in 0.4.0 is what makes this work honestly:
checks that do not exist on a platform leave the denominator instead of
reporting as failures, so a Mac is not punished for lacking Secure Boot.

## Suggested order

1. Push to GitHub and confirm CI builds Windows — proves the pipeline before
   adding a platform.
2. Split the Windows collectors behind `#[cfg(target_os = "windows")]` and add
   `macos` siblings returning `Unsupported`. CI then compiles both targets.
3. Fill in the macOS collectors, highest value first: FileVault, firewall,
   Gatekeeper/SIP, updates, then hardware and network.
4. Verify on a real Mac. Compile-checking catches structure; only a Mac catches
   output-format surprises, which is where this kind of work actually breaks.

## Signing and notarization

| Platform | What it costs | What happens without it |
|---|---|---|
| Windows | Azure Trusted Signing is the cheap route (~$10/month tier); a traditional OV certificate runs a few hundred a year | SmartScreen warning on every new version |
| macOS | Apple Developer Program, $99/year | Gatekeeper refuses to open it. The right-click → Open bypass still exists but Apple keeps narrowing it, and talking a family member through it is worse than the Windows warning |

For a family tool, **macOS notarization is close to mandatory** in a way Windows
signing is not — Kinzey should not have to defeat Gatekeeper to run something
her dad wrote. Budget ~$99/year for Apple and decide on Windows separately.

## Keeping it cheap to run

The current architecture is already the cheap one, and it is worth protecting:
no server, no accounts, no database to host, nothing to breach, nothing with a
monthly bill. Distribution is a GitHub Release — free hosting — and a signed
Tauri updater can point straight at it, so updates cost nothing to serve.

The only recurring costs are the signing certificates. Everything else is zero.
