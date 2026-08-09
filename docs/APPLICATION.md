# Sentinel — Application Behavior (v0.1.0)

## Install

- Installer: NSIS, **per-user** (`installMode: currentUser`). No administrator prompt.
- Installs to `%LOCALAPPDATA%\Sentinel` with Start Menu and optional desktop shortcuts.
- Prerequisite: WebView2 runtime (preinstalled on Windows 11; the installer bootstraps
  it if missing).
- The installer is **not code-signed**, so SmartScreen will show "Windows protected
  your PC" on first run — choose "More info → Run anyway". Expected for a personal
  build; code signing is a future item (see RELEASE_CHECKLIST.md).

## Startup behavior

- Sentinel runs **only when launched**. It registers no Windows service, no scheduled
  task, no autostart entry, and no background process survives closing the window.
- On launch it creates/opens its data folder, applies any data-version migration,
  writes a startup line to its log, and begins reading security status every 60 s.

## Local data

| What | Where |
|---|---|
| Diagnostic log (1 MB cap + one rotation) | `%LOCALAPPDATA%\com.deanplyler.sentinel\logs\sentinel.log` |
| Data-version marker | `%LOCALAPPDATA%\com.deanplyler.sentinel\data-version` |
| WebView2 cache (managed by Windows) | `%LOCALAPPDATA%\com.deanplyler.sentinel\EBWebView\` |
| Installed program | `%LOCALAPPDATA%\Sentinel\` |

## Data migration

The data folder carries a `data-version` marker (currently **1**). On startup Sentinel
compares it to the build's version and runs sequential migration steps if the stored
version is older (`src-tauri/src/appdata.rs::migrate`). A *newer* stored version (i.e.
a downgrade) is logged and the data is left untouched. The Phase 4 SQLite timeline
will migrate through this same mechanism plus SQLite's `user_version` pragma.

## Reset application data

About → **Reset application data** deletes Sentinel's log and marker, clears the UI's
localStorage, and restarts the dashboard. It touches nothing outside Sentinel's own
data folder — and, as everywhere in Sentinel, no Windows security setting.

## Uninstall behavior

Uninstalling (Settings → Apps, or the uninstaller in the install folder):

- removes the program folder and shortcuts;
- leaves `%LOCALAPPDATA%\com.deanplyler.sentinel\` behind (delete manually or use
  Reset first if you want nothing left);
- **changes nothing about Windows security.** Sentinel has no code path that writes
  to Defender, Firewall, BitLocker, Secure Boot, Windows Update, network
  configuration, or NordVPN — so after uninstall the machine's security posture is
  exactly what it was, as if Sentinel had never been installed. This is verified per
  release with a before/after state diff (see RELEASE_CHECKLIST.md).

## Crash handling

- **Backend:** a Rust panic hook writes the panic message to the diagnostic log before
  the process exits, so silent crashes are always diagnosable.
- **Frontend:** a React error boundary replaces a broken screen with a crash page
  showing the error and a Restart button.
- **Collectors:** each of the five collectors fails independently into an "Unknown"
  section + a logged error; one bad probe never takes down the dashboard.

## Diagnostic log export

About → **Export diagnostics** writes
`%USERPROFILE%\Downloads\sentinel-diagnostics-<timestamp>.log` containing the app
version, data-version, and the log contents. Nothing is transmitted anywhere.

## Automatic updates

**Disabled — deliberately.** A safe updater needs: (1) a code-signing certificate so
binaries are attributable, (2) the Tauri updater plugin with **signed update
manifests** (minisign keypair, private key kept offline), and (3) an HTTPS endpoint
serving manifest + artifacts. Shipping an unsigned self-updater would be a
self-inflicted supply-chain hole in a security tool. Until that infrastructure exists,
updates are manual: build, then run the new installer over the old install (NSIS
handles upgrade-in-place).
