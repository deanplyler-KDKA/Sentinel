import type {
  HardwareInfo,
  NetProbe,
  NetworkDetail,
  PerfOverview,
  PerfPoint,
  SecuritySnapshot,
  SpeedTestRow,
  StartupApp,
  TimelineEvent,
} from '../types/security';

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

// Browser-preview-only fixtures below: inside Tauri these are never used.

export function mockPerfOverview(): PerfOverview {
  return {
    sampledAt: new Date().toISOString(),
    cpuModel: 'Intel Core i7-1355U',
    logicalCores: 12,
    cpuFreqMhz: 2611,
    cpuPct: 15.2,
    perCorePct: Array.from({ length: 12 }, (_, i) => 8 + ((i * 7) % 25)),
    memTotalMb: 16049,
    memUsedMb: 9821,
    memAvailableMb: 6228,
    uptimeSecs: 171_000,
    processCount: 284,
    disks: [{ mount: 'C:\\', totalGb: 1023.7, freeGb: 612.4, kind: 'SSD' }],
    topCpu: [
      { name: 'chrome.exe', cpuPct: 6.1, memMb: 2210, diskBps: 12000 },
      { name: 'sentinel.exe', cpuPct: 0.4, memMb: 96, diskBps: 0 },
    ],
    topMem: [
      { name: 'chrome.exe', cpuPct: 6.1, memMb: 2210, diskBps: 12000 },
      { name: 'Code.exe', cpuPct: 1.2, memMb: 1150, diskBps: 4000 },
    ],
    topDisk: [{ name: 'MsMpEng.exe', cpuPct: 0.8, memMb: 310, diskBps: 950_000 }],
  };
}

export function mockPerfSeries(): PerfPoint[] {
  const now = Date.now();
  return Array.from({ length: 150 }, (_, i) => ({
    tsMs: now - (150 - i) * 2000,
    cpuPct: 10 + 8 * Math.abs(Math.sin(i / 9)),
    memUsedMb: 9600 + 300 * Math.sin(i / 25),
    memTotalMb: 16049,
    rxBps: 250_000 + 200_000 * Math.abs(Math.sin(i / 6)),
    txBps: 40_000 + 30_000 * Math.abs(Math.cos(i / 7)),
    diskReadBps: 100_000 * Math.abs(Math.sin(i / 11)),
    diskWriteBps: 220_000 * Math.abs(Math.cos(i / 13)),
  }));
}

export function mockHardware(): HardwareInfo {
  return {
    gpus: [{ name: 'Intel(R) Graphics', driver: '32.0.101.7026', vramMb: 2048 }],
    battery: { status: 2, chargePct: 100, healthPct: null },
    physicalDisks: [
      { model: 'KIOXIA NVMe SSD', media: 'SSD', health: 'Healthy', bus: 'NVMe', sizeGb: 954 },
    ],
  };
}

export function mockNetworkDetail(): NetworkDetail {
  return {
    adapters: [
      { name: 'Wi-Fi', description: 'Realtek WiFi 6 PCI-E NIC', linkSpeed: '1.2 Gbps', wifi: true },
      { name: 'NordLynx', description: 'NordLynx Tunnel', linkSpeed: '100 Gbps', wifi: false },
    ],
    configs: [
      { interface: 'Wi-Fi', gateway: '192.168.68.1', ipv4: '192.168.68.64', ipv6: true },
      { interface: 'NordLynx', gateway: '10.5.0.1', ipv4: '10.5.0.2', ipv6: false },
    ],
  };
}

export function mockProbe(): NetProbe {
  return { latencyMs: 18.4, jitterMs: 2.1, lossPct: 0, dnsMs: 12.0, target: '1.1.1.1' };
}

export function mockSpeedTests(): SpeedTestRow[] {
  const now = Date.now();
  const at = (d: number) => new Date(now - d * 86_400_000).toISOString();
  return [
    { id: 5, ts: at(0), downMbps: 418.2, upMbps: 41.5, pingMs: 19.2, jitterMs: 2.4 },
    { id: 4, ts: at(2), downMbps: 802.1, upMbps: 44.0, pingMs: 17.8, jitterMs: 1.9 },
    { id: 3, ts: at(9), downMbps: 780.5, upMbps: 42.2, pingMs: 18.5, jitterMs: 2.2 },
    { id: 2, ts: at(16), downMbps: 795.0, upMbps: 43.1, pingMs: 18.0, jitterMs: 2.0 },
    { id: 1, ts: at(25), downMbps: 810.3, upMbps: 44.8, pingMs: 17.5, jitterMs: 1.8 },
  ];
}

export function mockStartupApps(): StartupApp[] {
  return [
    { name: 'OneDrive', command: 'OneDrive.exe /background', location: 'HKCU Run', publisher: 'Microsoft Corporation', enabled: true },
    { name: 'Discord', command: 'Update.exe --processStart Discord.exe', location: 'HKCU Run', publisher: 'Discord Inc.', enabled: false },
  ];
}
