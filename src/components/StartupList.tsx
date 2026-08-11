import { useEffect, useState } from 'react';
import { getStartupApps } from '../lib/api';
import type { StartupApp } from '../types/security';

/**
 * Read-only startup apps view. Sentinel never disables anything — the copy
 * points users at Windows' own Startup Apps settings.
 */
export function StartupList() {
  const [apps, setApps] = useState<StartupApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStartupApps()
      .then((a) => setApps(a.sort((x, y) => Number(y.enabled) - Number(x.enabled) || x.name.localeCompare(y.name))))
      .catch((e) => {
        setError(String(e));
        setApps([]);
      });
  }, []);

  return (
    <div className="card">
      <div className="card-titles">
        <h3>Startup apps</h3>
        <p className="card-subtitle">
          Apps that launch with Windows. Manage them in Settings → Apps → Startup.
        </p>
      </div>
      {apps === null && <p className="card-note">Checking…</p>}
      {error && <p className="card-note">Startup apps couldn’t be read: {error}</p>}
      {apps !== null && !error && (
        <table className="table">
          <thead>
            <tr>
              <th>App</th>
              <th>Publisher</th>
              <th>Status</th>
              <th>Startup impact</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={`${a.location}-${a.name}`}>
                <td>{a.name}</td>
                <td className="muted">{a.publisher ?? '—'}</td>
                <td className={a.enabled ? '' : 'faint'}>{a.enabled ? 'Enabled' : 'Disabled'}</td>
                <td className="faint">Unavailable</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="faint small">
        Windows doesn’t expose measured startup impact to apps like Sentinel, so it’s listed as
        Unavailable rather than estimated. Fewer enabled startup apps generally means a faster boot.
      </p>
    </div>
  );
}
