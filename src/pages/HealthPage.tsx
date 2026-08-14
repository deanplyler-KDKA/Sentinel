import { useState } from 'react';
import { useStore } from '../lib/store';
import { SuggestionList } from '../components/SuggestionList';
import { StatusPill, type PillState } from '../components/StatusPill';
import type { HealthFactor } from '../lib/health';

function FactorList({ factors }: { factors: HealthFactor[] }) {
  return (
    <div className="card-body">
      {factors.map((f) => (
        <div key={f.id} className="detail-row">
          <span className="detail-label">{f.label}</span>
          <span
            className={`detail-value tone-${f.state === 'pass' ? 'good' : f.state === 'unknown' ? 'muted' : 'warn'}`}
            title={f.note}
          >
            {f.state === 'unknown' ? 'Unknown' : `${f.earned}/${f.points}`}
          </span>
        </div>
      ))}
    </div>
  );
}

type SectionResult = 'Pass' | 'Attention' | 'Unavailable';

interface PressureSection {
  name: string;
  result: SectionResult;
  notes: string[];
}

export function HealthPage() {
  const { security, pcHealth, netHealth, overall, snapshot, perf, hardware, probe, explanations,
    suggestions } = useStore();
  const [report, setReport] = useState<PressureSection[] | null>(null);
  const [running, setRunning] = useState(false);

  const overallPill: PillState =
    overall.state === 'Checking' ? 'unknown'
      : overall.state === 'Excellent' || overall.state === 'Healthy' ? 'ok'
        : overall.state === 'Needs Attention' ? 'warn' : 'bad';

  function runPressureTest() {
    // A diagnostic assessment, NOT a hardware stress test: it evaluates the
    // data every collector already gathers and reports Pass / Attention /
    // Unavailable per area. Nothing is loaded, heated, or benchmarked.
    setRunning(true);
    const sections: PressureSection[] = [];

    if (security && snapshot) {
      const fails = security.results.filter((r) => r.state === 'fail');
      const unknowns = security.results.filter((r) => r.state === 'unknown');
      sections.push({
        name: 'Security',
        result: fails.some((f) => f.points >= 20) ? 'Attention' : fails.length > 2 ? 'Attention' : 'Pass',
        notes: [
          ...fails.map((f) => f.label),
          ...(unknowns.length ? [`${unknowns.length} check(s) unavailable`] : []),
        ],
      });
    } else {
      sections.push({ name: 'Security', result: 'Unavailable', notes: [] });
    }

    if (perf) {
      const notes: string[] = [];
      const memPct = perf.memTotalMb ? perf.memUsedMb / perf.memTotalMb : 0;
      if (memPct > 0.92) notes.push('Memory is nearly full');
      notes.push('CPU temperature: unavailable on this system');
      sections.push({ name: 'Performance', result: notes.some((n) => !n.includes('unavailable')) ? 'Attention' : 'Pass', notes });
    } else {
      sections.push({ name: 'Performance', result: 'Unavailable', notes: [] });
    }

    if (probe) {
      const notes: string[] = [];
      if (probe.latencyMs === null) notes.push('Internet unreachable during probe');
      else if (probe.latencyMs > 100) notes.push(`Latency elevated (${Math.round(probe.latencyMs)} ms)`);
      if (probe.lossPct >= 5) notes.push(`Probe loss ${probe.lossPct}%`);
      sections.push({ name: 'Network', result: notes.length ? 'Attention' : 'Pass', notes });
    } else {
      sections.push({ name: 'Network', result: 'Unavailable', notes: [] });
    }

    if (perf && hardware) {
      const notes: string[] = [];
      for (const d of perf.disks) {
        const freePct = d.totalGb ? d.freeGb / d.totalGb : 1;
        if (freePct < 0.15) notes.push(`${d.mount} is ${Math.round(freePct * 100)}% free`);
      }
      for (const d of hardware.physicalDisks) {
        if (d.health.toLowerCase() !== 'healthy') notes.push(`${d.model}: ${d.health}`);
      }
      sections.push({ name: 'Storage', result: notes.length ? 'Attention' : 'Pass', notes });
    } else {
      sections.push({ name: 'Storage', result: 'Unavailable', notes: [] });
    }

    if (snapshot?.system) {
      const notes: string[] = [];
      if (snapshot.system.rebootRequired) notes.push('Restart pending for updates');
      if (snapshot.system.bitlocker !== 'on') notes.push('Drive encryption is not fully on');
      if (snapshot.system.secureBoot === false) notes.push('Secure Boot is off');
      sections.push({ name: 'System', result: notes.length ? 'Attention' : 'Pass', notes });
    } else {
      sections.push({ name: 'System', result: 'Unavailable', notes: [] });
    }

    setReport(sections);
    setRunning(false);
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h2>Health</h2>
          <p>How each score is calculated — every factor visible, nothing hidden.</p>
        </div>
        <div className="page-actions">
          <StatusPill state={overallPill} label={overall.state} />
          <button className="btn btn-primary" onClick={runPressureTest} disabled={running}>
            {running ? 'Assessing…' : 'Run Pressure Test'}
          </button>
        </div>
      </header>

      {overall.reason && <div className="error-banner">{overall.reason}</div>}

      {report && (
        <>
          <div className="section-title">Pressure Test report</div>
          <div className="grid-3" style={{ marginBottom: 'var(--sp-4)' }}>
            {report.map((s) => (
              <div key={s.name} className="card">
                <div className="detail-row">
                  <span className="detail-label" style={{ fontWeight: 600 }}>{s.name}</span>
                  <StatusPill
                    state={s.result === 'Pass' ? 'ok' : s.result === 'Attention' ? 'warn' : 'unknown'}
                    label={s.result}
                  />
                </div>
                {s.notes.length > 0 && (
                  <ul style={{ listStyle: 'none' }} className="card-body">
                    {s.notes.map((n) => <li key={n} className="card-note">· {n}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className="faint small" style={{ marginBottom: 'var(--sp-4)' }}>
            This is a diagnostic assessment of current readings — it does not stress or benchmark your hardware.
          </p>
        </>
      )}

      <div className="grid-3">
        <div className="card">
          <div className="card-titles"><h3>Security score</h3>
            <p className="card-subtitle">{security ? `${security.score}/100 — critical protections weigh most` : 'Checking…'}</p></div>
          {security && (
            <div className="card-body">
              {security.results.map((r) => (
                <div key={r.id} className="detail-row">
                  <span className="detail-label">{r.label}</span>
                  <span className={`detail-value tone-${r.state === 'pass' ? 'good' : r.state === 'unknown' ? 'muted' : 'warn'}`}>
                    {r.state === 'unknown' ? 'Unknown' : `${r.earned}/${r.points}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-titles"><h3>PC Health score</h3>
            <p className="card-subtitle">{pcHealth ? `${pcHealth.score}/100 — real conditions, not busy workloads` : 'Checking…'}</p></div>
          {pcHealth && <FactorList factors={pcHealth.factors} />}
        </div>
        <div className="card">
          <div className="card-titles"><h3>Network Health score</h3>
            <p className="card-subtitle">{netHealth ? `${netHealth.score}/100 — a VPN is never required` : 'Checking…'}</p></div>
          {netHealth && <FactorList factors={netHealth.factors} />}
        </div>
      </div>

      {explanations.length > 0 && (
        <>
          <div className="section-title">Recommended fixes</div>
          <SuggestionList
            suggestions={suggestions}
            emptyMessage="Nothing needs fixing right now — every check Sentinel can make is passing."
          />

          <div className="section-title">What Sentinel can tell you right now</div>
          <div className="stack">
            {explanations.map((e) => (
              <div key={e.id} className={`issue issue-${e.severity === 'bad' ? 'bad' : e.severity === 'info' ? 'info' : 'warn'}`}>
                <div className="issue-title">{e.title}</div>
                <div className="issue-body">{e.body}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
