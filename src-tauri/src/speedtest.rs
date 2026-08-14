//! Internet speed test against Cloudflare's public speed endpoints
//! (speed.cloudflare.com). STRICTLY user-initiated — never runs
//! automatically or on a timer. This is the only network communication in
//! the entire application, and it transmits no personal data: it downloads
//! throwaway bytes and uploads zeros. Documented in docs/PRIVACY.md.

use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::timeline;

// Cloudflare rejects __down sizes at/above ~100 MB with 403, so a single
// request can't both stay accepted and last long enough to measure a fast
// link (50 MB finishes in well under a second at gigabit). Both directions
// therefore loop fixed-size chunks until a time window elapses: a fast
// connection transfers several chunks, a slow one is cut off mid-chunk, and
// either way the rate is total bytes over measured time.
const DOWN_URL: &str = "https://speed.cloudflare.com/__down?bytes=50000000";
const UP_URL: &str = "https://speed.cloudflare.com/__up";
const PING_ADDR: &str = "speed.cloudflare.com:443";
const DOWN_CHUNK_BYTES: u64 = 50_000_000;
const UPLOAD_CHUNK_BYTES: usize = 8 * 1024 * 1024;
const MEASURE_WINDOW: Duration = Duration::from_secs(8);
const UPLOAD_WINDOW: Duration = Duration::from_secs(8);
/// Backstop so a pathological connection can't loop forever.
const MAX_CHUNKS: usize = 40;

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
}

pub fn run() -> Result<SpeedTestResult, String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("a speed test is already running".into());
    }
    let _guard = RunningGuard;
    run_inner()
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
    while started.elapsed() < MEASURE_WINDOW && chunks < MAX_CHUNKS {
        chunks += 1;
        let mut resp = client
            .get(DOWN_URL)
            .send()
            .map_err(|e| format!("download failed to start: {e}"))?;
        // error_for_status covers 4xx/5xx; with redirects disabled an
        // unexpected 3xx would otherwise read as an empty body and be recorded
        // as a real 0 Mbps result, polluting the baselines (N3).
        if !resp.status().is_success() {
            return Err(format!("download endpoint returned {}", resp.status()));
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
        // A chunk that ended early without filling the window means the
        // connection closed on us; don't spin re-requesting.
        if chunk_read < DOWN_CHUNK_BYTES && started.elapsed() < MEASURE_WINDOW && chunk_read == 0 {
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
    while started.elapsed() < UPLOAD_WINDOW && up_chunks < MAX_CHUNKS {
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
    let id = timeline::save_speedtest(&ts, down_mbps, up_mbps, ping_ms, jitter_ms)?;
    timeline::record_speedtest_event(down_mbps, up_mbps);

    Ok(SpeedTestResult {
        id,
        ts,
        down_mbps: round1(down_mbps),
        up_mbps: up_mbps.map(round1),
        ping_ms: ping_ms.map(round1),
        jitter_ms: jitter_ms.map(round1),
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
        match super::run() {
            Ok(r) => println!(
                "RESULT down={:.1} Mbps up={:?} ping={:?} jitter={:?}",
                r.down_mbps, r.up_mbps, r.ping_ms, r.jitter_ms
            ),
            Err(e) => panic!("speed test failed: {e}"),
        }
    }
}
