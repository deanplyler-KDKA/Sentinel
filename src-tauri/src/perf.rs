//! Live performance sampling, Rust-native via sysinfo — no process spawning.
//!
//! A background thread samples every 2 seconds into a rolling in-memory
//! window (~6 minutes). Nothing here touches SQLite: high-frequency samples
//! stay in memory by design. The IPC commands only read the latest state.

use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, Networks, ProcessRefreshKind,
    ProcessesToUpdate, RefreshKind, System};

use crate::diag;

const SAMPLE_INTERVAL: Duration = Duration::from_secs(2);
const WINDOW_SAMPLES: usize = 180; // ~6 minutes at 2s
const TOP_N: usize = 8;
/// If the sampler thread dies, get_overview must stop serving frozen numbers
/// as if they were live (F9). Data older than this is treated as stale.
const STALE_AFTER: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfPoint {
    pub ts_ms: i64,
    pub cpu_pct: f32,
    pub mem_used_mb: u64,
    pub mem_total_mb: u64,
    pub rx_bps: u64,
    pub tx_bps: u64,
    pub disk_read_bps: u64,
    pub disk_write_bps: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcInfo {
    pub name: String,
    pub cpu_pct: f32,
    pub mem_mb: u64,
    pub disk_bps: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpace {
    pub mount: String,
    pub total_gb: f64,
    pub free_gb: f64,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfOverview {
    pub sampled_at: String,
    pub cpu_model: String,
    pub logical_cores: usize,
    pub cpu_freq_mhz: u64,
    pub cpu_pct: f32,
    pub per_core_pct: Vec<f32>,
    pub mem_total_mb: u64,
    pub mem_used_mb: u64,
    pub mem_available_mb: u64,
    pub uptime_secs: u64,
    pub process_count: usize,
    pub disks: Vec<DiskSpace>,
    pub top_cpu: Vec<ProcInfo>,
    pub top_mem: Vec<ProcInfo>,
    pub top_disk: Vec<ProcInfo>,
}

static SERIES: OnceLock<Mutex<VecDeque<PerfPoint>>> = OnceLock::new();
static OVERVIEW: OnceLock<Mutex<Option<PerfOverview>>> = OnceLock::new();

fn series() -> &'static Mutex<VecDeque<PerfPoint>> {
    SERIES.get_or_init(|| Mutex::new(VecDeque::with_capacity(WINDOW_SAMPLES)))
}

fn overview_cell() -> &'static Mutex<Option<PerfOverview>> {
    OVERVIEW.get_or_init(|| Mutex::new(None))
}

/// Starts the sampler thread. Called once from setup; never panics the app.
pub fn start_sampler() {
    std::thread::Builder::new()
        .name("perf-sampler".into())
        .spawn(sampler_loop)
        .map(|_| ())
        .unwrap_or_else(|e| diag::heartbeat("perf-sampler", Some(format!("spawn failed: {e}"))));
}

fn sampler_loop() {
    let refresh = RefreshKind::nothing()
        .with_cpu(CpuRefreshKind::nothing().with_cpu_usage().with_frequency())
        .with_memory(MemoryRefreshKind::nothing().with_ram());
    let mut sys = System::new_with_specifics(refresh);
    let mut networks = Networks::new_with_refreshed_list();
    let mut disks = Disks::new_with_refreshed_list();
    let mut tick: u64 = 0;

    let mut last_tick = Instant::now();
    loop {
        std::thread::sleep(SAMPLE_INTERVAL);
        // Rates use the real elapsed period, not the nominal 2s — sleep plus
        // work makes the true interval slightly longer, which would otherwise
        // overstate every byte-rate by a few percent.
        let elapsed_secs = last_tick.elapsed().as_secs_f64().max(0.1);
        last_tick = Instant::now();
        tick += 1;
        sys.refresh_specifics(refresh);
        sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_cpu().with_memory().with_disk_usage(),
        );
        networks.refresh(true);
        if tick.is_multiple_of(30) {
            // Disk capacities change slowly; refresh the list once a minute.
            disks.refresh(true);
        }

        let cores = sys.cpus().len().max(1);

        let (mut rx, mut tx) = (0u64, 0u64);
        for data in networks.values() {
            rx += data.received();
            tx += data.transmitted();
        }

        let (mut disk_read, mut disk_write) = (0u64, 0u64);
        let mut procs: Vec<ProcInfo> = sys
            .processes()
            .values()
            .map(|p| {
                let du = p.disk_usage();
                disk_read += du.read_bytes;
                disk_write += du.written_bytes;
                ProcInfo {
                    name: p.name().to_string_lossy().to_string(),
                    cpu_pct: p.cpu_usage() / cores as f32,
                    mem_mb: p.memory() / (1024 * 1024),
                    disk_bps: ((du.read_bytes + du.written_bytes) as f64 / elapsed_secs) as u64,
                }
            })
            .collect();

        let point = PerfPoint {
            ts_ms: chrono::Utc::now().timestamp_millis(),
            cpu_pct: sys.global_cpu_usage(),
            mem_used_mb: sys.used_memory() / (1024 * 1024),
            mem_total_mb: sys.total_memory() / (1024 * 1024),
            rx_bps: (rx as f64 / elapsed_secs) as u64,
            tx_bps: (tx as f64 / elapsed_secs) as u64,
            disk_read_bps: (disk_read as f64 / elapsed_secs) as u64,
            disk_write_bps: (disk_write as f64 / elapsed_secs) as u64,
        };

        if let Ok(mut s) = series().lock() {
            if s.len() >= WINDOW_SAMPLES {
                s.pop_front();
            }
            s.push_back(point);
        }

        // Aggregate same-named processes (browsers etc.) before ranking.
        let mut merged: std::collections::HashMap<String, ProcInfo> = std::collections::HashMap::new();
        for p in procs.drain(..) {
            let e = merged.entry(p.name.clone()).or_insert_with(|| ProcInfo {
                name: p.name.clone(),
                cpu_pct: 0.0,
                mem_mb: 0,
                disk_bps: 0,
            });
            e.cpu_pct += p.cpu_pct;
            e.mem_mb += p.mem_mb;
            e.disk_bps += p.disk_bps;
        }
        let merged: Vec<ProcInfo> = merged.into_values().collect();
        let top_by = |key: fn(&ProcInfo) -> f64| {
            let mut v = merged.clone();
            v.sort_by(|a, b| key(b).partial_cmp(&key(a)).unwrap_or(std::cmp::Ordering::Equal));
            v.truncate(TOP_N);
            v.retain(|p| key(p) > 0.0);
            v
        };

        let overview = PerfOverview {
            sampled_at: chrono::Utc::now().to_rfc3339(),
            cpu_model: sys
                .cpus()
                .first()
                .map(|c| c.brand().trim().to_string())
                .unwrap_or_else(|| "Unknown".into()),
            logical_cores: cores,
            cpu_freq_mhz: sys.cpus().first().map(|c| c.frequency()).unwrap_or(0),
            cpu_pct: sys.global_cpu_usage(),
            per_core_pct: sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
            mem_total_mb: sys.total_memory() / (1024 * 1024),
            mem_used_mb: sys.used_memory() / (1024 * 1024),
            mem_available_mb: sys.available_memory() / (1024 * 1024),
            uptime_secs: System::uptime(),
            process_count: sys.processes().len(),
            disks: disks
                .iter()
                .map(|d| DiskSpace {
                    mount: d.mount_point().to_string_lossy().to_string(),
                    total_gb: d.total_space() as f64 / 1e9,
                    free_gb: d.available_space() as f64 / 1e9,
                    kind: format!("{:?}", d.kind()),
                })
                .collect(),
            top_cpu: top_by(|p| p.cpu_pct as f64),
            top_mem: top_by(|p| p.mem_mb as f64),
            top_disk: top_by(|p| p.disk_bps as f64),
        };
        if let Ok(mut cell) = overview_cell().lock() {
            *cell = Some(overview);
        }
        diag::heartbeat("perf-sampler", None);
    }
}

pub fn get_series() -> Vec<PerfPoint> {
    series().lock().map(|s| s.iter().cloned().collect()).unwrap_or_default()
}

/// None until the first sample lands (~2s after launch), and None again if the
/// sampler has gone silent (thread died) — the UI shows "Checking" rather than
/// frozen numbers. Never fabricates zeros.
pub fn get_overview() -> Option<PerfOverview> {
    let overview = overview_cell().lock().ok().and_then(|c| c.clone())?;
    let fresh = chrono::DateTime::parse_from_rfc3339(&overview.sampled_at)
        .map(|t| {
            (chrono::Utc::now() - t.with_timezone(&chrono::Utc))
                .to_std()
                .map(|age| age < STALE_AFTER)
                .unwrap_or(false)
        })
        .unwrap_or(false);
    fresh.then_some(overview)
}
