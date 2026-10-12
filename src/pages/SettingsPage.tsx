import { useEffect, useState } from 'react';
import {
  exportDiagnostics, exportReport, getAppInfo, getDiagnostics, getSettings, resetAppData,
  setSettings, type AppInfo,
} from '../lib/api';
import { relativeTime } from '../lib/format';
import { buildReport } from '../lib/report';
import { useStore } from '../lib/store';
import { applyTheme, getTheme, type Theme } from '../lib/theme';
import type { AppSettings, CollectorStatus } from '../types/security';

export function SettingsPage() {
  const {
    snapshot, security, pcHealth, netHealth, overall, perf, hardware, probe,
    speedHistory, suggestions,
  } = useStore();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [diag, setDiag] = useState<CollectorStatus[]>([]);
  const [cfg, setCfg] = useState<AppSettings | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);

  useEffect(() => {
    getAppInfo().then(setInfo).catch(() => {});
    getDiagnostics().then(setDiag).catch(() => {});
    getSettings().then(setCfg).catch(() => {});
  }, []);

  /** Optimistic, then corrected to whatever the backend clamped it to. */
  async function updateCfg(patch: Partial<AppSettings>) {
    if (!cfg) return;
    const next = { ...cfg, ...patch };
    setCfg(next);
    setCfgError(null);
    try {
      setCfg(await setSettings(next));
    } catch (e) {
      setCfg(cfg); // roll back so a toggle never misreports what is in force
      setCfgError(String(e));
    }
  }

  function onTheme(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  async function onExport() {
    setStatus('Exporting…');
    try {
      setStatus(`Diagnostics saved to: ${await exportDiagnostics()}`);
    } catch (e) {
      setStatus(`Export failed: ${e}`);
    }
  }

  async function onSaveReport() {
    setStatus('Building report…');
    try {
      const text = buildReport({
        appVersion: info?.version ?? 'unknown',
        snapshot, security, pcHealth, netHealth, overall,
        perf, hardware, probe, speedHistory, suggestions,
      });
      setStatus(`Health report saved to: ${await exportReport(text)}`);
    } catch (e) {
      setStatus(`Couldn’t save the report: ${e}`);
    }
  }

  async function onReset() {
    const sure = window.confirm(
      'Reset Sentinel’s application data?\n\nThis clears Sentinel’s own logs, history and settings. ' +
        'It does NOT touch Windows security settings, Defender, your firewall, BitLocker, or NordVPN.',
    );
    if (!sure) return;
    try {
      await resetAppData();
      window.localStorage.clear();
      window.location.reload();
    } catch (e) {
      setStatus(`Reset failed: ${e}`);
    }
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h2>Settings</h2>
          <p>Sentinel {info?.version ?? '…'}</p>
        </div>
      </header>

      <div className="grid-2">
        <div className="card">
          <div className="settings-section">
            <h3>Monitoring</h3>
            <p>
              Sentinel normally only runs while it is open. Turn these on and it keeps watching
              in the background and tells you when something changes. All off by default.
            </p>
          </div>

          {cfgError && <div className="error-banner">{cfgError}</div>}

          {cfg && (
            <div className="stack" style={{ marginBottom: "var(--sp-4)" }}>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={cfg.backgroundMonitoring}
                  onChange={(e) => updateCfg({ backgroundMonitoring: e.target.checked })}
                />
                <span>
                  <strong>Keep watching in the background</strong>
                  <em>Closing the window leaves Sentinel in the tray instead of quitting.</em>
                </span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={cfg.notifications}
                  onChange={(e) => updateCfg({ notifications: e.target.checked })}
                />
                <span>
                  <strong>Notify me when something changes</strong>
                  <em>Only genuine problems — protection switched off, a drive filling up or reporting a fault. Never good news, and never the same thing twice in a day.</em>
                </span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={cfg.startWithSystem}
                  onChange={(e) => updateCfg({ startWithSystem: e.target.checked })}
                />
                <span>
                  <strong>Start when I sign in</strong>
                  <em>Adds Sentinel to your startup apps. Turning this off removes it again.</em>
                </span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={cfg.quietHours}
                  onChange={(e) => updateCfg({ quietHours: e.target.checked })}
                />
                <span>
                  <strong>Quiet hours</strong>
                  <em>Hold notifications overnight and deliver them in the morning.</em>
                </span>
              </label>

              {cfg.quietHours && (
                <div className="row" style={{ paddingLeft: 28 }}>
                  <span className="small faint">From</span>
                  <select className="select" value={cfg.quietStartHour}
                    onChange={(e) => updateCfg({ quietStartHour: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, 0 + "0").slice(-2)}:00</option>
                    ))}
                  </select>
                  <span className="small faint">until</span>
                  <select className="select" value={cfg.quietEndHour}
                    onChange={(e) => updateCfg({ quietEndHour: Number(e.target.value) })}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, 0 + "0").slice(-2)}:00</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="row" style={{ paddingLeft: 28 }}>
                <span className="small faint">Check every</span>
                <select className="select" value={cfg.checkIntervalMins}
                  onChange={(e) => updateCfg({ checkIntervalMins: Number(e.target.value) })}>
                  {[5, 15, 30, 60, 120, 240].map((m) => (
                    <option key={m} value={m}>{m < 60 ? m + " minutes" : (m / 60) + " hour" + (m > 60 ? "s" : "")}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="settings-section">
            <h3>Appearance</h3>
            <select className="select" value={theme} onChange={(e) => onTheme(e.target.value as Theme)}>
              <option value="system">Match Windows</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          <div className="settings-section">
            <h3>Startup & background</h3>
            <p>
              Sentinel runs only when you open it — no services, no autostart, nothing left running
              after you close the window. Start-with-Windows and background monitoring are planned
              as opt-in options in a coming release.
            </p>
          </div>

          <div className="settings-section">
            <h3>Privacy</h3>
            <p>
              Everything stays on this PC: no account, no telemetry, no data sold, no tracking, no
              upload of system information. The only network activity Sentinel ever initiates is the
              speed test — started by you, sending throwaway data to Cloudflare’s public speed
              service. Details in the project’s PRIVACY document.
            </p>
          </div>

          <div className="settings-section">
            <h3>Your data</h3>
            <p className="about-path">Data folder: {info?.dataDir ?? '…'}</p>
            <p className="about-path">Log file: {info?.logPath ?? '…'}</p>
            <p>
              History keeps the most recent 5,000 events, entirely local. Uninstalling removes the
              program but leaves this folder; use Reset below (or delete the folder) for a clean slate.
            </p>
          </div>

          <div className="settings-section">
            <h3>Getting help</h3>
            <p>
              Save a report of everything Sentinel found — your scores, every check, drive health
              and the full fix list — as a text file you can send to whoever helps you with this
              computer. It contains no passwords, file contents, IP addresses or network names.
            </p>
          </div>

          <div className="row">
            <button className="btn btn-primary" onClick={onSaveReport}>
              Save health report
            </button>
            <button className="btn" onClick={onExport}>Export diagnostics</button>
            <button className="btn btn-danger" onClick={onReset}>Reset application data</button>
          </div>
          {status && <p className="about-status" style={{ marginTop: 'var(--sp-2)' }}>{status}</p>}
        </div>

        <div className="card">
          <div className="card-titles">
            <h3>Collector diagnostics</h3>
            <p className="card-subtitle">
              What Sentinel is actually able to read. Failures show here, never as fake healthy data.
            </p>
          </div>
          {diag.length === 0 ? (
            <p className="card-note">No collector activity recorded yet this session.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Collector</th>
                  <th>Last success</th>
                  <th className="num">Duration</th>
                  <th className="num">Failures</th>
                </tr>
              </thead>
              <tbody>
                {diag.map((d) => (
                  <tr key={d.name}>
                    <td>{d.name}</td>
                    <td className={d.lastError && (!d.lastSuccess || d.lastErrorAt! > d.lastSuccess) ? 'tone-warn' : 'muted'}>
                      {d.lastSuccess ? relativeTime(d.lastSuccess) : d.lastError ? `failing: ${d.lastError.slice(0, 40)}` : '—'}
                    </td>
                    <td className="num mono">{d.lastDurationMs !== null ? `${d.lastDurationMs} ms` : '—'}</td>
                    <td className={`num mono${d.failures > 0 ? ' tone-warn' : ''}`}>{d.failures}/{d.runs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
