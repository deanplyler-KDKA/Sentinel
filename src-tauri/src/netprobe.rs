//! Connection quality probe — pure Rust, no elevation, no ICMP (raw sockets
//! would need admin). Measures TCP connect latency to well-known anycast
//! endpoints, which tracks real round-trip time closely, plus a system DNS
//! resolution timing. Honest naming: "connection latency", not "ping".

use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

use serde::Serialize;

const TARGETS: [&str; 2] = ["1.1.1.1:443", "8.8.8.8:443"];
const ATTEMPTS: usize = 6; // first is a warmup and discarded
const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetProbe {
    /// Median TCP connect time. None = no target reachable.
    pub latency_ms: Option<f64>,
    /// Mean absolute deviation between consecutive samples.
    pub jitter_ms: Option<f64>,
    /// Failed attempts / total (TCP timeouts as a packet-loss proxy).
    pub loss_pct: f64,
    /// System DNS resolution time for a common name. Can be cache-assisted —
    /// treated as a coarse signal only.
    pub dns_ms: Option<f64>,
    pub target: String,
}

pub fn probe() -> Result<NetProbe, String> {
    let mut chosen_target = TARGETS[0];
    let mut samples: Vec<f64> = Vec::new();
    let mut failures = 0usize;

    'targets: for target in TARGETS {
        let addr: SocketAddr = target.parse().map_err(|e| format!("bad target: {e}"))?;
        samples.clear();
        failures = 0;
        for i in 0..ATTEMPTS {
            let started = Instant::now();
            match TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT) {
                Ok(_) => {
                    if i > 0 {
                        samples.push(started.elapsed().as_secs_f64() * 1000.0);
                    }
                }
                Err(_) => {
                    if i > 0 {
                        failures += 1;
                    }
                }
            }
        }
        if !samples.is_empty() {
            chosen_target = target;
            break 'targets;
        }
    }

    let attempts = (ATTEMPTS - 1) as f64;
    let (latency_ms, jitter_ms) = if samples.is_empty() {
        (None, None)
    } else {
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
    };

    let dns_ms = {
        let started = Instant::now();
        match "www.microsoft.com:443".to_socket_addrs() {
            Ok(mut addrs) => addrs
                .next()
                .map(|_| started.elapsed().as_secs_f64() * 1000.0),
            Err(_) => None,
        }
    };

    Ok(NetProbe {
        latency_ms,
        jitter_ms,
        loss_pct: (failures as f64 / attempts * 100.0).round(),
        dns_ms,
        target: chosen_target.split(':').next().unwrap_or(chosen_target).to_string(),
    })
}
