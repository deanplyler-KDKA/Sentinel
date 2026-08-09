// Mirrors src-tauri/src/models.rs — keep the two in sync (docs/CLAUDE.md).

export interface DefenderStatus {
  antivirusEnabled: boolean;
  realTimeProtection: boolean;
  behaviorMonitoring: boolean;
  tamperProtection: boolean;
  cloudProtection: boolean;
  puaProtection: boolean;
  controlledFolderAccess: boolean;
  signatureVersion: string;
  signatureAgeDays: number;
  signatureLastUpdated: string | null;
  quickScanEnd: string | null;
  quickScanAgeDays: number | null;
  fullScanEnd: string | null;
  fullScanAgeDays: number | null;
  runningMode: string;
}

export interface FirewallStatus {
  domain: boolean;
  private: boolean;
  public: boolean;
}

export type BitLockerState =
  | 'on'
  | 'off'
  | 'encrypting'
  | 'decrypting'
  | 'suspended'
  | 'locked'
  | 'unknown';

export interface SystemStatus {
  osName: string;
  osVersion: string;
  displayVersion: string | null;
  computerName: string;
  lastBoot: string;
  secureBoot: boolean | null;
  bitlocker: BitLockerState;
  updateLastSearch: string | null;
  updateLastInstall: string | null;
  rebootRequired: boolean;
}

export interface NetworkProfile {
  name: string;
  interface: string;
  category: string;
  connected: boolean;
}

export interface DnsEntry {
  interface: string;
  servers: string[];
}

export interface NetworkStatus {
  profiles: NetworkProfile[];
  dns: DnsEntry[];
}

export interface VpnStatus {
  installed: boolean;
  serviceRunning: boolean;
  appRunning: boolean;
  connected: boolean;
  adapter: string | null;
}

export interface CollectorError {
  source: string;
  message: string;
}

export interface SecuritySnapshot {
  collectedAt: string;
  defender: DefenderStatus | null;
  firewall: FirewallStatus | null;
  system: SystemStatus | null;
  network: NetworkStatus | null;
  vpn: VpnStatus | null;
  errors: CollectorError[];
}
