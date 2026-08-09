import { useEffect, useState } from 'react';
import { exportDiagnostics, getAppInfo, resetAppData, type AppInfo } from '../lib/api';
import { SentinelMark } from './Icons';

interface Props {
  onClose: () => void;
}

export function AboutPanel({ onClose }: Props) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getAppInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

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
      'Reset Sentinel’s application data?\n\nThis clears Sentinel’s own logs and settings. ' +
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
    <div className="about-overlay" onClick={onClose}>
      <div className="about-panel" onClick={(e) => e.stopPropagation()}>
        <header className="about-header">
          <div className="brand-mark">
            <SentinelMark size={24} />
          </div>
          <div>
            <h2>Sentinel</h2>
            <p className="about-version">Version {info?.version ?? '…'}</p>
          </div>
          <button className="about-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <section>
          <h3>What Sentinel is</h3>
          <p>
            A read-only dashboard for the protections Windows already provides. Microsoft
            Defender, Windows Firewall, BitLocker and your VPN do the protecting — Sentinel
            watches them and never changes a setting.
          </p>
        </section>

        <section>
          <h3>Privacy</h3>
          <p>
            Everything stays on this PC. Sentinel makes no network connections, has no
            account, no telemetry, and sends nothing anywhere. The only thing it stores is
            its own small diagnostic log.
          </p>
        </section>

        <section>
          <h3>Your data</h3>
          <p className="about-path">Data folder: {info?.dataDir ?? '…'}</p>
          <p className="about-path">Log file: {info?.logPath ?? '…'}</p>
          <p>
            Uninstalling removes the program but leaves this folder behind; delete it (or use
            Reset below) if you want nothing left. Windows security settings are never touched
            either way.
          </p>
        </section>

        <section>
          <h3>Startup</h3>
          <p>
            Sentinel runs only when you open it. It installs no services, adds nothing to
            Windows startup, and nothing keeps running after you close the window.
          </p>
        </section>

        <div className="about-actions">
          <button className="refresh-btn" onClick={onExport}>
            Export diagnostics
          </button>
          <button className="refresh-btn about-danger" onClick={onReset}>
            Reset application data
          </button>
        </div>
        {status && <p className="about-status">{status}</p>}
      </div>
    </div>
  );
}
