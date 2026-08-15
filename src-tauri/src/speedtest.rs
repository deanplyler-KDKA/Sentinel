//! Internet speed test against Cloudflare's public speed endpoints
//! (speed.cloudflare.com). STRICTLY user-initiated — never runs
//! automatically or on a timer. This is the only network communication in
//! the entire application, and it transmits no personal data: it downloads
//! throwaway bytes and uploads zeros. Documented in docs/PRIVACY.md.

use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::timeline;

// Endpoint constraints, learned empirically (see docs/RELIABILITY.md):
//   * __down rejects sizes at/above ~100 MB with 403, so one request can't be
//     made long enough to measure a fast link (50 MB is <1 s at gigabit).
//   * The service also rate-limits by REQUEST COUNT and answers 429. An
//     earlier design looped chunks for 8 s (~10 requests/test) and got itself
//     throttled after a few runs.
// So: few requests, hard-capped, with a cooldown between tests. Accuracy on
// very fast links is deliberately traded for being a good citizen of someone
// else's free service.
const DOWN_URL: &str = "https://speed.cloudflare.com/__down?bytes=25000000";
const UP_URL: &str = "https://speed.cloudflare.com/__up";
const PING_ADDR: &str = "speed.cloudflare.com:443";
const UPLOAD_CHUNK_BYTES: usize = 4 * 1024 * 1024;
/// Stop starting new chunks once this much time has been spent.
const MEASURE_WINDOW: Duration = Duration::from_secs(4);
const UPLOAD_WINDOW: Duration = Duration::from_secs(5);
/// Hard ceiling on requests per direction, per test. With the sizes above a
/// full test moves at most ~58 MB, which the throttle tolerates far better
/// than the 150 MB the first version used.
const MAX_DOWN_CHUNKS: usize = 2;
const MAX_UP_CHUNKS: usize = 2;
/// Minimum spacing between tests, enforced in the backend so a rapid
/// click-click-click can't get the user throttled.
const COOLDOWN: Duration = Duration::from_secs(60);

static LAST_RUN: Mutex<Option<Instant>> = Mutex::new(None);

/// Maps a rate-limit response to language a normal person can act on.
///
/// The 429 wording names the VPN case deliberately: the limit is per public
/// IP, and a VPN exit address is shared with many other users, so the budget
/// can be exhausted by strangers before this app sends anything at all. That
/// is invisible and baffling unless we say it.
fn describe_status(status: reqwest::StatusCode, retry_after: Option<u64>, leg: &str) -> String {
    if status.as_u16() == 429 {
        let wait = match retry_after {
            Some(s) if s >= 60 => format!("about {} minutes", s.div_ceil(60)),
            Some(s) => format!("about {s} seconds"),
            None => "a few minutes".to_string(),
        };
        format!(
            "The speed test service is limiting requests from your network — try again in {wait}. \
             If you're connected to a VPN, this limit is shared with everyone using the same VPN \
             server, so disconnecting or switching servers often clears it."
        )
    } else {
        format!("{leg} endpoint returned {status}")
    }
}

fn retry_after_secs(resp: &reqwest::blocking::Response) -> Option<u64> {
    resp.headers()
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse()
        .ok()
}

static RUNNING: AtomicBool = AtomicBool::new(false);

/// RAII single-flight guard: clears RUNNING even if run_inner panics (F5), so
/// a failed test can never permanently wedge the feature.
struct RunningGuard;
impl Drop for RunningGuard {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestResult {
    pub id: i64,
    pub ts: String,
    pub down_mbps: f64,
    /// None when the upload leg didn't complete — never 0.0 as a sentinel.
    pub up_mbps: Option<f64>,
    pub ping_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    /// Which service measured this. Results from different engines are not
    /// directly comparable, so baselines are computed per engine.
    pub engine: SpeedEngine,
    /// M-Lab reports the server that handled the test; Cloudflare doesn't.
    pub server: Option<String>,
}

/// Which measurement service to use. Closed enum, not a string — the WebView
/// picks from a fixed menu (same reasoning as actions::SettingsTarget).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SpeedEngine {
    /// Private — results are not published — but rate-limits hard, especially
    /// behind a shared VPN exit IP.
    Cloudflare,
    /// Purpose-built for third-party speed tests and far more reliable, but
    /// every measurement is published as open research data including the
    /// client IP. Disclosed in the UI and docs/PRIVACY.md.
    Mlab,
}

impl SpeedEngine {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Cloudflare => "cloudflare",
            Self::Mlab => "mlab",
        }
    }
}

pub fn run(engine: SpeedEngine) -> Result<SpeedTestResult, String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("a speed test is already running".into());
    }
    let _guard = RunningGuard;

    // Cooldown: repeated back-to-back tests are what triggers rate limiting,
    // and the result wouldn't be meaningfully different anyway. It applies to
    // both engines — the point is to stop rapid clicking, not just to appease
    // one service.
    if let Ok(last) = LAST_RUN.lock() {
        if let Some(at) = *last {
            let since = at.elapsed();
            if since < COOLDOWN {
                let wait = (COOLDOWN - since).as_secs() + 1;
                return Err(format!(
                    "Speed tests are limited to one per minute. Try again in {wait} seconds."
                ));
            }
        }
    }

    let result = match engine {
        SpeedEngine::Cloudflare => run_inner(),
        SpeedEngine::Mlab => run_mlab(),
    };
    // Record the attempt regardless of outcome: a failed attempt still cost
    // requests, so the cooldown must apply to it too.
    if let Ok(mut last) = LAST_RUN.lock() {
        *last = Some(Instant::now());
    }
    result
}

/// M-Lab path. Latency still comes from our own TCP probe so the ping column
/// is measured the same way for both engines and stays comparable.
fn run_mlab() -> Result<SpeedTestResult, String> {
    let (ping_ms, jitter_ms) = tcp_ping();
    let outcome = crate::ndt7::run()?;
    let ts = chrono::Utc::now().to_rfc3339();
    let id = timeline::save_speedtest(
        &ts,
        outcome.down_mbps,
        outcome.up_mbps,
        ping_ms,
        jitter_ms,
        SpeedEngine::Mlab.as_str(),
    )?;
    timeline::record_speedtest_event(outcome.down_mbps, outcome.up_mbps);
    Ok(SpeedTestResult {
        id,
        ts,
        down_mbps: round1(outcome.down_mbps),
        up_mbps: outcome.up_mbps.map(round1),
        ping_ms: ping_ms.map(round1),
        jitter_ms: jitter_ms.map(round1),
        engine: SpeedEngine::Mlab,
        server: Some(outcome.server),
    })
}

fn run_inner() -> Result<SpeedTestResult, String> {
    // redirect::none (F6): enforces "only ever speed.cloudflare.com" — a
    // redirect can't quietly send the test, or its error text, elsewhere.
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    // Latency first: TCP connect samples to the same host we test against.
    let (ping_ms, jitter_ms) = tcp_ping();

    // Download: request chunks back-to-back until the window elapses. Rate is
    // measured across the whole loop, so per-request setup is amortized rather
    // than excluded — that matches what a user experiences.
    let mut buf = vec![0u8; 256 * 1024];
    let mut received: u64 = 0;
    let started = Instant::now();
    let mut chunks = 0usize;
    while started.elapsed() < MEASURE_WINDOW && chunks < MAX_DOWN_CHUNKS {
        chunks += 1;
        let mut resp = client
            .get(DOWN_URL)
            .send()
            .map_err(|e| format!("download failed to start: {e}"))?;
        // Covers 4xx/5xx and — with redirects disabled — an unexpected 3xx,
        // which would otherwise read as an empty body and be recorded as a
        // real 0 Mbps result, polluting the baselines (N3).
        if !resp.status().is_success() {
            // A later chunk being throttled after earlier ones succeeded is
            // still a usable measurement; only fail outright if we have none.
            if received > 0 {
                break;
            }
            let retry = retry_after_secs(&resp);
            return Err(describe_status(resp.status(), retry, "Download"));
        }
        let mut chunk_read: u64 = 0;
        loop {
            match resp.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    received += n as u64;
                    chunk_read += n as u64;
                    if started.elapsed() >= MEASURE_WINDOW {
                        break;
                    }
                }
                Err(e) => {
                    if received == 0 {
                        return Err(format!("download failed: {e}"));
                    }
                    break;
                }
            }
        }
        // Connection closed without delivering anything — don't re-request.
        if chunk_read == 0 {
            break;
        }
    }
    if received == 0 {
        return Err("download produced no data".into());
    }
    let down_secs = started.elapsed().as_secs_f64().max(0.1);
    let down_mbps = (received as f64 * 8.0) / down_secs / 1e6;

    // Upload: same chunked, time-bounded shape as the download. If not even a
    // single chunk completes (slow uplink hitting the request timeout), upload
    // is reported as unmeasured — None, never 0.0, since "not measured" and
    // "zero" are different facts (F7/N4) — while the good download result is
    // still kept and returned.
    let payload = vec![0u8; UPLOAD_CHUNK_BYTES];
    let started = Instant::now();
    let mut sent: u64 = 0;
    let mut up_chunks = 0usize;
    while started.elapsed() < UPLOAD_WINDOW && up_chunks < MAX_UP_CHUNKS {
        up_chunks += 1;
        match client.post(UP_URL).body(payload.clone()).send() {
            Ok(r) if r.status().is_success() => sent += UPLOAD_CHUNK_BYTES as u64,
            _ => break,
        }
    }
    let up_mbps: Option<f64> = if sent > 0 {
        let up_secs = started.elapsed().as_secs_f64().max(0.1);
        Some((sent as f64 * 8.0) / up_secs / 1e6)
    } else {
        None
    };

    let ts = chrono::Utc::now().to_rfc3339();
    let id = timeline::save_speedtest(
        &ts,
        down_mbps,
        up_mbps,
        ping_ms,
        jitter_ms,
        SpeedEngine::Cloudflare.as_str(),
    )?;
    timeline::record_speedtest_event(down_mbps, up_mbps);

    Ok(SpeedTestResult {
        id,
        ts,
        down_mbps: round1(down_mbps),
        up_mbps: up_mbps.map(round1),
        ping_ms: ping_ms.map(round1),
        jitter_ms: jitter_ms.map(round1),
        engine: SpeedEngine::Cloudflare,
        server: None,
    })
}

fn tcp_ping() -> (Option<f64>, Option<f64>) {
    use std::net::{TcpStream, ToSocketAddrs};
    let Ok(mut addrs) = PING_ADDR.to_socket_addrs() else { return (None, None) };
    let Some(addr) = addrs.next() else { return (None, None) };
    let mut samples = Vec::new();
    for i in 0..6 {
        let started = Instant::now();
        if TcpStream::connect_timeout(&addr, Duration::from_secs(2)).is_ok() && i > 0 {
            samples.push(started.elapsed().as_secs_f64() * 1000.0);
        }
    }
    if samples.is_empty() {
        return (None, None);
    }
    let mut sorted = samples.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = sorted[sorted.len() / 2];
    let jitter = if samples.len() >= 2 {
        let diffs: Vec<f64> = samples.windows(2).map(|w| (w[1] - w[0]).abs()).collect();
        Some(diffs.iter().sum::<f64>() / diffs.len() as f64)
    } else {
        None
    };
    (Some(median), jitter)
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

#[cfg(test)]
mod tests {
    /// The frontend sends the engine as a bare lowercase string. A rename
    /// mismatch here would only fail at runtime, in the one code path the
    /// offline suite can't exercise — so pin the wire format.
    #[test]
    fn engine_deserializes_from_the_exact_frontend_payload() {
        #[derive(serde::Deserialize)]
        struct Args {
            engine: super::SpeedEngine,
        }
        let a: Args = serde_json::from_str(r#"{"engine":"mlab"}"#).expect("mlab");
        assert_eq!(a.engine, super::SpeedEngine::Mlab);
        let b: Args = serde_json::from_str(r#"{"engine":"cloudflare"}"#).expect("cloudflare");
        assert_eq!(b.engine, super::SpeedEngine::Cloudflare);
        // Anything else must be rejected rather than silently defaulted.
        assert!(serde_json::from_str::<Args>(r#"{"engine":"http://evil"}"#).is_err());
        assert!(serde_json::from_str::<Args>(r#"{"engine":"MLAB"}"#).is_err());
    }

    /// Live network diagnostic — excluded from normal runs (tests must not
    /// depend on the internet). Run explicitly when the speed test misbehaves:
    ///   cargo test speedtest_endpoints -- --ignored --nocapture
    ///
    /// This exists because the feature originally shipped requesting a 200 MB
    /// __down, which Cloudflare rejects with 403 — it failed 100% of the time
    /// and no automated check caught it. Verify the endpoints still accept the
    /// configured chunk sizes whenever they're changed.
    #[test]
    #[ignore]
    fn speedtest_endpoints() {
        use std::time::Duration;

        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("client");

        let down = client.get(super::DOWN_URL).send().expect("down send");
        println!("DOWN {} -> {}", super::DOWN_URL, down.status());
        assert!(
            down.status().is_success(),
            "download endpoint rejected the configured chunk size ({})",
            down.status()
        );

        let payload = vec![0u8; super::UPLOAD_CHUNK_BYTES];
        let up = client.post(super::UP_URL).body(payload).send().expect("up send");
        println!("UP   {} -> {}", super::UP_URL, up.status());
        assert!(
            up.status().is_success(),
            "upload endpoint rejected the configured chunk size ({})",
            up.status()
        );
    }

    /// End-to-end run of the real code path against a throwaway database,
    /// printing the measured result.
    ///   cargo test speedtest_live -- --ignored --nocapture
    #[test]
    #[ignore]
    fn speedtest_live() {
        let dir = std::env::temp_dir().join("sentinel-speedtest-live");
        let _ = std::fs::create_dir_all(&dir);
        crate::timeline::init(&dir).expect("timeline init");
        match super::run(super::SpeedEngine::Cloudflare) {
            Ok(r) => println!(
                "RESULT down={:.1} Mbps up={:?} ping={:?} jitter={:?}",
                r.down_mbps, r.up_mbps, r.ping_ms, r.jitter_ms
            ),
            Err(e) => panic!("speed test failed: {e}"),
        }

        // The cooldown must reject an immediate second run *before* issuing any
        // request — that's what stops rapid clicking from getting the user
        // rate-limited. Costs no network traffic to verify.
        match super::run(super::SpeedEngine::Cloudflare) {
            Ok(_) => panic!("cooldown did not apply to a back-to-back run"),
            Err(e) => {
                println!("COOLDOWN {e}");
                assert!(e.contains("one per minute"), "unexpected error: {e}");
            }
        }
    }
}
