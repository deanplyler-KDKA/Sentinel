# Sentinel — Reliability Model

## Collector contract

Every data collector in Sentinel obeys the same rules:

1. **Timeout.** PowerShell collectors are killed at 20 s; the TCP probe at 2 s per
   attempt; the speed test at 30 s per HTTP call. Nothing can hang the app.
2. **Independent failure.** Collectors run in isolation (threads / separate spawns);
   one failing collector degrades exactly one section to "Unknown" and never takes
   the dashboard down.
3. **Structured status.** Failures surface as typed errors into the diagnostics
   registry (`src-tauri/src/diag.rs`) — name, last success, last error, duration,
   run/failure counts — visible in Settings → Collector diagnostics. A failed
   collector is never rendered as healthy.
4. **Unavailable ≠ failure ≠ unsupported ≠ disabled.**
   - *Unavailable*: the source exists but couldn't be read now → "Unknown", scores 0.
   - *Unsupported*: the platform/hardware cannot provide it (battery wear data,
     CPU temperature, per-process network) → labeled Unsupported/Not reported and
     **excluded** from scoring, never penalized.
   - *Disabled*: the source read successfully and reports off → scored as off.
5. **No locale-sensitive parsing.** All PowerShell output is `ConvertTo-Json`;
   timestamps are ISO-8601 emitted by the source; enums are compared as invariant
   strings; no text scraping of localized command output anywhere. (The one known
   locale-adjacent surface is PowerShell enum *names* like `Healthy`, which are
   invariant in practice; see Known limitations.)
6. **Machine-readable first.** CIM/WMI, Storage cmdlets, registry values, sysinfo
   native APIs, and Windows COM interfaces — no scraping of human-oriented tools.

## Sampling & resource discipline

- Live performance data comes from an in-process sampler (Rust `sysinfo`) at a
  fixed 2 s cadence into a bounded in-memory ring (~6 min). It never touches
  SQLite — high-frequency samples are deliberately memory-only.
- The frontend polls the sampler every 3 s **only while the window is visible**
  (first fetch always runs); hidden windows stop polling.
- Security snapshot: 60 s. Connection probe: 5 min. Hardware facts: cached 10 min.
- SQLite receives only meaningful state-change events (deduplicated by the diff
  engine) and completed speed tests.

## Failure containment map

| Component | Failure mode | Contained by |
|---|---|---|
| PowerShell collector | hang / crash / bad output | timeout + kill, JSON parse rejection, per-section Unknown |
| Perf sampler | panic / spawn failure | separate thread; heartbeat shows failure in diagnostics |
| Timeline DB | corruption / lock | best-effort writes, logged errors, app runs without history |
| Speed test | network failure | single-flight guard, typed error to UI, nothing stored |
| Frontend page | render exception | React error boundary crash screen |
| Backend panic | any | panic hook logs message + backtrace before exit |

## Known limitations (honest list)

- CPU/GPU temperature and GPU utilization: not exposed to unprivileged user-mode
  apps reliably → shown as Unsupported.
- Battery wear/cycle data: firmware-dependent; unsupported on some laptops
  (verified on the dev machine) → excluded from scoring.
- Startup impact: Windows does not expose measured impact to apps → Unavailable.
- Per-process network usage: needs elevated ETW access → not shown.
- TCP connect time is used as the latency metric (ICMP needs admin); it tracks
  ping closely but is labeled "connection latency", not "ping".
- DNS timing uses the system resolver and may be cache-assisted → coarse signal.
- Windows Update "pending updates count" requires the slow WUA COM searcher →
  deferred; freshness is inferred from last install/search + reboot-pending.
