import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { getNetworkDetail, runSpeedTest } from '../lib/api';
import { DetailRow } from '../components/DetailRow';
import { assessDns } from '../lib/score';
import { formatBps, relativeTime } from '../lib/format';
import type { NetworkDetail, SpeedTestRow } from '../types/security';

function avg(rows: SpeedTestRow[], days: number): number | null {
  const cutoff = Date.now() - days * 86_400_000;
  const inWindow = rows.filter((r) => Date.parse(r.ts) >= cutoff);
  if (inWindow.length === 0) return null;
  return inWindow.reduce((s, r) => s + r.downMbps, 0) / inWindow.length;
}

export function NetworkPage() {
  const { snapshot, probe, probeRunning, refreshProbe, speedHistory, refreshSpeedHistory, series } = useStore();
  const [detail, setDetail] = useState<NetworkDetail | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    getNetworkDetail().then(setDetail).catch(() => setDetail(null));
  }, []);

  async function onSpeedTest() {
    setTesting(true);
    setTestError(null);
    try {
      await runSpeedTest();
      refreshSpeedHistory();
    } catch (e) {
      setTestError(String(e));
    } finally {
      setTesting(false);
    }
  }

  const last = series[series.length - 1] ?? null;
  const dns = snapshot ? assessDns(snapshot) : null;
  const latest = speedHistory[0] ?? null;
  const previous = speedHistory[1] ?? null;
  const avg7 = avg(speedHistory.slice(latest ? 1 : 0), 7);
  const avg30 = avg(speedHistory.slice(latest ? 1 : 0), 30);
  const best = speedHistory.length ? Math.max(...speedHistory.map((r) => r.downMbps)) : null;

  let comparison: { text: string; tone: 'good' | 'warn' | 'muted' } | null = null;
  if (latest && avg30 !== null && avg30 > 0) {
    const ratio = latest.downMbps / avg30;
    if (ratio < 0.6) {
      comparison = {
        tone: 'warn',
        text: `Your current download speed is ${Math.round(latest.downMbps)} Mbps. Your 30-day average is ${Math.round(avg30)} Mbps — this result is significantly slower than usual.`,
      };
    } else if (ratio > 1.2) {
      comparison = { tone: 'good', text: `Faster than your 30-day average of ${Math.round(avg30)} Mbps.` };
    } else {
      comparison = { tone: 'muted', text: `In line with your 30-day average of ${Math.round(avg30)} Mbps.` };
    }
  }

  const wifiAdapter = detail?.adapters.find((a) => a.wifi);
  const activeProfile = snapshot?.network?.profiles.find(
    (p) => p.connected && !/nordlynx|nordvpn/i.test(p.interface),
  );

  return (
    <div>
      <header className="page-head">
        <div>
          <h2>Network</h2>
          <p>{activeProfile ? `${activeProfile.name} · ${activeProfile.category} network` : 'Checking connection…'}</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={refreshProbe} disabled={probeRunning}>
            {probeRunning ? 'Probing…' : 'Check connection quality'}
          </button>
          <button className="btn btn-primary" onClick={onSpeedTest} disabled={testing}>
            {testing ? 'Testing…' : 'Run speed test'}
          </button>
        </div>
      </header>

      {/* Backend messages are self-describing (rate limit, cooldown, network
          error), so no "failed:" prefix — a cooldown isn't a failure. */}
      {testError && <div className="error-banner">{testError}</div>}

      <div className="grid-3">
        <div className="card">
          <div className="card-titles"><h3>Connection</h3></div>
          {detail?.adapters.filter((a) => !/nordlynx|tap/i.test(a.name)).map((a) => (
            <DetailRow
              key={a.name}
              label={a.wifi ? `Wi-Fi (${a.name})` : a.name}
              value={`Link ${a.linkSpeed}`}
            />
          )) ?? <p className="card-note">Checking adapters…</p>}
          {wifiAdapter && activeProfile && (
            <DetailRow label="Wi-Fi network" value={activeProfile.name} />
          )}
          {detail?.configs.map((c) => (
            <div key={c.interface}>
              <DetailRow label={`${c.interface} address`} value={c.ipv4 ?? 'Unavailable'} />
              <DetailRow label="Gateway" value={c.gateway} />
              <DetailRow label="IPv6" value={c.ipv6 ? 'Active' : 'Not in use'} />
            </div>
          ))}
          <p className="card-note">
            Link speed is between this PC and your router — it is not your internet speed.
          </p>
        </div>

        <div className="card">
          <div className="card-titles"><h3>Connection quality</h3></div>
          {probe ? (
            <>
              <DetailRow
                label="Latency"
                value={probe.latencyMs !== null ? `${Math.round(probe.latencyMs)} ms` : 'Unreachable'}
                tone={probe.latencyMs !== null && probe.latencyMs < 80 ? 'good' : 'warn'}
              />
              <DetailRow
                label="Jitter"
                value={probe.jitterMs !== null ? `${probe.jitterMs.toFixed(1)} ms` : 'Unavailable'}
              />
              <DetailRow
                label="Probe delivery"
                value={probe.lossPct === 0 ? 'No loss detected' : `${probe.lossPct}% failed`}
                tone={probe.lossPct < 5 ? 'good' : 'bad'}
              />
              <DetailRow
                label="DNS response"
                value={probe.dnsMs !== null ? `${Math.round(probe.dnsMs)} ms` : 'Unavailable'}
                tone={probe.dnsMs !== null && probe.dnsMs < 200 ? 'good' : 'warn'}
              />
              <p className="card-note">Measured against {probe.target} over TCP — a close proxy for ping without needing administrator rights.</p>
            </>
          ) : (
            <p className="card-note">Run a quality check to measure latency, jitter and loss.</p>
          )}
          {last && (
            <DetailRow label="Current throughput" value={`↓ ${formatBps(last.rxBps)} · ↑ ${formatBps(last.txBps)}`} />
          )}
        </div>

        <div className="card">
          <div className="card-titles"><h3>DNS & VPN</h3></div>
          {dns && (
            <DetailRow
              label="DNS"
              value={
                dns.mode === 'vpn' ? `${dns.provider ?? 'VPN'} (through VPN tunnel)`
                  : dns.mode === 'doh' ? `${dns.provider ?? 'Encrypted'} (DNS over HTTPS)`
                    : dns.mode === 'plain' ? `${dns.provider ?? 'Router default'} (unencrypted)`
                      : 'Can’t assess'
              }
              tone={dns.mode === 'vpn' || dns.mode === 'doh' ? 'good' : 'muted'}
            />
          )}
          {dns && dns.servers.length > 0 && (
            <DetailRow label="Servers" value={dns.servers.join(', ')} />
          )}
          <DetailRow
            label="VPN"
            value={snapshot?.vpn ? (snapshot.vpn.connected ? `Connected (${snapshot.vpn.adapter ?? 'tunnel'})` : snapshot.vpn.installed ? 'Not connected' : 'Not installed') : '…'}
            tone={snapshot?.vpn?.connected ? 'good' : 'muted'}
          />
        </div>
      </div>

      <div className="section-title">Internet speed</div>
      <div className="grid-2">
        <div className="card">
          <div className="card-titles"><h3>Latest result</h3></div>
          {latest ? (
            <>
              <div className="row" style={{ gap: 'var(--sp-6)' }}>
                <div>
                  <div className="faint small">Download</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }} className="mono">{latest.downMbps.toFixed(0)} <span className="small faint">Mbps</span></div>
                </div>
                <div>
                  <div className="faint small">Upload</div>
                  {/* null = the upload leg didn't complete (e.g. a slow uplink
                      hit the timeout) — report unmeasured, never a fake zero. */}
                  <div style={{ fontSize: 28, fontWeight: 700 }} className="mono">
                    {latest.upMbps !== null ? latest.upMbps.toFixed(0) : '–'} <span className="small faint">Mbps</span>
                  </div>
                </div>
                <div>
                  <div className="faint small">Ping</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }} className="mono">{latest.pingMs !== null ? latest.pingMs.toFixed(0) : '–'} <span className="small faint">ms</span></div>
                </div>
              </div>
              <p className="card-note">Tested {relativeTime(latest.ts)}{latest.jitterMs !== null ? ` · jitter ${latest.jitterMs.toFixed(1)} ms` : ''}</p>
              {comparison && <p className={`small tone-${comparison.tone}`}>{comparison.text}</p>}
            </>
          ) : (
            <p className="card-note">
              No speed tests yet. Tests are always started by you — Sentinel never runs them automatically.
              The test downloads and uploads throwaway data via Cloudflare’s public speed service.
            </p>
          )}
        </div>
        <div className="card">
          <div className="card-titles"><h3>Your baseline</h3></div>
          <DetailRow label="Last test" value={previous ? `${previous.downMbps.toFixed(0)} Mbps down` : '—'} />
          <DetailRow label="7-day average" value={avg7 !== null ? `${avg7.toFixed(0)} Mbps down` : 'Not enough data'} />
          <DetailRow label="30-day average" value={avg30 !== null ? `${avg30.toFixed(0)} Mbps down` : 'Not enough data'} />
          <DetailRow label="Best recent" value={best !== null ? `${best.toFixed(0)} Mbps down` : '—'} />
          {speedHistory.length > 1 && (
            <table className="table">
              <thead>
                <tr><th>When</th><th className="num">Down</th><th className="num">Up</th><th className="num">Ping</th></tr>
              </thead>
              <tbody>
                {speedHistory.slice(0, 5).map((r) => (
                  <tr key={r.id}>
                    <td>{relativeTime(r.ts)}</td>
                    <td className="num mono">{r.downMbps.toFixed(0)}</td>
                    <td className="num mono">{r.upMbps !== null ? r.upMbps.toFixed(0) : '–'}</td>
                    <td className="num mono">{r.pingMs !== null ? r.pingMs.toFixed(0) : '–'}</td>
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
