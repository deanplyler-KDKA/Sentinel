//! User preferences, persisted as JSON in Sentinel's own data folder.
//!
//! Everything here is opt-in and off by default: Sentinel does not start with
//! the computer, does not keep running in the background, and does not send
//! notifications unless the person turns those on. That default matters for a
//! tool that lives on a family member's machine — it should never be something
//! that quietly installed itself into their startup.

use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Keep monitoring after the window is closed (app stays in the tray).
    pub background_monitoring: bool,
    /// Launch Sentinel when the user signs in.
    pub start_with_system: bool,
    /// Show desktop notifications for meaningful changes.
    pub notifications: bool,
    /// Suppress notifications overnight and deliver them afterwards.
    pub quiet_hours: bool,
    pub quiet_start_hour: u8,
    pub quiet_end_hour: u8,
    /// How often background checks run, in minutes.
    pub check_interval_mins: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            background_monitoring: false,
            start_with_system: false,
            notifications: false,
            quiet_hours: true,
            quiet_start_hour: 22,
            quiet_end_hour: 7,
            check_interval_mins: 15,
        }
    }
}

impl Settings {
    /// Clamp anything that arrives from the frontend. The struct is typed, but
    /// a nonsense interval would still be a real problem (a 0-minute loop is a
    /// busy-wait; a 24-hour one makes the feature pointless).
    fn sanitized(mut self) -> Self {
        self.check_interval_mins = self.check_interval_mins.clamp(5, 240);
        self.quiet_start_hour = self.quiet_start_hour.min(23);
        self.quiet_end_hour = self.quiet_end_hour.min(23);
        self
    }

    /// True if `now` falls inside the configured quiet window, handling the
    /// usual case where it wraps past midnight (22:00 → 07:00).
    pub fn in_quiet_hours(&self, hour: u8) -> bool {
        if !self.quiet_hours || self.quiet_start_hour == self.quiet_end_hour {
            return false;
        }
        if self.quiet_start_hour < self.quiet_end_hour {
            hour >= self.quiet_start_hour && hour < self.quiet_end_hour
        } else {
            hour >= self.quiet_start_hour || hour < self.quiet_end_hour
        }
    }
}

static CACHE: OnceLock<Mutex<Settings>> = OnceLock::new();
static PATH: OnceLock<PathBuf> = OnceLock::new();

fn cache() -> &'static Mutex<Settings> {
    CACHE.get_or_init(|| Mutex::new(Settings::default()))
}

pub fn init(dir: &std::path::Path) {
    let path = dir.join("settings.json");
    let loaded = fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
        .unwrap_or_default()
        .sanitized();
    let _ = PATH.set(path);
    if let Ok(mut c) = cache().lock() {
        *c = loaded;
    }
}

pub fn get() -> Settings {
    cache().lock().map(|c| c.clone()).unwrap_or_default()
}

pub fn save(next: Settings) -> Result<Settings, String> {
    let next = next.sanitized();
    let path = PATH.get().ok_or("settings not initialized")?;
    let json = serde_json::to_string_pretty(&next).map_err(|e| format!("serialize: {e}"))?;
    fs::write(path, json).map_err(|e| format!("write settings: {e}"))?;
    if let Ok(mut c) = cache().lock() {
        *c = next.clone();
    }
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_opt_in() {
        let s = Settings::default();
        assert!(!s.background_monitoring, "must not run in background by default");
        assert!(!s.start_with_system, "must not add itself to startup by default");
        assert!(!s.notifications, "must not notify by default");
    }

    #[test]
    fn interval_is_clamped_to_something_sane() {
        let mut s = Settings { check_interval_mins: 0, ..Default::default() };
        assert_eq!(s.clone().sanitized().check_interval_mins, 5);
        s.check_interval_mins = 10_000;
        assert_eq!(s.sanitized().check_interval_mins, 240);
    }

    #[test]
    fn quiet_hours_wrap_past_midnight() {
        let s = Settings { quiet_hours: true, quiet_start_hour: 22, quiet_end_hour: 7,
            ..Default::default() };
        assert!(s.in_quiet_hours(23), "23:00 is quiet");
        assert!(s.in_quiet_hours(2), "02:00 is quiet");
        assert!(s.in_quiet_hours(6), "06:00 is quiet");
        assert!(!s.in_quiet_hours(7), "07:00 is the end, not quiet");
        assert!(!s.in_quiet_hours(12), "midday is not quiet");
    }

    #[test]
    fn quiet_hours_within_one_day_do_not_wrap() {
        let s = Settings { quiet_hours: true, quiet_start_hour: 1, quiet_end_hour: 6,
            ..Default::default() };
        assert!(s.in_quiet_hours(3));
        assert!(!s.in_quiet_hours(23));
    }

    #[test]
    fn disabled_quiet_hours_never_suppress() {
        let s = Settings { quiet_hours: false, ..Default::default() };
        assert!(!s.in_quiet_hours(3));
    }
}
