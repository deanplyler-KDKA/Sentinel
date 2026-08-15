import type {
  HardwareInfo,
  NetProbe,
  PerfOverview,
  SecuritySnapshot,
  SpeedTestRow,
} from '../types/security';
import type { ScoreReport } from './score';
import type { HealthReport, Overall } from './health';
import type { Suggestion } from './suggest';
import { uptimeSince } from './format';

/**
 * Renders everything Sentinel currently knows as plain text, so someone can
 * send their findings to whoever helps them with their computer.
 *
 * Deliberately excludes: running process names, network SSIDs, IP addresses
 * and DNS servers. Those help almost nobody diagnose a problem over a message,
 * and this file is meant to be forwarded — it should be safe to send without
 * reading every line first. What it does include is what the person is
 * already looking at on screen.
 */
export function buildReport(input: {
  appVersion: string;
  snapshot: SecuritySnapshot | null;
  security: ScoreReport | null;
  pcHealth: HealthReport | null;
  netHealth: HealthReport | null;
  overall: Overall;
  perf: PerfOverview | null;
  hardware: HardwareInfo | null;
  probe: NetProbe | null;
  speedHistory: SpeedTestRow[];
  suggestions: Suggestion[];
}): string {
  const L: string[] = [];
  const line = (s = '') => L.push(s);
  const heading = (s: string) => {
    line();
    line(s.toUpperCase());
    line('-'.repeat(s.length));
  };

  line('SENTINEL HEALTH REPORT');
  line('======================');
  line(`Generated:  ${new Date().toLocaleString()}`);
  line(`Sentinel:   ${input.appVersion}`);
  if (input.snapshot?.system) {
    const sys = input.snapshot.system;
    line(`Computer:   ${sys.computerName}`);
    line(`Windows:    ${sys.osName} ${sys.displayVersion ?? ''} (${sys.osVersion})`);
    line(`Uptime:     ${uptimeSince(sys.lastBoot)}`);
  }

  heading('Overall');
  line(`Status: ${input.overall.state}`);
  if (input.overall.reason) line(`Note:   ${input.overall.reason}`);
  const score = (label: string, r: { score: number } | null) =>
    line(`${label.padEnd(16)} ${r ? `${r.score}/100` : 'not measured'}`);
  score('Security', input.security);
  score('PC health', input.pcHealth);
  score('Network health', input.netHealth);

  // The whole point of the report: what to do, in priority order.
  heading('What to fix, in order');
  if (input.suggestions.length === 0) {
    line('Nothing needs attention.');
  } else {
    input.suggestions.forEach((s, i) => {
      line(`${i + 1}. [${s.severity.toUpperCase()}] ${s.title}`);
      line(`   Area:     ${s.area}`);
      line(`   Why:      ${s.why}`);
      line(`   Evidence: ${s.evidence}`);
      s.steps.forEach((step, n) => line(`   ${n + 1}) ${step}`));
      line();
    });
  }

  heading('Security checks');
  if (input.security) {
    for (const r of input.security.results) {
      const mark =
        r.state === 'pass' ? 'PASS' :
          r.state === 'fail' ? 'FAIL' :
            r.state === 'na' ? 'n/a ' : '????';
      line(`[${mark}] ${r.label.padEnd(34)} ${r.earned}/${r.points}`);
    }
  } else {
    line('Not measured.');
  }
  if (input.snapshot?.defender) {
    const d = input.snapshot.defender;
    line();
    line(`Antivirus mode:      ${d.runningMode}`);
    line(`Third-party AV:      ${d.thirdPartyAv.length ? d.thirdPartyAv.join(', ') : 'none'}`);
    line(`Definitions age:     ${d.signatureAgeDays === null ? 'never updated' : `${d.signatureAgeDays} day(s)`}`);
    line(`Last quick scan:     ${d.quickScanEnd ? new Date(d.quickScanEnd).toLocaleString() : 'never'}`);
  }
  for (const e of input.snapshot?.errors ?? []) {
    line(`COLLECTOR ERROR [${e.source}]: ${e.message}`);
  }

  heading('Drives');
  for (const d of input.perf?.disks ?? []) {
    const usedPct = d.totalGb > 0 ? Math.round(((d.totalGb - d.freeGb) / d.totalGb) * 100) : 0;
    line(`${d.mount.padEnd(6)} ${d.freeGb.toFixed(0)} GB free of ${d.totalGb.toFixed(0)} GB (${usedPct}% used)`);
  }
  for (const p of input.hardware?.physicalDisks ?? []) {
    line(`${p.model} — ${p.media}, ${p.sizeGb} GB, health: ${p.health}`);
  }
  if (!input.perf?.disks.length && !input.hardware?.physicalDisks.length) line('Not measured.');

  heading('Performance');
  if (input.perf) {
    const p = input.perf;
    line(`CPU:       ${p.cpuModel}`);
    line(`           ${p.logicalCores} cores, ${Math.round(p.cpuPct)}% in use`);
    line(`Memory:    ${(p.memUsedMb / 1024).toFixed(1)} GB of ${(p.memTotalMb / 1024).toFixed(1)} GB used`);
    line(`Processes: ${p.processCount}`);
  } else {
    line('Not measured.');
  }
  for (const g of input.hardware?.gpus ?? []) {
    line(`Graphics:  ${g.name} (driver ${g.driver})`);
  }
  const b = input.hardware?.battery;
  if (b) {
    line(`Battery:   ${b.chargePct ?? '?'}% charge, health ${b.healthPct !== null ? `${b.healthPct}%` : 'not reported by this hardware'}`);
  }

  heading('Network');
  if (input.probe) {
    line(`Latency:   ${input.probe.latencyMs !== null ? `${Math.round(input.probe.latencyMs)} ms` : 'not measured'}`);
    line(`Jitter:    ${input.probe.jitterMs !== null ? `${input.probe.jitterMs.toFixed(1)} ms` : 'not measured'}`);
    line(`Loss:      ${input.probe.lossPct}%`);
  }
  const recent = input.speedHistory.slice(0, 5);
  if (recent.length) {
    line('Recent speed tests:');
    for (const r of recent) {
      line(
        `  ${new Date(r.ts).toLocaleDateString().padEnd(11)} ` +
          `${r.downMbps.toFixed(0).padStart(5)} Mbps down  ` +
          `${r.upMbps !== null ? `${r.upMbps.toFixed(0).padStart(4)} Mbps up` : '   – up      '}  (${r.engine})`,
      );
    }
  } else {
    line('No speed tests recorded yet.');
  }

  line();
  line('---');
  line('Sentinel only reads settings; it never changes them. This report contains');
  line('no passwords, file contents, browsing history, IP addresses or network names.');
  return L.join('\n');
}
