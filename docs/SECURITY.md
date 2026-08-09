# Sentinel — Security Model

## Principles

1. **Phase 1 is read-only.** Sentinel does not modify Windows security settings, registry
   values, firewall rules, Defender configuration, services, files, network configuration,
   or NordVPN configuration. Every query is a read.
2. **Least privilege.** Sentinel runs as a standard user. Every Phase 1 metric was chosen
   (and verified on this machine) to be readable without elevation. Sources that require
   admin (`Confirm-SecureBootUEFI`, `Get-BitLockerVolume`) have documented non-admin
   equivalents (registry state key, Shell COM property), which Sentinel uses instead.
   Sentinel must never ask for elevation in order to *collect* information, and must never
   weaken any Windows security setting for any reason.
3. **No arbitrary command execution.** The IPC surface is a single zero-argument Tauri
   command. PowerShell scripts are compile-time constants; the runner
   (`src-tauri/src/powershell.rs`) accepts only `&'static str`, so frontend-supplied text
   can never reach a shell. There is no eval path, no string concatenation into commands,
   and no command that takes a script, path, or argument from the WebView.
4. **Minimal Tauri capabilities.** `capabilities/default.json` grants `core:default` only.
   No shell plugin, no fs plugin, no opener plugin, no HTTP plugin in Phase 1. The app
   makes no network requests; nothing is uploaded anywhere. All data stays on the machine.
5. **Fail closed on display.** If a collector errors or a value can't be read, the UI
   shows "Unknown" and scores it as 0 — never as protected.

## PowerShell execution hardening

- `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command <CONST>`
  - `-NoProfile`: user/system profile scripts never run inside Sentinel's process tree.
  - `-NonInteractive`: any prompt fails immediately instead of hanging.
  - `-ExecutionPolicy Bypass` applies to this process only and runs no script files —
    the command text is embedded, so nothing on disk is executed or trusted.
- Child processes are spawned with `CREATE_NO_WINDOW` and stdin closed.
- A hard 20-second timeout kills any hung collector; the section reports an error.
- Script output is parsed as strict JSON (`serde_json`); parse failures surface as
  collector errors, never as fabricated status.

## Threat model notes

- **Spoofing risk:** Sentinel reports what Windows APIs report. Malware with admin rights
  could lie to those APIs; Sentinel is a convenience dashboard, not an integrity monitor,
  and the UI copy avoids claiming otherwise.
- **The dashboard itself as a target:** because Phase 1 has no write path and no
  privileged helper, compromising the UI yields no capability an attacker didn't
  already have as the same user.
- **Update/scan actions (Phase 3+)** will be individually reviewed, allow-listed,
  fixed-verb commands (e.g. "start quick scan"), never parameterized shell strings, and
  anything requiring elevation will open the Windows Security app instead of elevating
  Sentinel.

## Review checklist for future changes

- [ ] Does any new Tauri command take a string that reaches a process, path, or registry write? (Must be no)
- [ ] Do capabilities stay at `core:default` (+ explicitly justified additions)?
- [ ] Does anything request elevation? (Phase ≤3: must be no)
- [ ] Does any code path disable, suspend, or reconfigure a protection? (Always no)
- [ ] Is new PowerShell still `&'static str` const + `-NoProfile -NonInteractive`?
