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

const DOWN_URL: &str = "https://speed.cloudflare.com/__down?bytes=200000000";
const UP_URL: &str = "https://speed.cloudflare.com/__up";
const PING_ADDR: &str = "speed.cloudflare.com:443";
const MEASURE_WINDOW: Duration = Duration::from_secs(8);
const UPLOAD_BYTES: usize = 25 * 1024 * 1024;

static RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestResult {
    pub id: i64,
    pub ts: String,
    pub down_mbps: f64,
    pub up_mbps: f64,
    pub ping_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
}

pub fn run() -> Result<SpeedTestResult, String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("a speed test is already running".into());
    }
    let result = run_inner();
    RUNNING.store(false, Ordering::SeqCst);
    result
}

fn run_inner() -> Result<SpeedTestResult, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    // Latency first: TCP connect samples to the same host we test against.
    let (ping_ms, jitter_ms) = tcp_ping();

    // Download: stream until the measure window elapses; rate = bytes/time
    // measured from first byte, so connection setup doesn't skew it.
    let mut resp = client
        .get(DOWN_URL)
        .send()
        .map_err(|e| format!("download failed to start: {e}"))?
        .error_for_status()
        .map_err(|e| format!("download rejected: {e}"))?;
    let mut buf = vec![0u8; 256 * 1024];
    let mut received: u64 = 0;
    let started = Instant::now();
    loop {
        match resp.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                received += n as u64;
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
    let down_secs = started.elapsed().as_secs_f64().max(0.1);
    let down_mbps = (received as f64 * 8.0) / down_secs / 1e6;

    // Upload: POST a fixed buffer of zeros, timed.
    let payload = vec![0u8; UPLOAD_BYTES];
    let started = Instant::now();
    client
        .post(UP_URL)
        .body(payload)
        .send()
        .map_err(|e| format!("upload failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("upload rejected: {e}"))?;
    let up_secs = started.elapsed().as_secs_f64().max(0.1);
    let up_mbps = (UPLOAD_BYTES as f64 * 8.0) / up_secs / 1e6;

    let ts = chrono::Utc::now().to_rfc3339();
    let id = timeline::save_speedtest(&ts, down_mbps, up_mbps, ping_ms, jitter_ms)?;
    timeline::record_speedtest_event(down_mbps, up_mbps);

    Ok(SpeedTestResult {
        id,
        ts,
        down_mbps: round1(down_mbps),
        up_mbps: round1(up_mbps),
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
