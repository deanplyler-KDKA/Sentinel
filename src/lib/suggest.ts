import type {
  HardwareInfo,
  NetProbe,
  NetworkDetail,
  PerfOverview,
  SecuritySnapshot,
  SpeedTestRow,
  StartupApp,
} from '../types/security';
import type { ScoreReport } from './score';
import { assessDns } from './score';

/**
 * Remediation engine: turns measurements into ranked, specific things the
 * user can actually do.
 *
 * Rules this file follows:
 *  - Every suggestion cites the evidence that produced it. No vague advice.
 *  - Never claim certainty the data doesn't support: "likely", "usually",
 *    "worth checking" when the evidence is indicative rather than conclusive.
 *  - Never suggest registry cleaning, RAM "optimizing", service disabling, or
 *    any other placebo. Only actions with a real mechanism.
 *  - Never fabricate a problem to look useful. No findings is a valid result.
 */

export type SettingsTarget =
  | 'windows-update'
  | 'windows-security'
  | 'virus-protection'
  | 'ransomware-protection'
  | 'firewall-protection'
  | 'device-encryption'
  | 'storage'
  | 'startup-apps'
  | 'network-status'
  | 'wifi-settings'
  | 'power-and-battery';

export type SuggestionArea = 'Security' | 'Network' | 'Performance' | 'Storage' | 'System';
export type SuggestionSeverity = 'critical' | 'important' | 'suggested';

export interface Suggestion {
  id: string;
  area: SuggestionArea;
  severity: SuggestionSeverity;
  /** What's going on, in plain language. */
  title: string;
  /** Why it matters — the consequence, not jargon. */
  why: string;
  /** The measurement this came from, so the user can judge it themselves. */
  evidence: string;
  /** Ordered, concrete things to try — most effective first. */
  steps: string[];
  /** Optional one-click deep link into Windows' own settings. */
  action?: { label: string; target: SettingsTarget };
}

const SEVERITY_RANK: Record<SuggestionSeverity, number> = {
  critical: 0,
  important: 1,
  suggested: 2,
};

function mbps(v: number): string {
  return v >= 100 ? `${Math.round(v)} Mbps` : `${v.toFixed(1)} Mbps`;
}

/** Parses "1.2 Gbps" / "300 Mbps" from Get-NetAdapter into Mbps. */
export function parseLinkSpeedMbps(linkSpeed: string): number | null {
  const m = /^([\d.]+)\s*(G|M|K)?bps$/i.exec(linkSpeed.trim());
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] ?? 'M').toUpperCase();
  if (unit === 'G') return value * 1000;
  if (unit === 'K') return value / 1000;
  return value;
}

/**
 * Slow-internet differential diagnosis.
 *
 * The goal is to tell the user *where* the bottleneck is, because the fix is
 * completely different depending on the answer: their own Wi-Fi link, the VPN,
 * something else consuming bandwidth, or the connection beyond the house.
 */
function networkSpeedSuggestions(
  snapshot: SecuritySnapshot | null,
  detail: NetworkDetail | null,
  probe: NetProbe | null,
  speedHistory: SpeedTestRow[],
): Suggestion[] {
  const out: Suggestion[] = [];
  const latest = speedHistory[0] ?? null;
  if (!latest) return out;

  const priors = speedHistory.slice(1);
  const baseline =
    priors.length >= 2 ? priors.reduce((s, r) => s + r.downMbps, 0) / priors.length : null;
  const best = speedHistory.reduce((m, r) => Math.max(m, r.downMbps), 0);
  const vpnOn = snapshot?.vpn?.connected === true;

  // Which physical adapter is actually carrying traffic (ignore tunnels).
  const physical = detail?.adapters.find(
    (a) => !/nordlynx|tap-|tunnel|virtual|loopback/i.test(a.description + a.name),
  );
  const linkMbps = physical ? parseLinkSpeedMbps(physical.linkSpeed) : null;
  const onWifi = physical?.wifi === true;

  const belowBaseline = baseline !== null && latest.downMbps < baseline * 0.7;
  const wellBelowBest = best > 0 && latest.downMbps < best * 0.5;
  const slow = belowBaseline || wellBelowBest;

  // ── 1. VPN overhead — usually the single biggest factor when it's on.
  if (vpnOn && slow) {
    out.push({
      id: 'net-vpn-overhead',
      area: 'Network',
      severity: 'important',
      title: 'Your VPN is the most likely reason this test came out slow',
      why:
        'Encrypting traffic and routing it through a distant server costs throughput. ' +
        'A 30–60% drop is normal, and a badly chosen server can cost much more.',
      evidence:
        `Latest test ${mbps(latest.downMbps)}` +
        (baseline !== null ? `, your recent average ${mbps(baseline)}` : '') +
        `, best recorded ${mbps(best)}. VPN connected via ${snapshot?.vpn?.adapter ?? 'a tunnel'}.`,
      steps: [
        'Run a test with the VPN disconnected — that gives you the honest comparison, and Sentinel keeps both results side by side.',
        'If the gap is large, switch to a NordVPN server geographically closer to you; distance is usually the dominant factor.',
        'Try a different server in the same city — individual servers get congested at peak times.',
        'In NordVPN settings, confirm the protocol is NordLynx: it is materially faster than OpenVPN.',
      ],
    });
  }

  // ── 2. Is the local Wi-Fi link itself the ceiling, or is it upstream?
  //     This is the question people get wrong most often.
  if (onWifi && linkMbps !== null) {
    const usingMostOfLink = latest.downMbps > linkMbps * 0.7;
    if (usingMostOfLink) {
      out.push({
        id: 'net-wifi-ceiling',
        area: 'Network',
        severity: 'important',
        title: 'Your Wi-Fi link is the bottleneck, not your internet plan',
        why:
          'The connection between this PC and the router is negotiating a rate close to what ' +
          'you measured, so a faster internet plan would not help until the Wi-Fi link improves.',
        evidence: `Wi-Fi link negotiated at ${physical?.linkSpeed}; measured internet ${mbps(latest.downMbps)}.`,
        steps: [
          'Move closer to the router, or reduce what is between you and it — walls and floors cost far more than distance alone.',
          'Make sure you are on the 5 GHz or 6 GHz band rather than 2.4 GHz; 2.4 GHz is slower and heavily congested.',
          'If the PC stays in one place, a cable to the router removes this ceiling entirely and is the single biggest improvement available.',
        ],
        action: { label: 'Open Wi-Fi settings', target: 'wifi-settings' },
      });
    } else if (slow) {
      out.push({
        id: 'net-upstream',
        area: 'Network',
        severity: 'suggested',
        title: 'Your Wi-Fi link looks fine — the slowdown is beyond this PC',
        why:
          'The local link to your router is negotiating far faster than the speed you actually got, ' +
          'so the limit is somewhere past the router: the line itself, your provider, or the VPN.',
        evidence: `Wi-Fi link ${physical?.linkSpeed} vs measured internet ${mbps(latest.downMbps)}.`,
        steps: [
          'Restart the router and modem — this genuinely resolves a large share of sudden slowdowns.',
          'Check whether other devices in the house are also slow right now; if they are, the problem is the connection, not this PC.',
          'If it persists across a reboot and affects every device, it is worth raising with your provider — Sentinel’s history gives you dated evidence to show them.',
        ],
      });
    }
  }

  // NOTE: "which app is using the bandwidth" is deliberately absent. Windows
  // does not expose per-process network I/O to an unprivileged user-mode app,
  // and guessing from total throughput would be a fabricated accusation. It is
  // tracked as unsupported in docs/RELIABILITY.md rather than approximated.

  // ── 3. Latency / loss are separate failure modes from throughput.
  if (probe?.latencyMs !== null && probe !== null && probe.latencyMs! > 120) {
    out.push({
      id: 'net-latency',
      area: 'Network',
      severity: 'suggested',
      title: 'Response times are high, which feels slow even at good speeds',
      why:
        'Latency is how long each request takes to start, separate from how fast data flows. ' +
        'High latency makes browsing and calls feel sluggish even when a speed test looks healthy.',
      evidence:
        `Round trip ~${Math.round(probe.latencyMs!)} ms` +
        (probe.jitterMs !== null ? `, jitter ${probe.jitterMs.toFixed(1)} ms` : '') +
        `, measured to ${probe.target}.`,
      steps: [
        vpnOn
          ? 'Your VPN routes traffic through another location, which adds distance — a closer server will lower this.'
          : 'Restart the router; latency that stays high across a reboot usually points at the line or provider.',
        'On Wi-Fi, interference raises latency more visibly than it lowers speed — the 5 GHz band usually helps.',
        'If video calls are the concern, jitter matters more than raw speed; a wired connection is the reliable fix.',
      ],
    });
  }

  if (probe && probe.lossPct >= 10) {
    out.push({
      id: 'net-loss',
      area: 'Network',
      severity: 'important',
      title: 'Some connection attempts are failing',
      why:
        'Lost packets force everything to be re-sent, which causes stalls, buffering and dropped calls ' +
        'that a speed test may not show.',
      evidence: `${probe.lossPct.toFixed(0)}% of connection attempts to ${probe.target} did not complete.`,
      steps: [
        'Restart the router and modem first — this clears the most common causes.',
        'If you are on Wi-Fi, test near the router to rule out signal problems.',
        'Check for a loose or damaged cable between the modem, router and wall.',
      ],
    });
  }

  // ── 4. DNS: makes everything feel slow to *start*, independent of speed.
  const dns = snapshot ? assessDns(snapshot) : null;
  if (probe?.dnsMs != null && probe.dnsMs > 200) {
    out.push({
      id: 'net-dns',
      area: 'Network',
      severity: 'suggested',
      title: 'Looking up website addresses is taking a while',
      why:
        'Before anything loads, your PC has to translate the address. When that step is slow, ' +
        'pages feel slow to begin even though the connection itself is fast.',
      evidence: `A test lookup took ${Math.round(probe.dnsMs)} ms${dns?.provider ? ` using ${dns.provider}` : ''}.`,
      steps: [
        'Using a well-known resolver such as Cloudflare (1.1.1.1) or Quad9 (9.9.9.9) is usually faster than a provider default.',
        'Windows can encrypt these lookups too (DNS over HTTPS), which is a privacy improvement at no speed cost.',
      ],
      action: { label: 'Open network settings', target: 'network-status' },
    });
  }

  // ── 5. Nothing conclusive, but the number really is down.
  if (slow && out.length === 0) {
    out.push({
      id: 'net-slow-generic',
      area: 'Network',
      severity: 'suggested',
      title: 'This test came out below your usual speed',
      why: 'Sentinel could not pin the cause to your Wi-Fi, VPN or latency from what it can measure.',
      evidence:
        `Latest ${mbps(latest.downMbps)}` +
        (baseline !== null ? ` against a recent average of ${mbps(baseline)}` : '') +
        `, best recorded ${mbps(best)}.`,
      steps: [
        'Re-test in a few minutes — provider congestion at peak times is common and temporary.',
        'Check whether another device or a background download is using the connection.',
        'Restart the router and modem if it persists.',
      ],
    });
  }

  return out;
}

/** Security, performance, storage and system remediation. */
function systemSuggestions(
  security: ScoreReport | null,
  snapshot: SecuritySnapshot | null,
  perf: PerfOverview | null,
  hardware: HardwareInfo | null,
  startupApps: StartupApp[],
): Suggestion[] {
  const out: Suggestion[] = [];

  // Security — driven by the existing score so the two never disagree.
  const failed = security?.results.filter((r) => r.state === 'fail') ?? [];
  const securityActions: Record<string, { target: SettingsTarget; label: string }> = {
    rtp: { target: 'virus-protection', label: 'Open Virus & threat protection' },
    cloud: { target: 'virus-protection', label: 'Open Virus & threat protection' },
    tamper: { target: 'windows-security', label: 'Open Windows Security' },
    sig: { target: 'virus-protection', label: 'Check for protection updates' },
    cfa: { target: 'ransomware-protection', label: 'Open Ransomware protection' },
    'fw-private': { target: 'firewall-protection', label: 'Open Firewall settings' },
    'fw-public': { target: 'firewall-protection', label: 'Open Firewall settings' },
    'fw-domain': { target: 'firewall-protection', label: 'Open Firewall settings' },
    bitlocker: { target: 'device-encryption', label: 'Open Device encryption' },
    updates: { target: 'windows-update', label: 'Open Windows Update' },
  };

  for (const f of failed) {
    const isCritical = f.id === 'rtp' || f.id === 'fw-private' || f.id === 'fw-public';
    out.push({
      id: `sec-${f.id}`,
      area: 'Security',
      severity: isCritical ? 'critical' : 'important',
      title: f.label,
      why: f.recommendation,
      evidence: `Worth ${f.points} points of your security score, currently not counted.`,
      steps: [f.recommendation],
      action: securityActions[f.id],
    });
  }

  // Storage — the one performance issue with a genuinely simple fix.
  for (const d of perf?.disks ?? []) {
    const freePct = d.totalGb > 0 ? d.freeGb / d.totalGb : 1;
    if (freePct < 0.1) {
      out.push({
        id: `storage-${d.mount}`,
        area: 'Storage',
        severity: freePct < 0.05 ? 'critical' : 'important',
        title: `Drive ${d.mount} is nearly full`,
        why:
          'Windows needs free space for updates, temporary files and virtual memory. Below about ' +
          '10% free, updates can fail and everything slows down.',
        evidence: `${d.freeGb.toFixed(0)} GB free of ${d.totalGb.toFixed(0)} GB (${Math.round(freePct * 100)}%).`,
        steps: [
          'Storage settings shows exactly what is using the space, largest first — start there rather than guessing.',
          'Empty the Recycle Bin and clear Downloads; these are usually the quickest wins.',
          'Turn on Storage Sense to keep temporary files under control automatically.',
        ],
        action: { label: 'Open Storage settings', target: 'storage' },
      });
    }
  }

  // Memory pressure — only when it's sustained enough to matter.
  if (perf && perf.memTotalMb > 0) {
    const memPct = perf.memUsedMb / perf.memTotalMb;
    if (memPct > 0.92) {
      const top = perf.topMem[0];
      out.push({
        id: 'perf-memory',
        area: 'Performance',
        severity: 'important',
        title: 'Memory is nearly full',
        why:
          'When memory fills, Windows moves data to the drive, which is far slower — this is what ' +
          'makes a PC feel suddenly sluggish when switching between apps.',
        evidence: `${Math.round(memPct * 100)}% of ${(perf.memTotalMb / 1024).toFixed(0)} GB in use${
          top ? `; ${top.name} is the largest single user at ${(top.memMb / 1024).toFixed(1)} GB` : ''
        }.`,
        steps: [
          top
            ? `Close ${top.name} if you are not using it, or restart it — browsers in particular grow over days of uptime.`
            : 'Close apps you are not actively using.',
          'Restarting the PC clears accumulated memory use and is worth doing if uptime is long.',
        ],
      });
    }
  }

  // Drive health — the one hardware warning that deserves urgency.
  for (const disk of hardware?.physicalDisks ?? []) {
    if (disk.health && disk.health.toLowerCase() !== 'healthy') {
      out.push({
        id: `disk-health-${disk.model}`,
        area: 'System',
        severity: 'critical',
        title: `${disk.model} is reporting a problem`,
        why:
          'The drive itself is reporting that it is not healthy. Drives usually give warning before ' +
          'they fail, and acting on that warning is the difference between an inconvenience and losing data.',
        evidence: `Windows reports health status "${disk.health}" for this ${disk.media} (${disk.sizeGb} GB).`,
        steps: [
          'Back up anything irreplaceable now, before doing anything else.',
          'Check the manufacturer’s own drive utility for detailed diagnostics.',
          'Plan to replace the drive — a drive reporting poor health should not be trusted with the only copy of anything.',
        ],
      });
    }
  }

  // Startup load — informational, never auto-disabled.
  const enabledStartup = startupApps.filter((a) => a.enabled);
  if (enabledStartup.length >= 12) {
    out.push({
      id: 'startup-count',
      area: 'Performance',
      severity: 'suggested',
      title: 'A lot of apps launch automatically',
      why:
        'Each one adds to how long the PC takes to become usable after signing in, and many keep ' +
        'running afterwards.',
      evidence: `${enabledStartup.length} apps are set to start with Windows.`,
      steps: [
        'Windows lists these with a measured startup impact — turn off anything you do not need immediately at sign-in.',
        'Chat, launcher and updater apps are the usual candidates; they can still be opened when wanted.',
        'Sentinel never changes these itself — the decision stays with you.',
      ],
      action: { label: 'Open Startup apps', target: 'startup-apps' },
    });
  }

  // Pending restart — cheap and commonly ignored.
  if (snapshot?.system?.rebootRequired) {
    out.push({
      id: 'system-reboot',
      area: 'System',
      severity: 'important',
      title: 'A restart is needed to finish installing updates',
      why:
        'Security updates are not fully in effect until the restart completes, so the PC is running ' +
        'in a half-updated state.',
      evidence: 'Windows reports a pending restart from Windows Update.',
      steps: ['Save your work and restart when convenient — it is usually quick.'],
      action: { label: 'Open Windows Update', target: 'windows-update' },
    });
  }

  // Battery health, only when the firmware actually reports it.
  const battery = hardware?.battery;
  if (battery?.healthPct != null && battery.healthPct < 70) {
    out.push({
      id: 'battery-health',
      area: 'System',
      severity: 'suggested',
      title: 'The battery has lost a meaningful amount of capacity',
      why:
        'Batteries wear with age and charge cycles. Below about 70% of original capacity, runtime ' +
        'drops noticeably and the PC may shut down unexpectedly under load.',
      evidence: `Reported full-charge capacity is ${battery.healthPct}% of the original design capacity.`,
      steps: [
        'Keep the PC plugged in for demanding work so it is not relying on the battery.',
        'A replacement restores full runtime; this is wear, not a fault.',
      ],
      action: { label: 'Open Power & battery', target: 'power-and-battery' },
    });
  }

  return out;
}

/**
 * Everything Sentinel can suggest, ranked: critical first, then important,
 * then suggested. An empty result means nothing needs attention — that is a
 * legitimate outcome and the UI says so plainly rather than inventing work.
 */
export function buildSuggestions(input: {
  security: ScoreReport | null;
  snapshot: SecuritySnapshot | null;
  perf: PerfOverview | null;
  hardware: HardwareInfo | null;
  detail: NetworkDetail | null;
  probe: NetProbe | null;
  speedHistory: SpeedTestRow[];
  startupApps: StartupApp[];
}): Suggestion[] {
  const all = [
    ...systemSuggestions(
      input.security,
      input.snapshot,
      input.perf,
      input.hardware,
      input.startupApps,
    ),
    ...networkSpeedSuggestions(input.snapshot, input.detail, input.probe, input.speedHistory),
  ];
  return all.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
