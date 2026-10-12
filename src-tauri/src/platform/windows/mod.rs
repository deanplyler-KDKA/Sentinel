//! Windows collectors. These read state through fixed PowerShell scripts,
//! CIM/WMI, the registry and Shell COM — see the invariants in powershell.rs.

pub mod actions;
pub mod defender;
pub mod firewall;
pub mod hardware;
pub mod netinfo;
pub mod network;
pub mod nord;
pub mod powershell;
pub mod startup;
pub mod system;
