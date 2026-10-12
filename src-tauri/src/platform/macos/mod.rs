//! macOS collectors.
//!
//! Scaffolding only: every function has the right signature and returns
//! `UNSUPPORTED` so the macOS target compiles and runs with everything shown
//! as "Unavailable" rather than wrong. Filling these in is the port, and
//! docs/MACOS.md maps each one to the command that provides it
//! (fdesetup, socketfilterfw, spctl, csrutil, softwareupdate, system_profiler,
//! networksetup, scutil, launchctl).
//!
//! Deliberately NOT faked: a stub that returned "firewall on" would be worse
//! than useless on a security tool. Unknown stays unknown until it is real.

use crate::models::{
    FirewallStatus, HardwareInfo, NetworkDetail, NetworkStatus, SecuritySnapshot, SettingsTarget,
    StartupApp, SystemStatus, VpnStatus,
};
use crate::platform::UNSUPPORTED;

pub mod defender {
    use super::*;
    use crate::models::DefenderStatus;

    /// macOS has no user-facing antivirus toggle equivalent to Defender.
    /// The port should report XProtect/MRT versions instead, and the checks
    /// that have no counterpart become not-applicable rather than failures.
    pub fn collect() -> Result<DefenderStatus, String> {
        Err(UNSUPPORTED.to_string())
    }
}

pub mod firewall {
    use super::*;
    /// socketfilterfw --getglobalstate (one global state, not three profiles).
    pub fn collect() -> Result<FirewallStatus, String> {
        Err(UNSUPPORTED.to_string())
    }
}

pub mod system {
    use super::*;
    /// FileVault via fdesetup, SIP via csrutil, Gatekeeper via spctl,
    /// updates via softwareupdate.
    pub fn collect() -> Result<SystemStatus, String> {
        Err(UNSUPPORTED.to_string())
    }
}

pub mod network {
    use super::*;
    /// scutil --dns and networksetup.
    pub fn collect() -> Result<NetworkStatus, String> {
        Err(UNSUPPORTED.to_string())
    }
}

pub mod nord {
    use super::*;
    /// Nord's macOS app plus scutil --nwi for the tunnel interface.
    pub fn collect() -> Result<VpnStatus, String> {
        Err(UNSUPPORTED.to_string())
    }
}

pub mod hardware {
    use super::*;
    /// system_profiler -json SPHardwareDataType SPPowerDataType
    /// SPStorageDataType. macOS does report battery cycle count and
    /// condition, which most PC firmware does not.
    pub fn collect() -> Result<HardwareInfo, String> {
        Err(UNSUPPORTED.to_string())
    }
}

pub mod netinfo {
    use super::*;
    /// networksetup / ifconfig.
    pub fn collect() -> Result<NetworkDetail, String> {
        Err(UNSUPPORTED.to_string())
    }
}

pub mod startup {
    use super::*;
    /// launchctl list plus ~/Library/LaunchAgents.
    pub fn collect() -> Result<Vec<StartupApp>, String> {
        Err(UNSUPPORTED.to_string())
    }
}

pub mod actions {
    use super::*;
    /// x-apple.systempreferences: URLs, opened with `open`. Same closed-enum
    /// contract as Windows: the WebView picks from a fixed menu.
    pub fn open(_target: SettingsTarget) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }
}

/// Keeps the import list honest while the module is still scaffolding.
#[allow(dead_code)]
fn _contract_types(_s: Option<SecuritySnapshot>) {}
