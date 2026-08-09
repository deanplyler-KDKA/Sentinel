//! Sentinel's own application data: diagnostic log, data-version marker,
//! reset and diagnostics export.
//!
//! SCOPE GUARD (docs/SECURITY.md): this is the ONLY module in Sentinel that
//! writes to disk, and it may only ever touch (a) Sentinel's own app-data
//! directory and (b) a diagnostics file placed in the user's Downloads folder
//! at the user's explicit request. It must never write anywhere else and must
//! never touch Windows settings, the registry, or other applications' data.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::Manager;

/// Bumped when the on-disk data layout changes; `migrate` runs the steps.
/// v1: logs/ directory + data-version marker only (no database yet — the
/// Phase 4 SQLite timeline will migrate via this same mechanism).
const DATA_VERSION: u32 = 1;
const MAX_LOG_BYTES: u64 = 1024 * 1024;

static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn init(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("no app data dir: {e}"))?;
    fs::create_dir_all(dir.join("logs")).map_err(|e| format!("create logs dir: {e}"))?;
    // Confinement guard: if the data dir or logs dir has been replaced with a
    // symlink/junction, refuse to operate — reset() must never follow a link
    // out of Sentinel's own folder. Failing init leaves DATA_DIR unset, so
    // every write path stays disabled.
    refuse_reparse_point(&dir)?;
    refuse_reparse_point(&dir.join("logs"))?;
    let _ = DATA_DIR.set(dir.clone());

    migrate(&dir);

    // Graceful crash handling: a panic anywhere gets recorded (with a
    // backtrace) before the process dies, so "it just closed" is always
    // diagnosable from the log. Chain the previous hook so stderr output
    // in dev builds is preserved.
    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log(&format!(
            "PANIC {info}\n{}",
            std::backtrace::Backtrace::force_capture()
        ));
        previous_hook(info);
    }));

    log(&format!(
        "Sentinel {} started (data-version {DATA_VERSION})",
        env!("CARGO_PKG_VERSION")
    ));
    Ok(())
}

pub fn data_dir() -> Option<&'static PathBuf> {
    DATA_DIR.get()
}

fn version_file(dir: &Path) -> PathBuf {
    dir.join("data-version")
}

fn log_path(dir: &Path) -> PathBuf {
    dir.join("logs").join("sentinel.log")
}

/// Errors if the path is a symlink or junction (any reparse point).
fn refuse_reparse_point(path: &Path) -> Result<(), String> {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    match fs::symlink_metadata(path) {
        Ok(m) if (m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0 => Err(format!(
            "{} is a symlink/junction; refusing to use it as app data",
            path.display()
        )),
        _ => Ok(()),
    }
}

/// Reads the stored data version and applies any migration steps up to
/// `DATA_VERSION`. With no database yet there are no steps — this exists so
/// the mechanism (and its downgrade warning) is in place before Phase 4.
fn migrate(dir: &Path) {
    let file = version_file(dir);
    let contents = match fs::read_to_string(&file) {
        // Missing marker = fresh install: stamp the current version.
        Err(_) => {
            let _ = fs::write(&file, DATA_VERSION.to_string());
            return;
        }
        Ok(s) => s,
    };
    match contents.trim().parse::<u32>() {
        // Present but unreadable is NOT a fresh install — a corrupt marker
        // must never make future migrations silently skip. Leave it alone.
        Err(_) => {
            log(&format!(
                "ERROR data-version marker is unreadable ({contents:?}); \
                 refusing to migrate or overwrite it"
            ));
        }
        Ok(v) if v < DATA_VERSION => {
            // Future migrations run here, sequentially: if v < 2 { ... } etc.
            let _ = fs::write(&file, DATA_VERSION.to_string());
            log(&format!("migrated data-version {v} -> {DATA_VERSION}"));
        }
        Ok(v) if v > DATA_VERSION => {
            log(&format!(
                "WARNING data-version {v} is newer than this build ({DATA_VERSION}) — \
                 a newer Sentinel ran here; data is left untouched"
            ));
        }
        Ok(_) => {}
    }
}

/// Appends a timestamped line to the diagnostic log. Safe to call from any
/// thread and before init (no-op until the data dir is known). Never panics.
pub fn log(message: &str) {
    let Some(dir) = DATA_DIR.get() else { return };
    let path = log_path(dir);
    // Simple rotation: keep one previous generation.
    if fs::metadata(&path).map(|m| m.len() > MAX_LOG_BYTES).unwrap_or(false) {
        let _ = fs::rename(&path, dir.join("logs").join("sentinel.old.log"));
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{} {}", chrono::Utc::now().to_rfc3339(), message);
    }
}

/// Writes a diagnostics bundle to the user's Downloads folder and returns its
/// path. Contains only Sentinel's own log and version info — no personal data
/// beyond what the log records (collector error text, timestamps).
pub fn export_diagnostics(app: &tauri::AppHandle) -> Result<String, String> {
    let dir = DATA_DIR.get().ok_or("app data not initialized")?;
    let downloads = app
        .path()
        .download_dir()
        .map_err(|e| format!("no Downloads folder: {e}"))?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let out = downloads.join(format!("sentinel-diagnostics-{stamp}.log"));

    let mut report = String::new();
    report.push_str(&format!(
        "Sentinel diagnostics\nversion: {}\ndata-version: {}\ngenerated: {}\ndata dir: {}\n\n--- log ---\n",
        env!("CARGO_PKG_VERSION"),
        fs::read_to_string(version_file(dir)).unwrap_or_else(|_| "?".into()).trim(),
        chrono::Utc::now().to_rfc3339(),
        dir.display(),
    ));
    for name in ["sentinel.old.log", "sentinel.log"] {
        if let Ok(text) = fs::read_to_string(dir.join("logs").join(name)) {
            report.push_str(&text);
        }
    }
    // create_new: never overwrite or follow a pre-existing file/hardlink at
    // the destination — a second export in the same second just errors.
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&out)
        .map_err(|e| format!("create diagnostics file: {e}"))?;
    file.write_all(report.as_bytes())
        .map_err(|e| format!("write diagnostics: {e}"))?;
    log("diagnostics exported");
    Ok(out.display().to_string())
}

/// Deletes Sentinel's own stored data (logs + data-version marker) and
/// recreates a fresh layout. Does not touch the WebView cache while running —
/// that is removed by uninstalling or deleting the app-data folder manually.
pub fn reset(app: &tauri::AppHandle) -> Result<String, String> {
    let _ = app; // reserved for future per-window cache clearing
    let dir = DATA_DIR.get().ok_or("app data not initialized")?;
    let logs = dir.join("logs");
    fs::remove_dir_all(&logs).map_err(|e| format!("remove logs: {e}"))?;
    let _ = fs::remove_file(version_file(dir));
    fs::create_dir_all(&logs).map_err(|e| format!("recreate logs: {e}"))?;
    let _ = fs::write(version_file(dir), DATA_VERSION.to_string());
    log("application data was reset");
    Ok(dir.display().to_string())
}
