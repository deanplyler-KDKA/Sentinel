# CLAUDE.md — working agreements for Sentinel

Read `docs/ARCHITECTURE.md` and `docs/SECURITY.md` before changing backend code.

## Hard rules

- **Phase 1 is read-only.** Never add code that modifies Windows security settings,
  registry, services, firewall rules, Defender config, network config, or NordVPN.
- Never request elevation to collect data. Prefer the documented non-admin source.
- The frontend must never be able to send text that reaches a shell. Collector scripts
  are `&'static str` constants; keep `powershell.rs`'s signature that way.
- Keep `capabilities/default.json` at `core:default` unless a phase explicitly
  requires more, and update `SECURITY.md` in the same change.
- Unknown ≠ safe: missing data renders as "Unknown" and scores 0.

## Conventions

- Rust models in `models.rs` serialize camelCase; mirror every change in
  `src/types/security.ts`.
- Timestamps become ISO-8601 strings inside PowerShell (`.ToString('o')`).
- Every collector script starts with the `$env:PSModulePath` pin (see
  `powershell.rs` invariants), uses single quotes only (never `"`), then sets
  `[Console]::OutputEncoding` to UTF-8. Force JSON arrays with
  `ConvertTo-Json -InputObject @(...)` (PS 5.1 unwraps single-element arrays).
- Score weights live only in `src/lib/score.ts` (the `CHECKS` table, inline
  `points`) and must sum to 100.
- Unknown must stay visible: any `unknown` check caps the topbar pill at
  "Incomplete" — never let a partial snapshot render a green headline.
- UI copy is plain language ("Ransomware protection is off"), not jargon
  ("EnableControlledFolderAccess=0").

## Build & run

- `npm run dev` — Vite only; browser at :1420 uses mock data (`src/lib/mock.ts`)
  when Tauri isn't present, so UI work doesn't need the Rust build.
- `npm run tauri dev` — full app (needs Rust + MSVC Build Tools).
- `npm run tauri build` — release bundle.
