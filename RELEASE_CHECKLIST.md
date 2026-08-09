# Sentinel — Release Checklist

Personal-use Windows release. Nothing is published externally.

## 1. Version

- [ ] Version bumped consistently in `package.json`, `src-tauri/Cargo.toml`,
      `src-tauri/tauri.conf.json` (all three must match).
- [ ] `data-version` in `src-tauri/src/appdata.rs` bumped **only** if the on-disk
      data layout changed, with a migration step added.

## 2. Checks (all must pass)

```
npm run build          # tsc + vite production build
npm test               # vitest unit tests (scoring, DNS assessment, formatting)
cd src-tauri && cargo test   # Rust build + live end-to-end collector smoke test
```

## 3. Security review gates (docs/SECURITY.md checklist)

- [ ] No new Tauri command takes frontend-controlled strings.
- [ ] Capabilities still `core:default` only.
- [ ] All PowerShell is const scripts: PSModulePath pin first, AllSigned, no `"` chars.
- [ ] Only `appdata.rs` writes to disk, and only inside Sentinel's data dir /
      user-requested Downloads export.
- [ ] Unknown still caps the headline at "Incomplete".

## 4. Build the installer

```
npm run tauri build
```

Artifacts:
- Executable: `src-tauri\target\release\sentinel.exe`
- Installer: `src-tauri\target\release\bundle\nsis\Sentinel_<version>_x64-setup.exe`

## 5. Install/uninstall verification (per release)

1. Capture security state:
   `Get-MpPreference`, `Get-MpComputerStatus` (protection fields),
   `Get-NetFirewallProfile`, BitLocker shell property, Secure Boot state,
   NordVPN service/adapter — save to a file.
2. Run the installer (per-user, no UAC expected). Launch Sentinel, confirm the
   dashboard shows live data. Close it; confirm no `sentinel.exe` process remains.
3. Uninstall via Settings → Apps. Confirm program folder and shortcuts are gone.
4. Re-capture security state and **diff — must be empty** (Defender, Firewall,
   BitLocker, Secure Boot, network, NordVPN all untouched).
5. Confirm leftover data is only `%LOCALAPPDATA%\com.deanplyler.sentinel\`.

## 6. Known & accepted for 0.1.0

- Installer is unsigned → SmartScreen "More info → Run anyway" on first launch.
- No automatic updates (see below). Updates = run the new installer over the old.
- MSI target not built (WiX per-machine install would need admin; NSIS per-user
  covers personal use).
- App data intentionally survives uninstall.

## 7. Future: automatic updates (do NOT ship a shortcut version)

Requirements before enabling, in order:
1. Code-signing certificate (OV/EV or Azure Trusted Signing) — also removes the
   SmartScreen warning.
2. Tauri updater plugin with a minisign keypair; private key stored offline;
   public key baked into the app; **signed manifests only**.
3. HTTPS endpoint serving `latest.json` + artifacts (static hosting is fine).
4. Add the updater capability + permission review in docs/SECURITY.md.

Until all four exist, `bundle.createUpdaterArtifacts` stays off and no update code
ships. An unsigned custom updater is a supply-chain vulnerability and is banned for
this project.
