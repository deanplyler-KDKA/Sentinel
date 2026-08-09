import { describe, expect, it } from 'vitest';
import type { SecuritySnapshot } from '../../types/security';
import { mockSnapshot } from '../mock';
import { assessDns, bandFor, CHECKS, computeScore, activeThirdPartyAv } from '../score';

function healthy(): SecuritySnapshot {
  // The mock mirrors a healthy machine except Controlled Folder Access (off).
  return mockSnapshot();
}

describe('weights', () => {
  it('sum to exactly 100', () => {
    expect(CHECKS.reduce((s, c) => s + c.points, 0)).toBe(100);
  });
});

describe('computeScore', () => {
  it('scores the mock machine at 90 / Protected with nothing unknown', () => {
    const r = computeScore(healthy());
    expect(r.score).toBe(90);
    expect(r.band).toBe('Protected');
    expect(r.unknownPoints).toBe(0);
    expect(r.results.find((x) => x.id === 'cfa')?.state).toBe('fail');
  });

  it('treats a failed collector as unknown, never as passing', () => {
    const s = { ...healthy(), firewall: null };
    const r = computeScore(s);
    const fw = r.results.filter((x) => x.group === 'Firewall');
    expect(fw.every((x) => x.state === 'unknown' && x.earned === 0)).toBe(true);
    expect(r.unknownPoints).toBe(13);
  });

  it('never runs, definitions-wise, counts as failing', () => {
    const s = healthy();
    s.defender!.signatureAgeDays = null;
    expect(computeScore(s).results.find((x) => x.id === 'sig')?.state).toBe('fail');
  });
});

describe('bandFor', () => {
  it('maps the documented boundaries', () => {
    expect(bandFor(100)).toBe('Excellent');
    expect(bandFor(95)).toBe('Excellent');
    expect(bandFor(94)).toBe('Protected');
    expect(bandFor(85)).toBe('Protected');
    expect(bandFor(84)).toBe('Needs attention');
    expect(bandFor(70)).toBe('Needs attention');
    expect(bandFor(69)).toBe('At risk');
    expect(bandFor(50)).toBe('At risk');
    expect(bandFor(49)).toBe('Critical');
    expect(bandFor(0)).toBe('Critical');
  });
});

describe('assessDns', () => {
  it('uses the VPN tunnel DNS when connected', () => {
    const d = assessDns(healthy());
    expect(d.mode).toBe('vpn');
    expect(d.provider).toBe('NordVPN');
  });

  it('plain router DNS is unencrypted, even from a reputable resolver', () => {
    const s = healthy();
    s.vpn!.connected = false;
    s.network!.dns = [{ interface: 'Wi-Fi', servers: ['1.1.1.1'] }];
    const d = assessDns(s);
    expect(d.mode).toBe('plain');
    expect(computeScore(s).results.find((x) => x.id === 'dns')?.state).toBe('fail');
  });

  it('passes only when every active server has DoH enabled', () => {
    const s = healthy();
    s.vpn!.connected = false;
    s.network!.dns = [{ interface: 'Wi-Fi', servers: ['1.1.1.1', '1.0.0.1'] }];
    s.network!.dohServers = ['1.1.1.1', '1.0.0.1'];
    expect(assessDns(s).mode).toBe('doh');
    s.network!.dohServers = ['1.1.1.1'];
    expect(assessDns(s).mode).toBe('plain');
  });

  it('does not fall back to a disconnected adapter (captive portal)', () => {
    const s = healthy();
    s.vpn!.connected = false;
    s.network!.profiles = [
      { name: 'Airport WiFi', interface: 'Wi-Fi', category: 'Public', connected: false },
    ];
    s.network!.dns = [{ interface: 'vEthernet', servers: ['1.1.1.1'] }];
    const d = assessDns(s);
    expect(d.mode).toBe('none');
    expect(computeScore(s).results.find((x) => x.id === 'dns')?.state).toBe('unknown');
  });

  it('is unknown when the network collector failed', () => {
    expect(assessDns({ ...healthy(), network: null }).mode).toBe('unknown');
  });
});

describe('third-party AV', () => {
  it('counts a passive-mode third-party AV as protection', () => {
    const s = healthy();
    s.defender!.realTimeProtection = false;
    s.defender!.runningMode = 'SxS Passive Mode';
    s.defender!.thirdPartyAv = ['Acme Antivirus'];
    expect(activeThirdPartyAv(s)).toBe('Acme Antivirus');
    expect(computeScore(s).results.find((x) => x.id === 'rtp')?.state).toBe('pass');
  });

  it('fails when Defender is passive and no third-party AV is active', () => {
    const s = healthy();
    s.defender!.realTimeProtection = false;
    s.defender!.runningMode = 'SxS Passive Mode';
    s.defender!.thirdPartyAv = [];
    expect(activeThirdPartyAv(s)).toBeNull();
    expect(computeScore(s).results.find((x) => x.id === 'rtp')?.state).toBe('fail');
  });

  it('ignores registered products when Defender runs normally', () => {
    const s = healthy();
    s.defender!.thirdPartyAv = ['Acme Antivirus'];
    expect(activeThirdPartyAv(s)).toBeNull();
  });
});
