import { describe, expect, it } from 'vitest';
import { computeScore } from '../score';
import { buildSuggestions, parseLinkSpeedMbps, type Suggestion } from '../suggest';
import {
  mockHardware,
  mockNetworkDetail,
  mockPerfOverview,
  mockProbe,
  mockSnapshot,
  mockStartupApps,
} from '../mock';
import type { SpeedTestRow } from '../../types/security';

function speeds(latest: number, priors: number[]): SpeedTestRow[] {
  const now = Date.now();
  return [
    { id: 100, ts: new Date(now).toISOString(), downMbps: latest, upMbps: 40, pingMs: 20, jitterMs: 2 },
    ...priors.map((d, i) => ({
      id: 99 - i,
      ts: new Date(now - (i + 1) * 86_400_000).toISOString(),
      downMbps: d,
      upMbps: 40,
      pingMs: 20,
      jitterMs: 2,
    })),
  ];
}

function build(over: Partial<Parameters<typeof buildSuggestions>[0]> = {}): Suggestion[] {
  const snapshot = over.snapshot !== undefined ? over.snapshot : mockSnapshot();
  return buildSuggestions({
    security: snapshot ? computeScore(snapshot) : null,
    snapshot,
    perf: mockPerfOverview(),
    hardware: mockHardware(),
    detail: mockNetworkDetail(),
    probe: mockProbe(),
    speedHistory: [],
    startupApps: mockStartupApps(),
    ...over,
  });
}

describe('parseLinkSpeedMbps', () => {
  it('handles the units Get-NetAdapter emits', () => {
    expect(parseLinkSpeedMbps('1.2 Gbps')).toBeCloseTo(1200);
    expect(parseLinkSpeedMbps('300 Mbps')).toBe(300);
    expect(parseLinkSpeedMbps('100 Kbps')).toBeCloseTo(0.1);
    expect(parseLinkSpeedMbps('nonsense')).toBeNull();
  });
});

describe('suggestions are evidence-based', () => {
  it('every suggestion carries evidence and at least one concrete step', () => {
    const all = build({ speedHistory: speeds(200, [800, 810, 790]) });
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      expect(s.evidence.length).toBeGreaterThan(10);
      expect(s.steps.length).toBeGreaterThan(0);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.why.length).toBeGreaterThan(0);
    }
  });

  it('ranks critical before important before suggested', () => {
    const snapshot = mockSnapshot();
    snapshot.defender!.realTimeProtection = false; // critical
    snapshot.defender!.thirdPartyAv = [];
    const all = build({ snapshot, security: computeScore(snapshot) });
    const ranks = all.map((s) => s.severity);
    const order = { critical: 0, important: 1, suggested: 2 } as const;
    for (let i = 1; i < ranks.length; i++) {
      expect(order[ranks[i]]).toBeGreaterThanOrEqual(order[ranks[i - 1]]);
    }
  });

  it('invents nothing on a healthy machine with no speed history', () => {
    const snapshot = mockSnapshot();
    snapshot.defender!.controlledFolderAccess = true; // clear the one real finding
    const all = build({ snapshot, security: computeScore(snapshot), speedHistory: [] });
    expect(all.filter((s) => s.area === 'Network')).toHaveLength(0);
  });
});

describe('slow-network diagnosis', () => {
  it('names the VPN when connected and the result is below baseline', () => {
    const all = build({ speedHistory: speeds(300, [800, 820, 790]) });
    const vpn = all.find((s) => s.id === 'net-vpn-overhead');
    expect(vpn).toBeDefined();
    expect(vpn!.evidence).toContain('300');
    expect(vpn!.steps.join(' ')).toContain('disconnected');
  });

  it('does not blame the VPN when it is off', () => {
    const snapshot = mockSnapshot();
    snapshot.vpn!.connected = false;
    const all = build({
      snapshot,
      security: computeScore(snapshot),
      speedHistory: speeds(300, [800, 820, 790]),
    });
    expect(all.find((s) => s.id === 'net-vpn-overhead')).toBeUndefined();
  });

  it('identifies the Wi-Fi link as the ceiling when speed approaches link rate', () => {
    const snapshot = mockSnapshot();
    snapshot.vpn!.connected = false;
    const detail = mockNetworkDetail();
    detail.adapters = [
      { name: 'Wi-Fi', description: 'Realtek WiFi', linkSpeed: '300 Mbps', wifi: true },
    ];
    const all = build({
      snapshot,
      security: computeScore(snapshot),
      detail,
      speedHistory: speeds(260, [800, 820, 790]),
    });
    const ceiling = all.find((s) => s.id === 'net-wifi-ceiling');
    expect(ceiling).toBeDefined();
    expect(ceiling!.steps.join(' ')).toMatch(/cable|5 GHz/i);
  });

  it('points past the router when the local link is far faster than the result', () => {
    const snapshot = mockSnapshot();
    snapshot.vpn!.connected = false;
    const detail = mockNetworkDetail();
    detail.adapters = [
      { name: 'Wi-Fi', description: 'Realtek WiFi', linkSpeed: '1.2 Gbps', wifi: true },
    ];
    const all = build({
      snapshot,
      security: computeScore(snapshot),
      detail,
      speedHistory: speeds(120, [800, 820, 790]),
    });
    expect(all.find((s) => s.id === 'net-upstream')).toBeDefined();
    expect(all.find((s) => s.id === 'net-wifi-ceiling')).toBeUndefined();
  });

  it('treats latency and packet loss as separate from throughput', () => {
    const all = build({
      probe: { latencyMs: 180, jitterMs: 30, lossPct: 20, dnsMs: 15, target: '1.1.1.1' },
      speedHistory: speeds(800, [800, 810, 790]), // speed is fine
    });
    expect(all.find((s) => s.id === 'net-latency')).toBeDefined();
    expect(all.find((s) => s.id === 'net-loss')).toBeDefined();
  });

  it('says nothing about speed when the latest result matches the baseline', () => {
    const all = build({ speedHistory: speeds(800, [800, 810, 790]) });
    expect(all.find((s) => s.id?.startsWith('net-vpn'))).toBeUndefined();
    expect(all.find((s) => s.id === 'net-slow-generic')).toBeUndefined();
  });
});

describe('system suggestions', () => {
  it('flags a failing drive as critical with backup first', () => {
    const hw = mockHardware();
    hw.physicalDisks = [
      { model: 'ACME SSD', media: 'SSD', health: 'Warning', bus: 'NVMe', sizeGb: 500 },
    ];
    const all = build({ hardware: hw });
    const disk = all.find((s) => s.id.startsWith('disk-health'));
    expect(disk?.severity).toBe('critical');
    expect(disk!.steps[0]).toMatch(/back ?up/i);
  });

  it('flags low storage with a settings deep link', () => {
    const perf = mockPerfOverview();
    perf.disks = [{ mount: 'C:\\', totalGb: 1000, freeGb: 40, kind: 'SSD' }];
    const all = build({ perf });
    const storage = all.find((s) => s.id.startsWith('storage-'));
    expect(storage).toBeDefined();
    expect(storage!.action?.target).toBe('storage');
  });

  it('does not report battery wear when the firmware cannot measure it', () => {
    const hw = mockHardware();
    hw.battery = { status: 2, chargePct: 100, healthPct: null };
    const all = build({ hardware: hw });
    expect(all.find((s) => s.id === 'battery-health')).toBeUndefined();
  });
});
