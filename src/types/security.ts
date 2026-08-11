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
  signatureAgeDays: number | null;
  signatureLastUpdated: string | null;
  quickScanEnd: string | null;
  quickScanAgeDays: number | null;
  fullScanEnd: string | null;
  fullScanAgeDays: number | null;
  runningMode: string;
  thirdPartyAv: string[];
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
  /** Servers with DoH actually enabled in Windows (not merely DoH-capable). */
  dohServers: string[];
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

export type EventSeverity = 'good' | 'info' | 'warn' | 'bad';

export interface TimelineEvent {
  id: number;
  ts: string;
  category: string;
  kind: string;
  severity: EventSeverity;
  message: string;
  detail: string | null;
  /** Change was detected on launch — it happened while Sentinel was closed. */
  afterGap: boolean;
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

// ── Performance ─────────────────────────────────────────

export interface PerfPoint {
  tsMs: number;
  cpuPct: number;
  memUsedMb: number;
  memTotalMb: number;
  rxBps: number;
  txBps: number;
  diskReadBps: number;
  diskWriteBps: number;
}

export interface ProcInfo {
  name: string;
  cpuPct: number;
  memMb: number;
  diskBps: number;
}

export interface DiskSpace {
  mount: string;
  totalGb: number;
  freeGb: number;
  kind: string;
}

export interface PerfOverview {
  sampledAt: string;
  cpuModel: string;
  logicalCores: number;
  cpuFreqMhz: number;
  cpuPct: number;
  perCorePct: number[];
  memTotalMb: number;
  memUsedMb: number;
  memAvailableMb: number;
  uptimeSecs: number;
  processCount: number;
  disks: DiskSpace[];
  topCpu: ProcInfo[];
  topMem: ProcInfo[];
  topDisk: ProcInfo[];
}

// ── Hardware ────────────────────────────────────────────

export interface GpuInfo {
  name: string;
  driver: string;
  vramMb: number | null;
}

export interface BatteryInfo {
  status: number;
  chargePct: number | null;
  healthPct: number | null;
}

export interface PhysicalDiskInfo {
  model: string;
  media: string;
  health: string;
  bus: string;
  sizeGb: number;
}

export interface HardwareInfo {
  gpus: GpuInfo[];
  battery: BatteryInfo | null;
  physicalDisks: PhysicalDiskInfo[];
}

// ── Network intelligence ────────────────────────────────

export interface AdapterInfo {
  name: string;
  description: string;
  linkSpeed: string;
  wifi: boolean;
}

export interface IpConfigInfo {
  interface: string;
  gateway: string;
  ipv4: string | null;
  ipv6: boolean;
}

export interface NetworkDetail {
  adapters: AdapterInfo[];
  configs: IpConfigInfo[];
}

export interface NetProbe {
  latencyMs: number | null;
  jitterMs: number | null;
  lossPct: number;
  dnsMs: number | null;
  target: string;
}

export interface SpeedTestRow {
  id: number;
  ts: string;
  downMbps: number;
  /** null when the upload leg didn't complete — never 0 as a sentinel. */
  upMbps: number | null;
  pingMs: number | null;
  jitterMs: number | null;
}

// ── Startup & diagnostics ───────────────────────────────

export interface StartupApp {
  name: string;
  command: string;
  location: string;
  publisher: string | null;
  enabled: boolean;
}

export interface CollectorStatus {
  name: string;
  lastSuccess: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastDurationMs: number | null;
  runs: number;
  failures: number;
}
