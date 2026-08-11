import { useStore } from '../lib/store';
import { isTauri } from '../lib/api';
import { relativeTime, formatBps } from '../lib/format';
import { ScoreDial } from '../components/ScoreDial';
import { StatusPill, type PillState } from '../components/StatusPill';
import { RefreshIcon } from '../components/Icons';
import { getTimeline } from '../lib/api';
import { useEffect, useState } from 'react';
import type { TimelineEvent } from '../types/security';
import type { Page } from '../components/Nav';

function toneFor(score: number | null): 'good' | 'warn' | 'bad' | 'muted' {
  if (score === null) return 'muted';
  if (score >= 85) return 'good';
  if (score >= 60) return 'warn';
  return 'bad';
}

function stateWord(score: number | null): string {
  if (score === null) return 'Checking';
  if (score >= 93) return 'Excellent';
  if (score >= 85) return 'Healthy';
  if (score >= 60) return 'Needs Attention';
  return 'Action Recommended';
}

export function DashboardPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const {
    snapshot, snapshotLoading, refreshSnapshot, security, pcHealth, netHealth, overall,
    explanations, perf, probe, series,
  } = useStore();
  const lastSample = series[series.length - 1] ?? null;
  const [recent, setRecent] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    getTimeline().then((evs) => setRecent(evs.slice(0, 6))).catch(() => {});
  }, [snapshot]);

  const overallPill: PillState =
    overall.state === 'Checking' ? 'unknown'
      : overall.state === 'Excellent' || overall.state === 'Healthy' ? 'ok'
        : overall.state === 'Needs Attention' ? 'warn' : 'bad';

  const storage = perf?.disks[0] ?? null;
  const storageScore = pcHealth?.factors.find((f) => f.id === 'storage');
  const issues = explanations.slice(0, 4);

  return (
    <div>
      <header className="page-head">
        <div>
          <h2>Dashboard</h2>
          <p>
            {snapshot ? `Last checked ${relativeTime(snapshot.collectedAt)}` : 'Checking your system…'}
          </p>
        </div>
        <div className="page-actions">
          {!isTauri && <span className="mock-badge">Preview data</span>}
          <StatusPill state={overallPill} label={overall.state} />
          <button className="btn" onClick={refreshSnapshot} disabled={snapshotLoading}>
            <RefreshIcon />
            {snapshotLoading ? 'Checking…' : 'Refresh'}
          </button>
        </div>
      </header>

      {overall.reason && <div className="error-banner">{overall.reason}</div>}

      <div className="card" style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
        <ScoreDial label="Security" score={security?.score ?? null} state={stateWord(security?.score ?? null)} tone={toneFor(security?.score ?? null)} />
        <ScoreDial label="PC Health" score={pcHealth?.score ?? null} state={stateWord(pcHealth?.score ?? null)} tone={toneFor(pcHealth?.score ?? null)} />
        <ScoreDial label="Network" score={netHealth?.score ?? null} state={stateWord(netHealth?.score ?? null)} tone={toneFor(netHealth?.score ?? null)} />
        <ScoreDial
          label="Storage"
          score={storageScore ? (storageScore.state === 'unknown' ? null : Math.round((storageScore.earned / storageScore.points) * 100)) : null}
          state={storageScore?.state === 'unknown' ? 'Checking' : storageScore?.earned === storageScore?.points ? 'Healthy' : 'Needs Attention'}
          tone={storageScore?.state === 'unknown' ? 'muted' : storageScore?.earned === storageScore?.points ? 'good' : 'warn'}
        />
      </div>

      {issues.length > 0 && (
        <>
          <div className="section-title">Needs your attention</div>
          <div className="stack">
            {issues.map((e) => (
              <div key={e.id} className={`issue issue-${e.severity === 'bad' ? 'bad' : e.severity === 'info' ? 'info' : 'warn'}`}>
                <div className="issue-head">
                  <span className="issue-title">{e.title}</span>
                </div>
                <div className="issue-body">{e.body}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {issues.length === 0 && snapshot && (
        <div className="issue issue-info" style={{ marginTop: 'var(--sp-3)' }}>
          <div className="issue-title">Everything looks good</div>
          <div className="issue-body">No issues need your attention right now.</div>
        </div>
      )}

      <div className="section-title">At a glance</div>
      <div className="grid-3">
        <button className="card" style={{ textAlign: 'left' }} onClick={() => onNavigate('protect')}>
          <div className="detail-row"><span className="detail-label">Security</span>
            <span className={`detail-value tone-${security && security.score >= 85 ? 'good' : 'warn'}`}>
              {security ? `${security.score}/100` : '…'}
            </span></div>
          <p className="card-note">
            {snapshot?.defender?.realTimeProtection || (snapshot?.defender?.thirdPartyAv.length ?? 0) > 0
              ? 'Antivirus protection is active.'
              : snapshot ? 'Antivirus protection needs attention.' : 'Checking…'}
          </p>
        </button>
        <button className="card" style={{ textAlign: 'left' }} onClick={() => onNavigate('performance')}>
          <div className="detail-row"><span className="detail-label">Performance</span>
            <span className="detail-value">{perf ? `CPU ${Math.round(perf.cpuPct)}%` : 'Checking…'}</span></div>
          <p className="card-note">
            {perf
              ? `Memory ${Math.round((perf.memUsedMb / perf.memTotalMb) * 100)}% · ${perf.processCount} processes`
              : 'Live monitoring is warming up.'}
          </p>
        </button>
        <button className="card" style={{ textAlign: 'left' }} onClick={() => onNavigate('network')}>
          <div className="detail-row"><span className="detail-label">Network</span>
            <span className={`detail-value tone-${probe && probe.latencyMs !== null && probe.latencyMs < 80 ? 'good' : 'muted'}`}>
              {probe?.latencyMs !== null && probe ? `${Math.round(probe.latencyMs!)} ms` : '…'}
            </span></div>
          <p className="card-note">
            {snapshot?.vpn?.connected ? 'VPN connected. ' : ''}
            {lastSample ? `↓ ${formatBps(lastSample.rxBps)} ↑ ${formatBps(lastSample.txBps)}` : ''}
          </p>
        </button>
        <button className="card" style={{ textAlign: 'left' }} onClick={() => onNavigate('performance')}>
          <div className="detail-row"><span className="detail-label">Storage</span>
            <span className="detail-value">
              {storage ? `${Math.round((storage.freeGb / storage.totalGb) * 100)}% free` : '…'}
            </span></div>
          <p className="card-note">
            {storage ? `${storage.freeGb.toFixed(0)} GB free of ${storage.totalGb.toFixed(0)} GB on ${storage.mount}` : 'Checking drives…'}
          </p>
        </button>
        <button className="card" style={{ textAlign: 'left' }} onClick={() => onNavigate('protect')}>
          <div className="detail-row"><span className="detail-label">Updates</span>
            <span className={`detail-value tone-${snapshot?.system?.rebootRequired ? 'warn' : 'good'}`}>
              {snapshot?.system ? (snapshot.system.rebootRequired ? 'Restart needed' : 'Up to date') : '…'}
            </span></div>
          <p className="card-note">
            {snapshot?.system?.updateLastInstall
              ? `Last update installed ${relativeTime(snapshot.system.updateLastInstall)}`
              : 'Checking Windows Update…'}
          </p>
        </button>
        <button className="card" style={{ textAlign: 'left' }} onClick={() => onNavigate('network')}>
          <div className="detail-row"><span className="detail-label">VPN</span>
            <span className={`detail-value tone-${snapshot?.vpn?.connected ? 'good' : 'muted'}`}>
              {snapshot?.vpn ? (snapshot.vpn.connected ? 'Connected' : snapshot.vpn.installed ? 'Not connected' : 'Not installed') : '…'}
            </span></div>
          <p className="card-note">
            {snapshot?.vpn?.connected ? `NordVPN via ${snapshot.vpn.adapter ?? 'tunnel'}` : 'Protection is optional on trusted networks.'}
          </p>
        </button>
      </div>

      <div className="section-title">Recent activity</div>
      <div className="card">
        {recent.length === 0 && <p className="card-note">Nothing recorded yet.</p>}
        {recent.map((ev) => (
          <div key={ev.id} className="timeline-row">
            <span className="timeline-time">{relativeTime(ev.ts)}</span>
            <span className={`timeline-dot dot-${ev.severity}`} />
            <div className="timeline-body">
              <span className="timeline-message">{ev.message}</span>
              {ev.detail && <span className="timeline-detail">{ev.detail}</span>}
            </div>
          </div>
        ))}
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => onNavigate('history')}>
          View full history
        </button>
      </div>
    </div>
  );
}
