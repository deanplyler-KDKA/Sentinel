# Sentinel — Privacy Statement

Sentinel is a local application. In plain terms:

- **Nothing leaves your PC.** Sentinel makes no network connections of its own — no
  telemetry, no analytics, no crash reporting services, no update checks, no accounts.
  The app's Content-Security-Policy and its lack of any HTTP capability enforce this at
  the platform level, not just as policy.
- **What Sentinel reads:** the status of Windows security features (Defender, Firewall,
  Secure Boot, BitLocker, Windows Update), network configuration (connection profiles,
  DNS servers, DoH state), and whether NordVPN is installed/running/connected. All of it
  stays in memory except what appears in the diagnostic log.
- **What Sentinel stores:** one small diagnostic log (startup events, collector errors,
  crashes) plus a data-version marker, in
  `%LOCALAPPDATA%\com.deanplyler.sentinel\`. The log can contain machine-local details
  like your computer name or network interface names — never passwords, file contents,
  or browsing data.
- **Diagnostics export** writes a copy of that log to your Downloads folder **only when
  you click the button**, so you can read exactly what it contains before sharing it
  with anyone.
- **Reset application data** (About page) deletes Sentinel's stored data. Uninstalling
  removes the program; delete the folder above if you want no trace left.

Sentinel never modifies Windows security settings, so there is no privacy-relevant
system state it could leave behind.
