import { describe, expect, it } from 'vitest';
import { mockHardware, mockPerfOverview, mockSnapshot, mockSpeedTests } from '../mock';
import { computeScore } from '../score';
import { computeNetworkHealth, computeOverall, computePcHealth, explain } from '../health';
import type { NetProbe } from '../../types/security';

const probe: NetProbe = { latencyMs: 18, jitterMs: 2, lossPct: 0, dnsMs: 12, target: '1.1.1.1' };

describe('computePcHealth', () => {
  it('scores a healthy machine high', () => {
    const r = computePcHealth(mockPerfOverview(), mockHardware(), mockSnapshot());
    expect(r.score).toBe(100);
  });

  it('does not penalize a battery that cannot report wear data', () => {
    const hw = mockHardware();
    hw.battery = { status: 2, chargePct: 100, healthPct: null };
    const r = computePcHealth(mockPerfOverview(), hw, mockSnapshot());
    const battery = r.factors.find((f) => f.id === 'battery')!;
    expect(battery.points).toBe(0); // excluded, not failed
    expect(r.score).toBe(100);
  });

  it('flags critically low storage hard', () => {
    const perf = mockPerfOverview();
    perf.disks = [{ mount: 'C:\\', totalGb: 1000, freeGb: 30, kind: 'SSD' }];
    const r = computePcHealth(perf, mockHardware(), mockSnapshot());
    expect(r.factors.find((f) => f.id === 'storage')?.earned).toBe(0);
  });

  it('treats an unhealthy drive as a failure, not unknown', () => {
    const hw = mockHardware();
    hw.physicalDisks[0].health = 'Warning';
    const r = computePcHealth(mockPerfOverview(), hw, mockSnapshot());
    expect(r.factors.find((f) => f.id === 'drive-health')?.state).toBe('fail');
  });

  it('busy-but-normal memory is not a health problem', () => {
    const perf = mockPerfOverview();
    perf.memUsedMb = Math.round(perf.memTotalMb * 0.85); // heavy but fine
    const r = computePcHealth(perf, mockHardware(), mockSnapshot());
    expect(r.factors.find((f) => f.id === 'memory')?.state).toBe('pass');
  });
});

describe('computeNetworkHealth', () => {
  it('does not require a VPN for a perfect score', () => {
    const snap = mockSnapshot();
    snap.vpn!.connected = false;
    const history = mockSpeedTests().map((r) => ({ ...r, downMbps: 800 }));
    const r = computeNetworkHealth(snap, probe, history);
    expect(r.score).toBe(100);
  });

  it('flags a speed collapse against the baseline', () => {
    const r = computeNetworkHealth(mockSnapshot(), probe, mockSpeedTests());
    expect(r.factors.find((f) => f.id === 'speed-trend')?.state).toBe('fail');
  });

  it('leaves the baseline unknown without enough tests', () => {
    const r = computeNetworkHealth(mockSnapshot(), probe, []);
    expect(r.factors.find((f) => f.id === 'speed-trend')?.state).toBe('unknown');
  });
});

describe('computeOverall', () => {
  it('is not a blind average — disabled protection overrides good numbers', () => {
    const snap = mockSnapshot();
    snap.defender!.realTimeProtection = false;
    snap.defender!.antivirusEnabled = false;
    const security = computeScore(snap);
    const pc = computePcHealth(mockPerfOverview(), mockHardware(), snap);
    const net = computeNetworkHealth(snap, probe, []);
    const overall = computeOverall(security, pc, net, snap);
    expect(overall.state).toBe('Action Recommended');
    expect(overall.reason).toContain('antivirus');
  });

  it('reports Checking before data arrives', () => {
    expect(computeOverall(null, null, null, null).state).toBe('Checking');
  });

  it('caps a green headline when any check is unmeasured', () => {
    const snap = { ...mockSnapshot(), firewall: null };
    const security = computeScore(snap);
    const pc = computePcHealth(mockPerfOverview(), mockHardware(), snap);
    const net = computeNetworkHealth(snap, probe, []);
    const overall = computeOverall(security, pc, net, snap);
    expect(overall.state).toBe('Needs Attention');
    expect(overall.reason).toContain('couldn’t be measured');
  });

  it('an unmeasured check never SOFTENS a genuinely bad state', () => {
    // Security in poor shape (no override triggered) plus an unknown network
    // check: the headline must stay at the worse of the two, not be downgraded
    // to amber by the incomplete-data path.
    const snap = mockSnapshot();
    snap.defender!.tamperProtection = false;
    snap.defender!.cloudProtection = false;
    snap.defender!.controlledFolderAccess = false;
    snap.defender!.signatureAgeDays = 40;
    snap.system!.secureBoot = false;
    snap.system!.bitlocker = 'off';
    snap.system!.rebootRequired = true;
    const security = computeScore(snap);
    const pc = computePcHealth(mockPerfOverview(), mockHardware(), snap);
    const net = computeNetworkHealth(snap, null, []); // null probe ⇒ unknowns
    const overall = computeOverall(security, pc, net, snap);
    expect(overall.state).toBe('Action Recommended');
  });

  it('does not treat deliberately unscored factors as unmeasured', () => {
    // A battery that cannot report wear data is points:0 / unknown — it must
    // not pin the headline off green forever.
    const hw = mockHardware();
    hw.battery = { status: 2, chargePct: 100, healthPct: null };
    const snap = mockSnapshot();
    const security = computeScore(snap);
    const pc = computePcHealth(mockPerfOverview(), hw, snap);
    const net = computeNetworkHealth(snap, probe, mockSpeedTests().map((r) => ({ ...r, downMbps: 800 })));
    expect(computeOverall(security, pc, net, snap).state).toBe('Excellent');
  });
});

describe('explain', () => {
  it('attributes high CPU to the responsible app in plain language', () => {
    const perf = mockPerfOverview();
    perf.cpuPct = 75;
    perf.topCpu = [{ name: 'chrome.exe', cpuPct: 52, memMb: 2000, diskBps: 0 }];
    const out = explain(perf, probe, mockSnapshot(), null, []);
    const cpu = out.find((e) => e.id === 'cpu-app')!;
    expect(cpu.title).toContain('Chrome');
    expect(cpu.severity).toBe('info'); // a busy app is not an alarm
  });

  it('explains a speed drop against the baseline', () => {
    const out = explain(null, null, mockSnapshot(), null, mockSpeedTests());
    expect(out.some((e) => e.id === 'speed-drop')).toBe(true);
  });
});
