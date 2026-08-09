import type { SecuritySnapshot } from '../types/security';

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
