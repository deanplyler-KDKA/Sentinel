# Sentinel — Security Model

## Principles

1. **Phase 1 is read-only toward the system.** Sentinel does not modify Windows security
   settings, registry values, firewall rules, Defender configuration, services, network
   configuration, or NordVPN configuration. Every system query is a read. The only disk
   writes in the entire app live in `src-tauri/src/appdata.rs` and
   `src-tauri/src/timeline.rs` (the SQLite event history) and are confined to
   Sentinel's own data folder plus a user-triggered diagnostics export into Downloads.
2. **Least privilege.** Sentinel runs as a standard user. Every Phase 1 metric was chosen
   (and verified on this machine) to be readable without elevation. Sources that require
   admin (`Confirm-SecureBootUEFI`, `Get-BitLockerVolume`) have documented non-admin
   equivalents (registry state key, Shell COM property), which Sentinel uses instead.
   Sentinel must never ask for elevation in order to *collect* information, and must never
   weaken any Windows security setting for any reason.
3. **No arbitrary command execution.** The IPC surface is five zero-argument Tauri
   commands (`get_security_snapshot`, `get_app_info`, `export_diagnostics`,
   `reset_app_data`, `get_timeline`) — none accepts any input from the WebView.
   Timeline SQL lives entirely in `timeline.rs` as fixed statements with bound
   parameters; the WebView cannot express a query. PowerShell scripts are compile-time constants; the runner
   (`src-tauri/src/powershell.rs`) accepts only `&'static str`. Note this lifetime bound
   is a review convention backed by the type system, not an absolute proof — a leaked
   `String` could satisfy it — so the enforced rule is: only `const` script items are ever
   passed, no string construction near the runner, and reviews reject anything else.
   There is no eval path, no string concatenation into commands, and no command that
   takes a script, path, or argument from the WebView.
4. **Minimal Tauri capabilities.** `capabilities/default.json` grants `core:default` only.
   No shell plugin, no fs plugin, no opener plugin, no HTTP plugin in Phase 1. The app
   makes no network requests; nothing is uploaded anywhere. All data stays on the machine.
5. **Fail closed on display.** If a collector errors or a value can't be read, the UI
   shows "Unknown" and scores it as 0 — never as protected. This applies to the
   headline too: any unknown check caps the overall pill at "Incomplete" (amber), and
   the hero shows how many points couldn't be measured, so a green at-a-glance verdict
   always means *measured and passing*.

## PowerShell execution hardening

- The interpreter is invoked by **absolute path**
  (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`), never by name —
  name resolution would search the exe's directory and CWD first, letting a same-user
  attacker shadow the interpreter next to a portable/dev build.
- `-NoProfile -NonInteractive -ExecutionPolicy AllSigned -Command <CONST>`
  - `-NoProfile`: user/system profile scripts never run inside Sentinel's process tree.
  - `-NonInteractive`: any prompt fails immediately instead of hanging.
  - `-ExecutionPolicy AllSigned`: execution policy governs **module loading from disk**
    (the `-Command` text itself is never policy-checked). The cmdlets we call autoload
    CDXML/script modules, so AllSigned ensures only signed modules can load even if the
    module path were subverted.
- Every script's **first statement pins `$env:PSModulePath`** to the two admin-writable
  locations (`System32\...\Modules` and `Program Files\WindowsPowerShell\Modules`).
  Without this, module autodiscovery searches the user-writable
  `Documents\WindowsPowerShell\Modules` first, and a same-user attacker could plant a
  fake `Defender`/`NetSecurity` module that both falsifies the dashboard and runs code
  inside Sentinel's process tree.
- Scripts must not contain double-quote characters (single quotes only) —
  powershell.exe re-parses its raw command line, and embedded `"` would collide with
  argument quoting.
- Child processes are spawned with `CREATE_NO_WINDOW` and stdin closed; stdout is
  capped at 4 MB.
- A hard 20-second timeout kills any hung collector; the section reports an error.
- Script output is parsed as strict JSON (`serde_json`); parse failures surface as
  collector errors, never as fabricated status.

## Threat model notes

- **Spoofing risk:** Sentinel reports what Windows APIs report. Malware running as the
  same user — no admin required — could interfere with those readings (and admin
  malware certainly can). The interpreter-path and module-path pinning above closes the
  known same-user *injection* routes into Sentinel's own process tree, but Sentinel is
  a convenience dashboard, not an integrity monitor, and the UI copy avoids claiming
  otherwise.
- **The dashboard itself as a target:** because Phase 1 has no write path and no
  privileged helper, compromising the UI yields no capability an attacker didn't
  already have as the same user.
- **Update/scan actions (Phase 3+)** will be individually reviewed, allow-listed,
  fixed-verb commands (e.g. "start quick scan"), never parameterized shell strings, and
  anything requiring elevation will open the Windows Security app instead of elevating
  Sentinel.

## Review checklist for future changes

- [ ] Does any new Tauri command take a string that reaches a process, path, or registry write? (Must be no)
- [ ] Do all disk writes stay inside `appdata.rs`, confined to Sentinel's data dir / user-requested export?
- [ ] Do capabilities stay at `core:default` (+ explicitly justified additions)?
- [ ] Does anything request elevation? (Phase ≤3: must be no)
- [ ] Does any code path disable, suspend, or reconfigure a protection? (Always no)
- [ ] Is new PowerShell still a `const` script + `-NoProfile -NonInteractive -ExecutionPolicy AllSigned`?
- [ ] Does every new script start with the PSModulePath pin, and contain no double quotes?
- [ ] Does the headline still fail closed (unknown ⇒ "Incomplete", never green)?
