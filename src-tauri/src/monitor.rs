//! Background monitoring: the part that makes Sentinel a watcher rather than
//! a viewer. Runs on a timer whether or not the window is open, records
//! changes to the timeline, and notifies on the ones a person would actually
//! want interrupting them.
//!
//! Restraint is the whole design here. A security tool that cries wolf gets
//! muted, and a muted tool protects nobody. So: only genuine degradations
//! notify, each kind at most once in a long while, and nothing at all during
//! quiet hours — those are held and delivered when the household is awake.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::platform::hardware;
use crate::{appdata, commands, perf, settings, timeline};

/// Don't repeat the same kind of alert inside this window, even if the
/// underlying state flaps.
const DEDUP_WINDOW: Duration = Duration::from_secs(6 * 3600);
/// Standing conditions (low disk, failing drive) are re-checked every tick but
/// only ever mentioned once a day.
const STANDING_WINDOW: Duration = Duration::from_secs(24 * 3600);

struct Pending {
    title: String,
    body: String,
}

static LAST_SENT: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
static HELD: OnceLock<Mutex<Vec<Pending>>> = OnceLock::new();

fn last_sent() -> &'static Mutex<HashMap<String, Instant>> {
    LAST_SENT.get_or_init(|| Mutex::new(HashMap::new()))
}

fn held() -> &'static Mutex<Vec<Pending>> {
    HELD.get_or_init(|| Mutex::new(Vec::new()))
}

/// Starts the monitor thread. It checks settings on every tick, so turning
/// background monitoring on or off takes effect without a restart.
pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("sentinel-monitor".into())
        .spawn(move || monitor_loop(app))
        .map(|_| ())
        .unwrap_or_else(|e| appdata::log(&format!("monitor thread failed to start: {e}")));
}

fn monitor_loop(app: AppHandle) {
    // A short first delay lets startup settle before the first collection.
    std::thread::sleep(Duration::from_secs(45));
    loop {
        let cfg = settings::get();
        if cfg.background_monitoring {
            run_check(&app, &cfg);
        }
        // Re-read the interval each time rather than caching it, so a settings
        // change is picked up at the next tick instead of at restart.
        let mins = settings::get().check_interval_mins.max(1) as u64;
        std::thread::sleep(Duration::from_secs(mins * 60));
    }
}

fn run_check(app: &AppHandle, cfg: &settings::Settings) {
    let snapshot = commands::collect_snapshot();
    let events = timeline::record(&snapshot);

    for ev in events {
        // "good" and "info" are real events worth keeping in the timeline —
        // definitions updated, VPN connected — but nobody wants a popup for
        // their computer working correctly.
        if ev.severity != "bad" && ev.severity != "warn" {
            continue;
        }
        let title = match ev.severity {
            "bad" => "Sentinel — action recommended",
            _ => "Sentinel — worth a look",
        };
        let body = match &ev.detail {
            Some(d) => format!("{} ({d})", ev.message),
            None => ev.message.clone(),
        };
        queue(app, cfg, ev.kind, title, &body);
    }

    check_standing_conditions(app, cfg);
    flush_if_awake(app, cfg);
}

/// Conditions that are true continuously rather than changing — a disk that is
/// already full never produces a "changed" event, but still deserves saying.
fn check_standing_conditions(app: &AppHandle, cfg: &settings::Settings) {
    if let Some(p) = perf::get_overview() {
        for d in &p.disks {
            if d.total_gb <= 0.0 {
                continue;
            }
            let free_pct = d.free_gb / d.total_gb;
            if free_pct < 0.10 {
                queue(
                    app,
                    cfg,
                    "standing/disk-low",
                    "Sentinel — running out of space",
                    &format!(
                        "Drive {} has {:.0} GB free ({:.0}% left). Low space can stop Windows updates installing.",
                        d.mount,
                        d.free_gb,
                        free_pct * 100.0
                    ),
                );
            }
        }
    }

    // Cached for ten minutes inside hardware.rs, so this is cheap to re-ask.
    if let Ok(hw) = hardware::collect() {
        for disk in hw.physical_disks {
            if !disk.health.eq_ignore_ascii_case("healthy") {
                queue(
                    app,
                    cfg,
                    "standing/disk-health",
                    "Sentinel — check your drive",
                    &format!(
                        "{} reports its health as \"{}\". Back up anything important.",
                        disk.model, disk.health
                    ),
                );
            }
        }
    }
}

/// Applies dedup and quiet hours, then either sends or holds.
fn queue(app: &AppHandle, cfg: &settings::Settings, kind: &str, title: &str, body: &str) {
    if !cfg.notifications {
        return;
    }
    let window = if kind.starts_with("standing/") {
        STANDING_WINDOW
    } else {
        DEDUP_WINDOW
    };
    if let Ok(mut seen) = last_sent().lock() {
        if let Some(at) = seen.get(kind) {
            if at.elapsed() < window {
                return;
            }
        }
        seen.insert(kind.to_string(), Instant::now());
    }

    let hour = chrono::Local::now().format("%H").to_string().parse::<u8>().unwrap_or(12);
    if cfg.in_quiet_hours(hour) {
        if let Ok(mut h) = held().lock() {
            // Bound it: if something is flapping overnight, the person needs a
            // handful of messages in the morning, not hundreds.
            if h.len() < 10 {
                h.push(Pending { title: title.into(), body: body.into() });
            }
        }
        return;
    }
    send(app, title, body);
}

fn flush_if_awake(app: &AppHandle, cfg: &settings::Settings) {
    let hour = chrono::Local::now().format("%H").to_string().parse::<u8>().unwrap_or(12);
    if cfg.in_quiet_hours(hour) {
        return;
    }
    let pending: Vec<Pending> = match held().lock() {
        Ok(mut h) => h.drain(..).collect(),
        Err(_) => return,
    };
    for p in pending {
        send(app, &p.title, &p.body);
    }
}

fn send(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        appdata::log(&format!("notification failed: {e}"));
    }
}
