import { useEffect, useState } from 'react';
import {
  exportDiagnostics, getAppInfo, getDiagnostics, resetAppData, type AppInfo,
} from '../lib/api';
import { relativeTime } from '../lib/format';
import { applyTheme, getTheme, type Theme } from '../lib/theme';
import type { CollectorStatus } from '../types/security';

export function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [diag, setDiag] = useState<CollectorStatus[]>([]);

  useEffect(() => {
    getAppInfo().then(setInfo).catch(() => {});
    getDiagnostics().then(setDiag).catch(() => {});
  }, []);

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

          <div className="row">
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
