import { useStore } from '../lib/store';
import { Sparkline } from '../components/Sparkline';
import { StartupList } from '../components/StartupList';
import { DetailRow } from '../components/DetailRow';
import { formatBps, formatGb, formatUptime } from '../lib/format';
import type { ProcInfo } from '../types/security';

function ProcTable({ title, rows, metric }: {
  title: string;
  rows: ProcInfo[];
  metric: (p: ProcInfo) => string;
}) {
  return (
    <div className="card">
      <div className="card-titles"><h3>{title}</h3></div>
      {rows.length === 0 ? (
        <p className="card-note">Nothing significant right now.</p>
      ) : (
        <table className="table">
          <tbody>
            {rows.slice(0, 6).map((p) => (
              <tr key={p.name}>
                <td>{p.name.replace(/\.exe$/i, '')}</td>
                <td className="num mono">{metric(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function Performance() {
  const { perf, series, hardware } = useStore();
  const last = series[series.length - 1] ?? null;

  if (!perf) {
    return (
      <div>
        <header className="page-head"><div><h2>Performance</h2><p>Live monitoring is warming up…</p></div></header>
      </div>
    );
  }

  const memPct = perf.memTotalMb > 0 ? (perf.memUsedMb / perf.memTotalMb) * 100 : 0;

  return (
    <div>
      <header className="page-head">
        <div>
          <h2>Performance</h2>
          <p>{perf.cpuModel} · {perf.logicalCores} logical cores · {perf.processCount} processes · up {formatUptime(perf.uptimeSecs)}</p>
        </div>
      </header>

      <div className="grid-2">
        <div className="card">
          <Sparkline title="CPU" valueLabel={`${Math.round(perf.cpuPct)}%`} data={series.map((s) => s.cpuPct)} max={100} />
        </div>
        <div className="card">
          <Sparkline title="Memory" valueLabel={`${(perf.memUsedMb / 1024).toFixed(1)} / ${(perf.memTotalMb / 1024).toFixed(0)} GB`} data={series.map((s) => (s.memTotalMb ? (s.memUsedMb / s.memTotalMb) * 100 : 0))} max={100} />
        </div>
        <div className="card">
          <Sparkline title="Disk activity" valueLabel={last ? `${formatBps(last.diskReadBps + last.diskWriteBps)}` : '—'} data={series.map((s) => s.diskReadBps + s.diskWriteBps)} />
        </div>
        <div className="card">
          <Sparkline title="Network" valueLabel={last ? `↓ ${formatBps(last.rxBps)} ↑ ${formatBps(last.txBps)}` : '—'} data={series.map((s) => s.rxBps + s.txBps)} />
        </div>
      </div>

      <div className="section-title">Right now</div>
      <div className="grid-3">
        <div className="card">
          <div className="card-titles"><h3>Processor</h3><p className="card-subtitle">{perf.cpuModel}</p></div>
          <DetailRow label="Utilization" value={`${Math.round(perf.cpuPct)}%`} tone={perf.cpuPct > 90 ? 'warn' : 'muted'} />
          <DetailRow label="Logical cores" value={String(perf.logicalCores)} />
          <DetailRow label="Clock (reported)" value={perf.cpuFreqMhz > 0 ? `${(perf.cpuFreqMhz / 1000).toFixed(2)} GHz` : 'Unavailable'} />
          <DetailRow label="Temperature" value="Unsupported on this system" />
        </div>
        <div className="card">
          <div className="card-titles"><h3>Memory</h3></div>
          <DetailRow label="In use" value={`${(perf.memUsedMb / 1024).toFixed(1)} GB (${Math.round(memPct)}%)`} tone={memPct > 92 ? 'warn' : 'muted'} />
          <DetailRow label="Available" value={`${(perf.memAvailableMb / 1024).toFixed(1)} GB`} />
          <DetailRow label="Total" value={`${(perf.memTotalMb / 1024).toFixed(0)} GB`} />
        </div>
        <div className="card">
          <div className="card-titles"><h3>Graphics</h3></div>
          {hardware?.gpus.length ? (
            hardware.gpus.map((g) => (
              <div key={g.name}>
                <DetailRow label="GPU" value={g.name} />
                <DetailRow label="Driver" value={g.driver} />
                <DetailRow label="VRAM (reported)" value={g.vramMb ? `${(g.vramMb / 1024).toFixed(1)} GB` : 'Unavailable'} />
                <DetailRow label="Utilization" value="Unsupported" />
              </div>
            ))
          ) : (
            <p className="card-note">Graphics information is unavailable.</p>
          )}
        </div>
      </div>

      <div className="section-title">Storage</div>
      <div className="grid-2">
        <div className="card">
          <div className="card-titles"><h3>Volumes</h3></div>
          {perf.disks.map((d) => {
            const freePct = d.totalGb > 0 ? (d.freeGb / d.totalGb) * 100 : 0;
            return (
              <DetailRow
                key={d.mount}
                label={`${d.mount} (${d.kind})`}
                value={`${formatGb(d.freeGb)} free of ${formatGb(d.totalGb)}`}
                tone={freePct < 10 ? 'bad' : freePct < 20 ? 'warn' : 'muted'}
              />
            );
          })}
        </div>
        <div className="card">
          <div className="card-titles"><h3>Drive hardware</h3></div>
          {hardware?.physicalDisks.length ? (
            hardware.physicalDisks.map((d) => (
              <DetailRow
                key={d.model}
                label={`${d.model} (${d.media}, ${d.bus})`}
                value={d.health === 'Healthy' ? 'Healthy' : d.health}
                tone={d.health === 'Healthy' ? 'good' : 'bad'}
              />
            ))
          ) : (
            <p className="card-note">Drive health is unavailable.</p>
          )}
          {hardware?.battery && (
            <>
              <DetailRow
                label="Battery charge"
                value={hardware.battery.chargePct !== null ? `${hardware.battery.chargePct}%` : 'Unavailable'}
              />
              <DetailRow
                label="Battery health"
                value={hardware.battery.healthPct !== null ? `${hardware.battery.healthPct}% of design capacity` : 'Not reported by this battery'}
              />
            </>
          )}
        </div>
      </div>

      <div className="section-title">Top processes</div>
      <div className="grid-3">
        <ProcTable title="Processor" rows={perf.topCpu} metric={(p) => `${p.cpuPct.toFixed(1)}%`} />
        <ProcTable title="Memory" rows={perf.topMem} metric={(p) => `${(p.memMb / 1024).toFixed(1)} GB`} />
        <ProcTable title="Disk" rows={perf.topDisk} metric={(p) => formatBps(p.diskBps)} />
      </div>
      <p className="faint small" style={{ marginTop: 'var(--sp-2)' }}>
        Per-process network usage isn’t reliably measurable without elevated access, so it isn’t shown.
      </p>

      <div className="section-title">Startup</div>
      <StartupList />
    </div>
  );
}
