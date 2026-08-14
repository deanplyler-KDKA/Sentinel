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
| Speed test | endpoint contract change | `#[ignore]`d live tests assert the endpoints accept the configured chunk sizes |
| Frontend page | render exception | React error boundary crash screen |
| Backend panic | any | panic hook logs message + backtrace before exit |

## Third-party endpoint constraints (speed test)

`speed.cloudflare.com` is a free public service with **two independent limits**, both
discovered the hard way in production:

1. **Size limit.** `__down` rejects sizes at or above roughly 100 MB with **403**. The
   feature originally shipped requesting 200 MB and therefore failed *100% of the
   time*; no automated test caught it because the suite deliberately avoids the
   network.
2. **Volume-based rate limit.** The service answers **429**, and observation says the
   budget tracks *bytes*, not just request count: while throttled, a 1 MB request
   succeeded in the same minute that 10 MB, 25 MB and 50 MB were all refused. The first
   fix for (1) moved ~150 MB per test and tripped this within a few runs.

The design that satisfies both: a small, hard-capped number of requests per test
(**≤2 download, ≤2 upload**), 25 MB / 4 MB each — **≤58 MB per test** — stopping early
once a 4 s / 5 s window elapses; plus a **60-second backend cooldown** applied even to
failed attempts, since those cost budget too. On a fast link this trades measurement
precision for being a good citizen of someone else's free service — a deliberate choice.

**The limit is per public IP, which matters enormously behind a VPN.** A VPN exit
address is shared with every other user on that server, so the budget can be exhausted
by strangers before Sentinel sends a single byte. This is the most likely explanation
when a test fails on an otherwise healthy connection, and the 429 message says so
explicitly (suggesting disconnecting or switching servers) rather than leaving the user
to guess. `Retry-After` is honoured when the service sends it.

A 429 is never surfaced as a raw status code and never recorded as a 0 Mbps result.
Throttling that appears *after* some chunks succeeded keeps the partial measurement
rather than discarding it.

**Do not try to reverse-engineer the limiter by probing it** — every probe extends the
throttle, which is how a debugging session turns into an hour of 429s.

The guard is two `#[ignore]`d live tests, since the normal suite cannot cover this:

```
cargo test speedtest_endpoints -- --ignored --nocapture   # 2 requests, status only
cargo test speedtest_live -- --ignored --nocapture        # full run, prints real rates
```

Any change to `DOWN_URL`, `UP_URL`, or the chunk/cap constants must be accompanied by a
passing run of both. **Run them a minute apart, not back to back** — together they issue
enough requests to trip the rate limit, and the live test enforces the same 60 s
cooldown the app does.

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
