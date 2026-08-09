# Sentinel

**Personal Security Center for Windows.** Sentinel is not an antivirus — Microsoft Defender
does the protection. Sentinel is the command center: it reads security status from Windows
(Defender, Firewall, Secure Boot, BitLocker, Windows Update, network, NordVPN) and presents
it as a single score with plain-language recommendations.

Phase 1 is **read-only by design**: Sentinel never changes a setting, never asks for admin,
and its frontend has no way to execute commands. See `docs/SECURITY.md`.

## Screens

- Security score 0–100 (weights in `src/lib/score.ts`, bands: Excellent / Protected /
  Needs attention / At risk / Critical)
- Cards: Antivirus, Firewall, Ransomware, System Security, Network, VPN
- "How to raise your score" recommendations in plain language

## Stack

Tauri 2 · Rust · React 19 · TypeScript · Vite

## Development

```bash
npm install
npm run dev          # UI only in a browser — uses mock data, no Rust needed
npm run tauri dev    # full app (requires Rust + Visual Studio Build Tools with C++)
npm run tauri build  # release installer
```

## Docs

- `docs/ARCHITECTURE.md` — data sources per metric, process model, data model
- `docs/SECURITY.md` — security principles and review checklist
- `docs/ROADMAP.md` — phases 2–6 and known limitations
- `docs/CLAUDE.md` — working agreements for AI-assisted changes
