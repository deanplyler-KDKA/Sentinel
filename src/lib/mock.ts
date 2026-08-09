import type { SecuritySnapshot, TimelineEvent } from '../types/security';

// Used only when running in a plain browser (npm run dev without Tauri),
// so UI work doesn't require the Rust build. Mirrors a realistic Windows 11 PC.
export function mockSnapshot(): SecuritySnapshot {
  const now = Date.now();
  const hours = (n: number) => new Date(now - n * 3_600_000).toISOString();
  return {
    collectedAt: new Date(now).toISOString(),
    defender: {
      antivirusEnabled: true,
      realTimeProtection: true,
      behaviorMonitoring: true,
      tamperProtection: true,
      cloudProtection: true,
      puaProtection: true,
      controlledFolderAccess: false,
      signatureVersion: '1.457.77.0',
      signatureAgeDays: 0,
      signatureLastUpdated: hours(5),
      quickScanEnd: hours(1),
      quickScanAgeDays: 0,
      fullScanEnd: null,
      fullScanAgeDays: null,
      runningMode: 'Normal',
      thirdPartyAv: [],
    },
    firewall: { domain: true, private: true, public: true },
    system: {
      osName: 'Microsoft Windows 11 Home',
      osVersion: '10.0.26200',
      displayVersion: '25H2',
      computerName: 'DEAN-OMNI',
      lastBoot: hours(47),
      secureBoot: true,
      bitlocker: 'on',
      updateLastSearch: hours(2),
      updateLastInstall: hours(9),
      rebootRequired: false,
    },
    network: {
      profiles: [
        { name: 'NordLynx', interface: 'NordLynx', category: 'Public', connected: true },
        { name: 'Home Wi-Fi', interface: 'Wi-Fi', category: 'Private', connected: true },
      ],
      dns: [
        { interface: 'NordLynx', servers: ['103.86.96.100', '103.86.99.100'] },
        { interface: 'Wi-Fi', servers: ['192.168.0.1'] },
      ],
      dohServers: [],
    },
    vpn: {
      installed: true,
      serviceRunning: true,
      appRunning: true,
      connected: true,
      adapter: 'NordLynx',
    },
    errors: [],
  };
}

export function mockTimeline(): TimelineEvent[] {
  const now = Date.now();
  const hours = (n: number) => new Date(now - n * 3_600_000).toISOString();
  const ev = (
    id: number,
    ts: string,
    severity: TimelineEvent['severity'],
    category: string,
    kind: string,
    message: string,
    detail: string | null = null,
    afterGap = false,
  ): TimelineEvent => ({ id, ts, severity, category, kind, message, detail, afterGap });
  return [
    ev(8, hours(0.2), 'good', 'defender', 'definitions', 'Defender definitions updated', 'Version 1.457.77.0'),
    ev(7, hours(1.5), 'good', 'vpn', 'vpn-connected', 'NordVPN connected', 'NordLynx'),
    ev(6, hours(3), 'good', 'defender', 'quick-scan', 'Quick scan completed'),
    ev(5, hours(5), 'warn', 'network', 'network-changed', 'Connected to a different network', 'Coffee Shop WiFi (Public network)'),
    ev(4, hours(6), 'info', 'app', 'monitor-start', 'Sentinel started monitoring'),
    ev(3, hours(26), 'good', 'system', 'windows-update', 'Windows update installed', null, true),
    ev(2, hours(28), 'info', 'vpn', 'vpn-disconnected', 'NordVPN disconnected'),
    ev(1, hours(30), 'warn', 'ransomware', 'cfa', 'Ransomware protection turned off'),
  ];
}
