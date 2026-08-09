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
- Force JSON arrays with `ConvertTo-Json -InputObject @(...)` (PS 5.1 unwraps
  single-element arrays otherwise) and set `[Console]::OutputEncoding` to UTF-8
  at the top of every script.
- Score weights live only in `src/lib/score.ts` (`WEIGHTS` table) and must sum to 100.
- UI copy is plain language ("Ransomware protection is off"), not jargon
  ("EnableControlledFolderAccess=0").

## Build & run

- `npm run dev` — Vite only; browser at :1420 uses mock data (`src/lib/mock.ts`)
  when Tauri isn't present, so UI work doesn't need the Rust build.
- `npm run tauri dev` — full app (needs Rust + MSVC Build Tools).
- `npm run tauri build` — release bundle.
