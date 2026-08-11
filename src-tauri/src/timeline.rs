//! Phase 4: the security timeline. A local SQLite database of plain-language
//! events derived by diffing consecutive security snapshots. All local, no
//! cloud, no account.
//!
//! SCOPE GUARD (docs/SECURITY.md): this module writes only to `sentinel.db`
//! inside Sentinel's app-data directory. All SQL is fixed statements with
//! bound parameters; nothing from the WebView ever reaches this module —
//! `get_timeline` takes zero arguments and event text is composed here from
//! observed system state.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::appdata;
use crate::models::{SecuritySnapshot, TimelineEvent};

/// Bump together with a migration branch in `ensure_schema` when the schema
/// changes. v2 added the speedtests table.
const SCHEMA_VERSION: i64 = 2;
const MAX_EVENTS: i64 = 5000;
const LIST_LIMIT: i64 = 300;

static DB: OnceLock<Mutex<Connection>> = OnceLock::new();
static SESSION_RECORDED: AtomicBool = AtomicBool::new(false);

pub fn init(dir: &Path) -> Result<(), String> {
    let conn = Connection::open(dir.join("sentinel.db"))
        .map_err(|e| format!("open timeline db: {e}"))?;
    ensure_schema(&conn)?;
    let _ = DB.set(Mutex::new(conn));
    Ok(())
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| format!("read schema version: {e}"))?;
    if version == 0 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                category TEXT NOT NULL,
                kind TEXT NOT NULL,
                severity TEXT NOT NULL,
                message TEXT NOT NULL,
                detail TEXT,
                after_gap INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_events_id ON events(id DESC);
            CREATE TABLE IF NOT EXISTS state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS speedtests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                down_mbps REAL NOT NULL,
                up_mbps REAL NOT NULL,
                ping_ms REAL,
                jitter_ms REAL
            );
            PRAGMA user_version = 2;",
        )
        .map_err(|e| format!("create schema: {e}"))?;
    } else if version == 1 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS speedtests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                down_mbps REAL NOT NULL,
                up_mbps REAL NOT NULL,
                ping_ms REAL,
                jitter_ms REAL
            );
            PRAGMA user_version = 2;",
        )
        .map_err(|e| format!("migrate schema v1->v2: {e}"))?;
        appdata::log("timeline schema migrated v1 -> v2 (speedtests)");
    } else if version > SCHEMA_VERSION {
        // A newer Sentinel wrote this database; read-compatible or not, do not
        // modify its schema. Recording may fail and will be logged.
        appdata::log(&format!(
            "WARNING timeline schema v{version} is newer than this build (v{SCHEMA_VERSION})"
        ));
    }
    Ok(())
}

/// The slice of a snapshot we track for change detection. Every field is an
/// Option: a failed collector carries the previous value forward so a blip
/// never fabricates a "changed" event.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
struct TrackedState {
    rtp: Option<bool>,
    cloud: Option<bool>,
    tamper: Option<bool>,
    behavior: Option<bool>,
    cfa: Option<bool>,
    sig_version: Option<String>,
    quick_scan_end: Option<String>,
    fw_domain: Option<bool>,
    fw_private: Option<bool>,
    fw_public: Option<bool>,
    secure_boot: Option<bool>,
    bitlocker: Option<String>,
    update_last_install: Option<String>,
    reboot_required: Option<bool>,
    vpn_connected: Option<bool>,
    vpn_adapter: Option<String>,
    network_name: Option<String>,
    network_category: Option<String>,
    dns: Option<Vec<String>>,
}

impl TrackedState {
    fn merge(prev: Option<&TrackedState>, snap: &SecuritySnapshot) -> TrackedState {
        let mut s = prev.cloned().unwrap_or_default();
        if let Some(d) = &snap.defender {
            s.rtp = Some(d.real_time_protection && d.antivirus_enabled);
            s.cloud = Some(d.cloud_protection);
            s.tamper = Some(d.tamper_protection);
            s.behavior = Some(d.behavior_monitoring);
            s.cfa = Some(d.controlled_folder_access);
            s.sig_version = Some(d.signature_version.clone());
            s.quick_scan_end = d.quick_scan_end.clone().or(s.quick_scan_end);
        }
        if let Some(f) = &snap.firewall {
            s.fw_domain = Some(f.domain);
            s.fw_private = Some(f.private);
            s.fw_public = Some(f.public);
        }
        if let Some(sys) = &snap.system {
            s.secure_boot = sys.secure_boot.or(s.secure_boot);
            s.bitlocker = Some(format!("{:?}", sys.bitlocker).to_lowercase());
            s.update_last_install = sys.update_last_install.clone().or(s.update_last_install);
            s.reboot_required = Some(sys.reboot_required);
        }
        if let Some(v) = &snap.vpn {
            s.vpn_connected = Some(v.connected);
            s.vpn_adapter = v.adapter.clone().or(s.vpn_adapter);
        }
        if let Some(n) = &snap.network {
            let active = n
                .profiles
                .iter()
                .find(|p| p.connected && !p.interface.to_lowercase().contains("nord"))
                .or(n.profiles.first());
            if let Some(p) = active {
                s.network_name = Some(p.name.clone());
                s.network_category = Some(p.category.clone());
            }
            let mut dns: Vec<String> = n.dns.iter().flat_map(|d| d.servers.clone()).collect();
            dns.sort();
            dns.dedup();
            s.dns = Some(dns);
        }
        s
    }
}

struct NewEvent {
    category: &'static str,
    kind: &'static str,
    severity: &'static str,
    message: String,
    detail: Option<String>,
}

/// Compares two tracked states and produces plain-language events. Pure —
/// unit-tested without a database.
fn diff(prev: &TrackedState, cur: &TrackedState) -> Vec<NewEvent> {
    let mut out = Vec::new();

    let mut toggle = |p: Option<bool>,
                      c: Option<bool>,
                      category: &'static str,
                      kind: &'static str,
                      on: (&str, &'static str),
                      off: (&str, &'static str)| {
        if let (Some(p), Some(c)) = (p, c) {
            if p != c {
                let (message, severity) = if c { on } else { off };
                out.push(NewEvent {
                    category,
                    kind,
                    severity,
                    message: message.to_string(),
                    detail: None,
                });
            }
        }
    };

    toggle(prev.rtp, cur.rtp, "defender", "rtp",
        ("Real-time protection turned on", "good"),
        ("Real-time protection turned OFF", "bad"));
    toggle(prev.cloud, cur.cloud, "defender", "cloud",
        ("Cloud protection turned on", "good"),
        ("Cloud protection turned off", "warn"));
    toggle(prev.tamper, cur.tamper, "defender", "tamper",
        ("Tamper protection turned on", "good"),
        ("Tamper protection turned off", "warn"));
    toggle(prev.behavior, cur.behavior, "defender", "behavior",
        ("Behavior monitoring turned on", "good"),
        ("Behavior monitoring turned off", "warn"));
    toggle(prev.cfa, cur.cfa, "ransomware", "cfa",
        ("Ransomware protection turned on", "good"),
        ("Ransomware protection turned off", "warn"));
    toggle(prev.fw_private, cur.fw_private, "firewall", "fw-private",
        ("Firewall turned on for Private networks", "good"),
        ("Firewall turned OFF for Private networks", "bad"));
    toggle(prev.fw_public, cur.fw_public, "firewall", "fw-public",
        ("Firewall turned on for Public networks", "good"),
        ("Firewall turned OFF for Public networks", "bad"));
    toggle(prev.fw_domain, cur.fw_domain, "firewall", "fw-domain",
        ("Firewall turned on for Domain networks", "good"),
        ("Firewall turned off for Domain networks", "warn"));
    toggle(prev.secure_boot, cur.secure_boot, "system", "secure-boot",
        ("Secure Boot enabled", "good"),
        ("Secure Boot disabled", "bad"));
    toggle(prev.reboot_required, cur.reboot_required, "system", "reboot",
        ("Restart needed to finish Windows updates", "warn"),
        ("Pending restart cleared", "info"));

    if let (Some(p), Some(c)) = (&prev.sig_version, &cur.sig_version) {
        if p != c {
            out.push(NewEvent {
                category: "defender", kind: "definitions", severity: "good",
                message: "Defender definitions updated".into(),
                detail: Some(format!("Version {c}")),
            });
        }
    }
    if let (Some(p), Some(c)) = (&prev.quick_scan_end, &cur.quick_scan_end) {
        if p != c {
            out.push(NewEvent {
                category: "defender", kind: "quick-scan", severity: "good",
                message: "Quick scan completed".into(),
                detail: None,
            });
        }
    }
    if let (Some(p), Some(c)) = (&prev.bitlocker, &cur.bitlocker) {
        if p != c {
            let severity = if c == "on" { "good" } else { "warn" };
            out.push(NewEvent {
                category: "system", kind: "bitlocker", severity,
                message: match c.as_str() {
                    "on" => "Drive encryption (BitLocker) turned on".into(),
                    "suspended" => "Drive encryption (BitLocker) suspended".into(),
                    other => format!("Drive encryption (BitLocker) is now {other}"),
                },
                detail: None,
            });
        }
    }
    if let (Some(p), Some(c)) = (&prev.update_last_install, &cur.update_last_install) {
        if p != c {
            out.push(NewEvent {
                category: "system", kind: "windows-update", severity: "good",
                message: "Windows update installed".into(),
                detail: None,
            });
        }
    }
    if let (Some(p), Some(c)) = (prev.vpn_connected, cur.vpn_connected) {
        if p != c {
            if c {
                out.push(NewEvent {
                    category: "vpn", kind: "vpn-connected", severity: "good",
                    message: "NordVPN connected".into(),
                    detail: cur.vpn_adapter.clone(),
                });
            } else {
                out.push(NewEvent {
                    category: "vpn", kind: "vpn-disconnected", severity: "info",
                    message: "NordVPN disconnected".into(),
                    detail: None,
                });
            }
        }
    }
    if let (Some(p), Some(c)) = (&prev.network_name, &cur.network_name) {
        if p != c {
            let category_label = cur.network_category.as_deref().unwrap_or("Unknown");
            let severity = if category_label == "Public" { "warn" } else { "info" };
            out.push(NewEvent {
                category: "network", kind: "network-changed", severity,
                message: "Connected to a different network".into(),
                detail: Some(format!("{c} ({category_label} network)")),
            });
        } else if let (Some(pc), Some(cc)) = (&prev.network_category, &cur.network_category) {
            if pc != cc {
                out.push(NewEvent {
                    category: "network", kind: "network-category", severity: "info",
                    message: format!("Network profile changed to {cc}"),
                    detail: Some(c.clone()),
                });
            }
        }
    }
    if let (Some(p), Some(c)) = (&prev.dns, &cur.dns) {
        if p != c {
            out.push(NewEvent {
                category: "network", kind: "dns-changed", severity: "info",
                message: "DNS servers changed".into(),
                detail: Some(c.join(", ")),
            });
        }
    }

    out
}

/// Records a snapshot: diffs against the stored state, inserts events, saves
/// the new state, prunes. Failures are logged, never fatal to the snapshot.
pub fn record(snap: &SecuritySnapshot) {
    if let Err(e) = record_inner(snap) {
        appdata::log(&format!("timeline record failed: {e}"));
    }
}

fn record_inner(snap: &SecuritySnapshot) -> Result<(), String> {
    let Some(db) = DB.get() else { return Ok(()) };
    let conn = db.lock().map_err(|_| "timeline lock poisoned".to_string())?;

    let prev: Option<TrackedState> = conn
        .query_row("SELECT value FROM state WHERE key = 'tracked'", [], |r| {
            r.get::<_, String>(0)
        })
        .ok()
        .and_then(|json| serde_json::from_str(&json).ok());

    let first_this_session = !SESSION_RECORDED.swap(true, Ordering::SeqCst);
    let cur = TrackedState::merge(prev.as_ref(), snap);

    let mut events = Vec::new();
    if first_this_session {
        events.push(NewEvent {
            category: "app",
            kind: "monitor-start",
            severity: "info",
            message: "Sentinel started monitoring".into(),
            detail: None,
        });
    }
    if let Some(p) = &prev {
        events.extend(diff(p, &cur));
    }

    // Changes seen on the first snapshot of a session happened while Sentinel
    // was closed — the timestamp is detection time, not occurrence time.
    let after_gap = first_this_session && prev.is_some();
    insert_events(&conn, &events, after_gap)?;

    let json = serde_json::to_string(&cur).map_err(|e| format!("serialize state: {e}"))?;
    conn.execute(
        "INSERT INTO state(key, value) VALUES('tracked', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![json],
    )
    .map_err(|e| format!("save state: {e}"))?;

    conn.execute(
        "DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT ?1)",
        params![MAX_EVENTS],
    )
    .map_err(|e| format!("prune events: {e}"))?;
    Ok(())
}

fn insert_events(conn: &Connection, events: &[NewEvent], after_gap: bool) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    for ev in events {
        // "monitor-start" describes this moment, never the gap.
        let gap = after_gap && ev.kind != "monitor-start";
        conn.execute(
            "INSERT INTO events(ts, category, kind, severity, message, detail, after_gap)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![now, ev.category, ev.kind, ev.severity, ev.message, ev.detail, gap as i64],
        )
        .map_err(|e| format!("insert event: {e}"))?;
    }
    Ok(())
}

/// Empties the timeline (used by "Reset application data"). Best-effort.
pub fn clear() {
    let Some(db) = DB.get() else { return };
    let Ok(conn) = db.lock() else { return };
    let _ = conn.execute("DELETE FROM events", []);
    let _ = conn.execute("DELETE FROM state", []);
    let _ = conn.execute("DELETE FROM speedtests", []);
}

/// Persists a completed, user-initiated speed test. Returns the row id.
pub fn save_speedtest(
    ts: &str,
    down_mbps: f64,
    up_mbps: f64,
    ping_ms: Option<f64>,
    jitter_ms: Option<f64>,
) -> Result<i64, String> {
    let Some(db) = DB.get() else { return Err("timeline unavailable".into()) };
    let conn = db.lock().map_err(|_| "timeline lock poisoned".to_string())?;
    conn.execute(
        "INSERT INTO speedtests(ts, down_mbps, up_mbps, ping_ms, jitter_ms)
         VALUES(?1, ?2, ?3, ?4, ?5)",
        params![ts, down_mbps, up_mbps, ping_ms, jitter_ms],
    )
    .map_err(|e| format!("save speed test: {e}"))?;
    Ok(conn.last_insert_rowid())
}

pub fn record_speedtest_event(down_mbps: f64, up_mbps: f64) {
    let Some(db) = DB.get() else { return };
    let Ok(conn) = db.lock() else { return };
    let events = vec![NewEvent {
        category: "network",
        kind: "speed-test",
        severity: "info",
        message: "Speed test completed".into(),
        detail: Some(format!("{:.0} Mbps down / {:.0} Mbps up", down_mbps, up_mbps)),
    }];
    let _ = insert_events(&conn, &events, false);
}

pub fn list_speedtests() -> Result<Vec<crate::models::SpeedTestRow>, String> {
    let Some(db) = DB.get() else { return Ok(Vec::new()) };
    let conn = db.lock().map_err(|_| "timeline lock poisoned".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, ts, down_mbps, up_mbps, ping_ms, jitter_ms
             FROM speedtests ORDER BY id DESC LIMIT 200",
        )
        .map_err(|e| format!("prepare speedtests: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(crate::models::SpeedTestRow {
                id: r.get(0)?,
                ts: r.get(1)?,
                down_mbps: r.get(2)?,
                up_mbps: r.get(3)?,
                ping_ms: r.get(4)?,
                jitter_ms: r.get(5)?,
            })
        })
        .map_err(|e| format!("query speedtests: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("read speedtests: {e}"))
}

pub fn list() -> Result<Vec<TimelineEvent>, String> {
    let Some(db) = DB.get() else { return Ok(Vec::new()) };
    let conn = db.lock().map_err(|_| "timeline lock poisoned".to_string())?;
    query_events(&conn, LIST_LIMIT)
}

fn query_events(conn: &Connection, limit: i64) -> Result<Vec<TimelineEvent>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, ts, category, kind, severity, message, detail, after_gap
             FROM events ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| format!("prepare query: {e}"))?;
    let rows = stmt
        .query_map(params![limit], |r| {
            Ok(TimelineEvent {
                id: r.get(0)?,
                ts: r.get(1)?,
                category: r.get(2)?,
                kind: r.get(3)?,
                severity: r.get(4)?,
                message: r.get(5)?,
                detail: r.get(6)?,
                after_gap: r.get::<_, i64>(7)? != 0,
            })
        })
        .map_err(|e| format!("query events: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("read events: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_state() -> TrackedState {
        TrackedState {
            rtp: Some(true),
            cloud: Some(true),
            tamper: Some(true),
            behavior: Some(true),
            cfa: Some(false),
            sig_version: Some("1.457.77.0".into()),
            quick_scan_end: Some("2026-08-09T03:37:55".into()),
            fw_domain: Some(true),
            fw_private: Some(true),
            fw_public: Some(true),
            secure_boot: Some(true),
            bitlocker: Some("on".into()),
            update_last_install: Some("2026-08-09T10:39:55".into()),
            reboot_required: Some(false),
            vpn_connected: Some(true),
            vpn_adapter: Some("NordLynx".into()),
            network_name: Some("Happy Plyler".into()),
            network_category: Some("Public".into()),
            dns: Some(vec!["103.86.96.100".into()]),
        }
    }

    #[test]
    fn identical_states_produce_no_events() {
        assert!(diff(&base_state(), &base_state()).is_empty());
    }

    #[test]
    fn rtp_off_is_a_bad_event() {
        let mut cur = base_state();
        cur.rtp = Some(false);
        let events = diff(&base_state(), &cur);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, "rtp");
        assert_eq!(events[0].severity, "bad");
    }

    #[test]
    fn definition_update_carries_the_new_version() {
        let mut cur = base_state();
        cur.sig_version = Some("1.458.0.0".into());
        let events = diff(&base_state(), &cur);
        assert_eq!(events[0].kind, "definitions");
        assert_eq!(events[0].detail.as_deref(), Some("Version 1.458.0.0"));
    }

    #[test]
    fn unknown_fields_never_fabricate_events() {
        let mut prev = base_state();
        prev.fw_private = None; // collector failed last time
        let mut cur = base_state();
        cur.fw_private = Some(true);
        assert!(diff(&prev, &cur).is_empty());
    }

    #[test]
    fn new_public_network_is_a_warning() {
        let mut cur = base_state();
        cur.network_name = Some("Airport WiFi".into());
        let events = diff(&base_state(), &cur);
        assert_eq!(events[0].kind, "network-changed");
        assert_eq!(events[0].severity, "warn");
    }

    #[test]
    fn db_roundtrip_insert_query_prune() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        let events = vec![NewEvent {
            category: "vpn",
            kind: "vpn-connected",
            severity: "good",
            message: "NordVPN connected".into(),
            detail: Some("NordLynx".into()),
        }];
        insert_events(&conn, &events, true).unwrap();
        let listed = query_events(&conn, 10).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].message, "NordVPN connected");
        assert!(listed[0].after_gap);
        // schema version was stamped to the current version
        let v: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(v, SCHEMA_VERSION);
    }

    #[test]
    fn speedtest_roundtrip() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO speedtests(ts, down_mbps, up_mbps, ping_ms, jitter_ms)
             VALUES('2026-08-10T00:00:00Z', 418.2, 41.5, 19.2, 2.4)",
            [],
        )
        .unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM speedtests", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn schema_migrates_v1_to_v2() {
        let conn = Connection::open_in_memory().unwrap();
        // Simulate a v1 database: events + state, user_version = 1, no speedtests.
        conn.execute_batch(
            "CREATE TABLE events(id INTEGER PRIMARY KEY, ts TEXT, category TEXT, kind TEXT,
                severity TEXT, message TEXT, detail TEXT, after_gap INTEGER);
             CREATE TABLE state(key TEXT PRIMARY KEY, value TEXT);
             PRAGMA user_version = 1;",
        )
        .unwrap();
        ensure_schema(&conn).unwrap();
        let v: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(v, 2);
        // speedtests table now exists and is usable
        conn.execute(
            "INSERT INTO speedtests(ts, down_mbps, up_mbps) VALUES('t', 1.0, 2.0)",
            [],
        )
        .unwrap();
    }
}
