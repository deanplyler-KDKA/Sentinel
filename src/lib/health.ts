import type {
  HardwareInfo,
  NetProbe,
  PerfOverview,
  SecuritySnapshot,
  SpeedTestRow,
} from '../types/security';
import type { ScoreReport } from './score';

// Shared factor shape for the transparent health scores. `state: null` means
// the underlying data is unavailable — it earns 0 and is labeled Unknown,
// never treated as passing.

export interface HealthFactor {
  id: string;
  label: string;
  points: number;
  earned: number;
  state: 'pass' | 'fail' | 'unknown';
  note?: string;
}

export interface HealthReport {
  score: number;
  factors: HealthFactor[];
}

function factor(
  id: string,
  label: string,
  points: number,
  value: boolean | null,
  note?: string,
): HealthFactor {
  return {
    id,
    label,
    points,
    earned: value ? points : 0,
    state: value === null ? 'unknown' : value ? 'pass' : 'fail',
    note,
  };
}

/**
 * PC Health: configuration and genuine health signals only. A heavy workload
 * is NOT a health problem — momentary CPU/RAM activity is deliberately not
 * scored; only sustained pressure signals and real conditions are.
 */
export function computePcHealth(
  perf: PerfOverview | null,
  hardware: HardwareInfo | null,
  snapshot: SecuritySnapshot | null,
): HealthReport {
  const factors: HealthFactor[] = [];

  // Storage free space (30): the most common real-world degradation.
  if (perf && perf.disks.length > 0) {
    const worst = Math.min(...perf.disks.map((d) => (d.totalGb > 0 ? d.freeGb / d.totalGb : 1)));
    const pct = Math.round(worst * 100);
    if (worst < 0.05) {
      factors.push(factor('storage', 'Free disk space', 30, false, `A drive is ${pct}% free — critically low.`));
    } else if (worst < 0.15) {
      factors.push({
        id: 'storage', label: 'Free disk space', points: 30, earned: 15, state: 'fail',
        note: `A drive is down to ${pct}% free. Low space can affect updates and performance.`,
      });
    } else {
      factors.push(factor('storage', 'Free disk space', 30, true, `${pct}% free on the fullest drive.`));
    }
  } else {
    factors.push(factor('storage', 'Free disk space', 30, null));
  }

  // Drive hardware health (25): SMART via Storage subsystem.
  if (hardware && hardware.physicalDisks.length > 0) {
    const bad = hardware.physicalDisks.filter((d) => d.health.toLowerCase() !== 'healthy');
    factors.push(
      factor(
        'drive-health', 'Drive hardware health', 25, bad.length === 0,
        bad.length ? `${bad[0].model} reports "${bad[0].health}".` : 'All drives report Healthy.',
      ),
    );
  } else {
    factors.push(factor('drive-health', 'Drive hardware health', 25, null));
  }

  // Memory pressure (15): only near-exhaustion counts, not normal usage.
  if (perf) {
    const usedPct = perf.memTotalMb > 0 ? perf.memUsedMb / perf.memTotalMb : 0;
    factors.push(
      factor(
        'memory', 'Memory headroom', 15, usedPct < 0.92,
        usedPct >= 0.92
          ? `Memory is ${Math.round(usedPct * 100)}% used — the system may start swapping.`
          : undefined,
      ),
    );
  } else {
    factors.push(factor('memory', 'Memory headroom', 15, null));
  }

  // Windows Update state (20).
  if (snapshot?.system) {
    const sys = snapshot.system;
    const installedRecently =
      sys.updateLastInstall !== null &&
      (Date.now() - Date.parse(sys.updateLastInstall)) / 86_400_000 <= 30;
    factors.push(
      factor(
        'updates', 'Windows up to date', 20, !sys.rebootRequired && installedRecently,
        sys.rebootRequired ? 'A restart is needed to finish installing updates.' : undefined,
      ),
    );
  } else {
    factors.push(factor('updates', 'Windows up to date', 20, null));
  }

  // Battery health (10). Firmware that doesn't report wear data is
  // UNSUPPORTED, not unhealthy — the factor is excluded (0 points possible)
  // so an unsupported capability never caps the score.
  if (hardware) {
    if (hardware.battery === null) {
      factors.push(factor('battery', 'Battery health', 10, true, 'No battery — desktop power.'));
    } else if (hardware.battery.healthPct === null) {
      factors.push({
        id: 'battery', label: 'Battery health', points: 0, earned: 0, state: 'unknown',
        note: 'This battery does not report wear data — not scored.',
      });
    } else {
      factors.push(
        factor(
          'battery', 'Battery health', 10, hardware.battery.healthPct >= 60,
          `Holds ${hardware.battery.healthPct}% of its original capacity.`,
        ),
      );
    }
  } else {
    factors.push(factor('battery', 'Battery health', 10, null));
  }

  const max = factors.reduce((s, f) => s + f.points, 0);
  const earned = factors.reduce((s, f) => s + f.earned, 0);
  return { score: Math.round((earned / max) * 100), factors };
}

/**
 * Network Health: connectivity quality. A VPN is never required for a high
 * score; historical speed deviation only counts when history exists.
 */
export function computeNetworkHealth(
  snapshot: SecuritySnapshot | null,
  probe: NetProbe | null,
  speedHistory: SpeedTestRow[],
): HealthReport {
  const factors: HealthFactor[] = [];

  const connected = snapshot?.network
    ? snapshot.network.profiles.some((p) => p.connected)
    : null;
  factors.push(factor('connectivity', 'Internet connectivity', 30, connected));

  if (probe) {
    if (probe.latencyMs === null) {
      factors.push(factor('latency', 'Connection latency', 25, false, 'No probe target was reachable.'));
    } else {
      const l = probe.latencyMs;
      factors.push(
        factor(
          'latency', 'Connection latency', 25, l < 80,
          l < 30 ? `${Math.round(l)} ms — excellent.` : l < 80 ? `${Math.round(l)} ms — good.` : `${Math.round(l)} ms — elevated.`,
        ),
      );
    }
    factors.push(
      factor('loss', 'Packet delivery', 20, probe.lossPct < 5,
        probe.lossPct >= 5 ? `${probe.lossPct}% of probes failed.` : undefined),
    );
    factors.push(
      factor('dns', 'DNS responsiveness', 10,
        probe.dnsMs === null ? null : probe.dnsMs < 200,
        probe.dnsMs !== null && probe.dnsMs >= 200 ? `DNS took ${Math.round(probe.dnsMs)} ms.` : undefined),
    );
  } else {
    factors.push(factor('latency', 'Connection latency', 25, null));
    factors.push(factor('loss', 'Packet delivery', 20, null));
    factors.push(factor('dns', 'DNS responsiveness', 10, null));
  }

  // Historical speed deviation (15): needs at least 3 past tests.
  if (speedHistory.length >= 3) {
    const [latest, ...rest] = speedHistory;
    const baseline = rest.reduce((s, r) => s + r.downMbps, 0) / rest.length;
    const ratio = baseline > 0 ? latest.downMbps / baseline : 1;
    factors.push(
      factor(
        'speed-trend', 'Speed vs. your baseline', 15, ratio >= 0.6,
        ratio < 0.6
          ? `Latest test (${Math.round(latest.downMbps)} Mbps) is well below your average (${Math.round(baseline)} Mbps).`
          : undefined,
      ),
    );
  } else {
    factors.push(
      factor('speed-trend', 'Speed vs. your baseline', 15, null,
        'Run a few speed tests to establish a baseline.'),
    );
  }

  const max = factors.reduce((s, f) => s + f.points, 0);
  const earned = factors.reduce((s, f) => s + f.earned, 0);
  return { score: Math.round((earned / max) * 100), factors };
}

// ── Overall system health ───────────────────────────────

export type OverallState =
  | 'Excellent'
  | 'Healthy'
  | 'Needs Attention'
  | 'Action Recommended'
  | 'Checking';

export interface Overall {
  state: OverallState;
  /** Why the state is what it is, when an override applied. */
  reason: string | null;
}

/**
 * Weighted with severity overrides — never a blind average. A single
 * critical condition caps the overall state no matter the numbers.
 */
export function computeOverall(
  security: ScoreReport | null,
  pc: HealthReport | null,
  network: HealthReport | null,
  snapshot: SecuritySnapshot | null,
): Overall {
  if (!security || !pc || !snapshot) return { state: 'Checking', reason: null };

  // Critical overrides.
  if (snapshot.defender && !snapshot.defender.realTimeProtection && !snapshot.defender.thirdPartyAv.length) {
    return { state: 'Action Recommended', reason: 'Real-time antivirus protection is off.' };
  }
  if (snapshot.firewall && !snapshot.firewall.private && !snapshot.firewall.public) {
    return { state: 'Action Recommended', reason: 'The firewall is off for your networks.' };
  }
  const criticalStorage = pc.factors.find((f) => f.id === 'storage' && f.state === 'fail' && f.earned === 0);
  if (criticalStorage) {
    return { state: 'Action Recommended', reason: 'A drive is critically low on space.' };
  }
  const badDrive = pc.factors.find((f) => f.id === 'drive-health' && f.state === 'fail');
  if (badDrive) {
    return { state: 'Action Recommended', reason: 'A drive is reporting a hardware health problem.' };
  }

  // Weighted blend: security counts double.
  const parts: Array<[number, number]> = [
    [security.score, 2],
    [pc.score, 1],
  ];
  if (network) parts.push([network.score, 1]);
  const weighted = parts.reduce((s, [v, w]) => s + v * w, 0) / parts.reduce((s, [, w]) => s + w, 0);

  const anyUnknownCritical = security.results.some((r) => r.state === 'unknown');
  if (weighted >= 93 && !anyUnknownCritical) return { state: 'Excellent', reason: null };
  if (weighted >= 80) return { state: 'Healthy', reason: null };
  if (weighted >= 60) return { state: 'Needs Attention', reason: null };
  return { state: 'Action Recommended', reason: null };
}

// ── Deterministic explanations ──────────────────────────

export interface Explanation {
  id: string;
  severity: 'info' | 'warn' | 'bad';
  title: string;
  body: string;
}

/** Local, deterministic answers to "what's going on?" — no cloud, no AI. */
export function explain(
  perf: PerfOverview | null,
  probe: NetProbe | null,
  snapshot: SecuritySnapshot | null,
  security: ScoreReport | null,
  speedHistory: SpeedTestRow[],
): Explanation[] {
  const out: Explanation[] = [];

  if (perf) {
    const topProc = perf.topCpu[0];
    if (perf.cpuPct > 60 && topProc && topProc.cpuPct > perf.cpuPct * 0.4) {
      out.push({
        id: 'cpu-app', severity: 'info',
        title: `${friendlyProcName(topProc.name)} is using most of your processor`,
        body: `Overall CPU is at ${Math.round(perf.cpuPct)}%, and ${friendlyProcName(topProc.name)} accounts for the largest share. This is normal while it's working hard.`,
      });
    }
    const memPct = perf.memTotalMb > 0 ? perf.memUsedMb / perf.memTotalMb : 0;
    if (memPct > 0.92) {
      const topMem = perf.topMem[0];
      out.push({
        id: 'memory', severity: 'warn',
        title: 'Memory is nearly full',
        body: topMem
          ? `${Math.round(memPct * 100)}% of memory is in use; ${friendlyProcName(topMem.name)} is the largest user. Closing unused apps will help.`
          : `${Math.round(memPct * 100)}% of memory is in use.`,
      });
    }
    for (const d of perf.disks) {
      const freePct = d.totalGb > 0 ? d.freeGb / d.totalGb : 1;
      if (freePct < 0.1) {
        out.push({
          id: `disk-${d.mount}`, severity: freePct < 0.05 ? 'bad' : 'warn',
          title: `Drive ${d.mount} is nearly full`,
          body: `Only ${d.freeGb.toFixed(0)} GB free of ${d.totalGb.toFixed(0)} GB. Low storage can affect updates and performance.`,
        });
      }
    }
  }

  if (probe && probe.latencyMs !== null && probe.latencyMs > 100) {
    const wifiOk = true; // link-level signal isn't measured yet — stay honest below.
    out.push({
      id: 'latency', severity: 'warn',
      title: 'Internet latency is elevated',
      body: wifiOk
        ? `Round trips are taking ~${Math.round(probe.latencyMs)} ms. ${snapshot?.vpn?.connected ? 'Your VPN adds some distance; this can be normal.' : 'This may be your connection or provider rather than this computer.'}`
        : '',
    });
  }

  if (speedHistory.length >= 3) {
    const [latest, ...rest] = speedHistory;
    const baseline = rest.reduce((s, r) => s + r.downMbps, 0) / rest.length;
    if (baseline > 0 && latest.downMbps / baseline < 0.6) {
      out.push({
        id: 'speed-drop', severity: 'warn',
        title: 'Internet speed is below your usual baseline',
        body: `Your latest test measured ${Math.round(latest.downMbps)} Mbps against a recent average of ${Math.round(baseline)} Mbps.${snapshot?.vpn?.connected ? ' A VPN can reduce throughput — try testing with it briefly disconnected to compare.' : ''}`,
      });
    }
  }

  if (security) {
    for (const r of security.results.filter((x) => x.state === 'fail').slice(0, 3)) {
      out.push({
        id: `sec-${r.id}`,
        severity: r.points >= 20 ? 'bad' : 'warn',
        title: r.label,
        body: r.recommendation,
      });
    }
  }

  return out;
}

function friendlyProcName(name: string): string {
  const map: Record<string, string> = {
    'chrome.exe': 'Chrome',
    'msedge.exe': 'Microsoft Edge',
    'firefox.exe': 'Firefox',
    'Code.exe': 'Visual Studio Code',
    'MsMpEng.exe': 'Microsoft Defender',
    'Discord.exe': 'Discord',
    'steam.exe': 'Steam',
  };
  return map[name] ?? name.replace(/\.exe$/i, '');
}
