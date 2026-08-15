# Sentinel — Privacy Statement

Sentinel is a local application. In plain terms:

- **No telemetry, ever.** Sentinel has no account, no analytics, no crash-reporting
  service, no update check, and never uploads system information. Nothing about your
  computer is sent anywhere. There are exactly two outbound network paths, both
  measuring *your* connection, neither carrying personal data:

  1. **Connection-quality probe (automatic).** While the app is open, roughly every five
     minutes Sentinel opens brief TCP connections to two well-known public DNS resolvers
     (1.1.1.1 and 8.8.8.8 on port 443) and does one DNS lookup of `www.microsoft.com`, to
     measure latency, jitter and loss. These are hard-coded addresses; no data is sent
     beyond establishing the connection, and Cloudflare/Google see only that your IP
     connected — the same as loading any website. This is not telemetry: nothing about
     you or your PC is transmitted. You can watch it run in Settings → Collector
     diagnostics (`network/probe`).
  2. **Internet speed test (only when you click it).** Never runs automatically. You
     choose which measurement service to use, and the two differ in a way that matters:

     - **M-Lab (default).** An open measurement platform run for public-interest
       internet research, purpose-built for third-party speed tests, so it stays
       reliable. **M-Lab publishes every measurement as open research data, and that
       published data includes your IP address.** It does not include anything else
       about your PC. If you would rather not appear in a public dataset, choose
       Cloudflare. This is stated next to the selector in the app, not just here.
     - **Cloudflare.** Results are not published, but the service limits how often you
       can test, and that limit is shared by everyone using the same public IP — which
       a VPN exit address usually is. Reliable enough for occasional use.

     Either way the test transfers throwaway bytes (discarded data down, zeros up) and
     carries nothing about you or your files. Results are stored only on this PC.

  The WebView itself has no network capability at all — both paths run in the Rust
  backend, to fixed addresses that are never constructed from external input. The speed
  test validates TLS against a bundled root set (not the Windows certificate store), so
  it fails closed rather than trusting a locally-injected root — but it will not work
  behind a corporate TLS-inspection proxy.
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
