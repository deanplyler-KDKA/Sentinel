//! Platform abstraction.
//!
//! Everything above this line in the app — scoring, suggestions, the timeline,
//! the report, the whole UI — is platform-neutral. Everything below it is the
//! OS-specific work of actually reading the machine.
//!
//! Each platform module exposes the same function names returning the same
//! types from `crate::models`, so `commands.rs` never learns which OS it is
//! running on. A capability a platform cannot provide returns
//! `Err(UNSUPPORTED)` or an empty value, and the UI renders it as
//! "Unavailable" — the honest answer, and the one the not-applicable scoring
//! added in 0.4.0 already handles without punishing the machine for it.

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

/// Returned by collectors a platform genuinely cannot implement. Phrased for
/// the diagnostics view, which shows collector errors verbatim. Unused on
/// Windows, where every collector is implemented — which is the point of it.
#[allow(dead_code)]
pub const UNSUPPORTED: &str = "not supported on this platform";
