# Sentinel — Privacy Statement

Sentinel is a local application. In plain terms:

- **Nothing leaves your PC**, with one explicit, user-initiated exception. Sentinel makes
  no network connections of its own — no telemetry, no analytics, no crash reporting
  services, no update checks, no accounts. The single exception is the **internet speed
  test**: when *you* click "Run speed test", Sentinel downloads throwaway data from and
  uploads meaningless zero-bytes to Cloudflare's public speed service
  (speed.cloudflare.com). No personal data is sent, nothing identifies you beyond an
  ordinary HTTPS request, results are stored only on this PC, and it never runs
  automatically. The WebView still has no network capability at all — the test runs in
  the Rust backend.
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
