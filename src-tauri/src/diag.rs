//! Collector status registry for the developer diagnostics area. Every
//! collector run is tracked: last success, last failure, duration, counts.
//! A collector that fails must be visibly failed here — never silently green.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectorStatus {
    pub name: String,
    pub last_success: Option<String>,
    pub last_error: Option<String>,
    pub last_error_at: Option<String>,
    pub last_duration_ms: Option<u64>,
    pub runs: u64,
    pub failures: u64,
}

static REGISTRY: OnceLock<Mutex<HashMap<&'static str, CollectorStatus>>> = OnceLock::new();

fn registry() -> &'static Mutex<HashMap<&'static str, CollectorStatus>> {
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Runs a collector, recording timing and outcome under `name`.
pub fn track<T>(name: &'static str, f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let started = Instant::now();
    let result = f();
    let duration_ms = started.elapsed().as_millis() as u64;
    let now = chrono::Utc::now().to_rfc3339();
    if let Ok(mut reg) = registry().lock() {
        let entry = reg.entry(name).or_insert_with(|| CollectorStatus {
            name: name.to_string(),
            last_success: None,
            last_error: None,
            last_error_at: None,
            last_duration_ms: None,
            runs: 0,
            failures: 0,
        });
        entry.runs += 1;
        entry.last_duration_ms = Some(duration_ms);
        match &result {
            Ok(_) => entry.last_success = Some(now),
            Err(e) => {
                entry.failures += 1;
                entry.last_error = Some(e.clone());
                entry.last_error_at = Some(now);
            }
        }
    }
    result
}

/// Heartbeat for continuously-running components (the perf sampler).
pub fn heartbeat(name: &'static str, error: Option<String>) {
    let now = chrono::Utc::now().to_rfc3339();
    if let Ok(mut reg) = registry().lock() {
        let entry = reg.entry(name).or_insert_with(|| CollectorStatus {
            name: name.to_string(),
            last_success: None,
            last_error: None,
            last_error_at: None,
            last_duration_ms: None,
            runs: 0,
            failures: 0,
        });
        entry.runs += 1;
        match error {
            None => entry.last_success = Some(now),
            Some(e) => {
                entry.failures += 1;
                entry.last_error = Some(e);
                entry.last_error_at = Some(now);
            }
        }
    }
}

pub fn all() -> Vec<CollectorStatus> {
    let mut list: Vec<CollectorStatus> = registry()
        .lock()
        .map(|reg| reg.values().cloned().collect())
        .unwrap_or_default();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    list
}
