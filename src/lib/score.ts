import type { SecuritySnapshot } from '../types/security';

// null = the underlying data couldn't be read: scores 0, shown as "Unknown".
type CheckState = boolean | null;

export interface Check {
  id: string;
  group: 'Antivirus' | 'Firewall' | 'System' | 'Network' | 'Ransomware';
  label: string;
  points: number;
  evaluate: (s: SecuritySnapshot) => CheckState;
  /** Plain-language suggestion shown when the check fails. */
  recommendation: string;
}

export interface CheckResult {
  id: string;
  group: Check['group'];
  label: string;
  points: number;
  earned: number;
  state: 'pass' | 'fail' | 'unknown';
  recommendation: string;
}

export type Band = 'Excellent' | 'Protected' | 'Needs attention' | 'At risk' | 'Critical';

export interface ScoreReport {
  score: number;
  band: Band;
  results: CheckResult[];
  /** Points that couldn't be measured — the headline must not read green-and-certain while these exist. */
  unknownPoints: number;
}

/** Display names for well-known resolvers (naming only — never used to award points). */
const PROVIDER_NAMES = new Map<string, string>([
  ['103.86.96.100', 'NordVPN'],
  ['103.86.99.100', 'NordVPN'],
  ['1.1.1.1', 'Cloudflare'],
  ['1.0.0.1', 'Cloudflare'],
  ['9.9.9.9', 'Quad9'],
  ['149.112.112.112', 'Quad9'],
  ['8.8.8.8', 'Google'],
  ['8.8.4.4', 'Google'],
  ['208.67.222.222', 'OpenDNS'],
  ['208.67.220.220', 'OpenDNS'],
  ['94.140.14.14', 'AdGuard'],
  ['94.140.15.15', 'AdGuard'],
]);

export type DnsMode =
  | 'vpn' // DNS rides the encrypted VPN tunnel
  | 'doh' // every active server has DoH enabled in Windows
  | 'plain' // resolvable but unencrypted (even if it's a reputable public resolver)
  | 'none' // no connected interface with DNS — can't assess (captive portal, offline)
  | 'unknown'; // network collector failed

export interface DnsAssessment {
  mode: DnsMode;
  servers: string[];
  provider: string | null;
}

/**
 * Assesses the DNS actually carrying queries. Deliberately no fallback to an
 * arbitrary adapter: if no connected interface has DNS (e.g. behind a captive
 * portal), the answer is "can't assess", never a stale virtual adapter's config.
 */
export function assessDns(s: SecuritySnapshot): DnsAssessment {
  const net = s.network;
  if (!net) return { mode: 'unknown', servers: [], provider: null };

  if (s.vpn?.connected) {
    const tunnel = net.dns.find((d) => /nordlynx|nordvpn/i.test(d.interface));
    if (tunnel && tunnel.servers.length > 0) {
      return { mode: 'vpn', servers: tunnel.servers, provider: nameFor(tunnel.servers) };
    }
  }

  const connected = new Set(net.profiles.filter((p) => p.connected).map((p) => p.interface));
  const servers = [
    ...new Set(net.dns.filter((d) => connected.has(d.interface)).flatMap((d) => d.servers)),
  ];
  if (servers.length === 0) return { mode: 'none', servers: [], provider: null };

  const doh = new Set(net.dohServers);
  const allDoh = servers.every((ip) => doh.has(ip));
  return { mode: allDoh ? 'doh' : 'plain', servers, provider: nameFor(servers) };
}

function nameFor(servers: string[]): string | null {
  for (const ip of servers) {
    const name = PROVIDER_NAMES.get(ip);
    if (name) return name;
  }
  return null;
}

function secureDns(s: SecuritySnapshot): CheckState {
  switch (assessDns(s).mode) {
    case 'vpn':
    case 'doh':
      return true;
    case 'plain':
      return false;
    default:
      return null;
  }
}

/** Defender in passive mode with a third-party AV registered = still protected. */
export function activeThirdPartyAv(s: SecuritySnapshot): string | null {
  const d = s.defender;
  if (!d) return null;
  if (/passive|sxs|edr/i.test(d.runningMode) && d.thirdPartyAv.length > 0) {
    return d.thirdPartyAv[0];
  }
  return null;
}

function windowsUpdated(s: SecuritySnapshot): CheckState {
  if (!s.system) return null;
  if (s.system.rebootRequired) return false;
  if (!s.system.updateLastInstall) return false;
  const ageDays = (Date.now() - Date.parse(s.system.updateLastInstall)) / 86_400_000;
  return ageDays <= 30;
}

// Weights sum to 100. Tune here and only here.
export const CHECKS: Check[] = [
  {
    id: 'rtp', group: 'Antivirus', label: 'Antivirus active', points: 25,
    evaluate: (s) =>
      s.defender &&
      ((s.defender.antivirusEnabled && s.defender.realTimeProtection) ||
        activeThirdPartyAv(s) !== null),
    recommendation: 'Turn on Real-time protection in Windows Security → Virus & threat protection settings.',
  },
  {
    id: 'cloud', group: 'Antivirus', label: 'Cloud-delivered protection', points: 5,
    // With a third-party AV active, Defender's cloud setting is moot — count
    // it as covered rather than nagging about a setting that can't apply.
    evaluate: (s) =>
      s.defender && (activeThirdPartyAv(s) !== null ? true : s.defender.cloudProtection),
    recommendation: 'Turn on Cloud-delivered protection in Windows Security for faster response to new threats.',
  },
  {
    id: 'tamper', group: 'Antivirus', label: 'Tamper protection', points: 5,
    evaluate: (s) => s.defender && s.defender.tamperProtection,
    recommendation: 'Turn on Tamper protection so malware can’t switch off your antivirus.',
  },
  {
    id: 'sig', group: 'Antivirus', label: 'Definitions up to date', points: 5,
    evaluate: (s) =>
      s.defender && s.defender.signatureAgeDays !== null && s.defender.signatureAgeDays <= 1,
    recommendation: 'Check for protection updates in Windows Security — your virus definitions are getting old.',
  },
  {
    id: 'fw-private', group: 'Firewall', label: 'Private network firewall', points: 5,
    evaluate: (s) => s.firewall && s.firewall.private,
    recommendation: 'Turn the firewall back on for Private networks in Windows Security → Firewall & network protection.',
  },
  {
    id: 'fw-public', group: 'Firewall', label: 'Public network firewall', points: 5,
    evaluate: (s) => s.firewall && s.firewall.public,
    recommendation: 'Turn the firewall back on for Public networks — this protects you on coffee-shop Wi-Fi.',
  },
  {
    id: 'fw-domain', group: 'Firewall', label: 'Domain network firewall', points: 3,
    evaluate: (s) => s.firewall && s.firewall.domain,
    recommendation: 'Turn the firewall back on for Domain networks.',
  },
  {
    id: 'secureboot', group: 'System', label: 'Secure Boot', points: 8,
    evaluate: (s) => (s.system ? s.system.secureBoot : null),
    recommendation: 'Enable Secure Boot in your PC’s UEFI settings to block boot-level malware.',
  },
  {
    id: 'bitlocker', group: 'System', label: 'Drive encryption (BitLocker)', points: 8,
    evaluate: (s) => (s.system ? (s.system.bitlocker === 'unknown' ? null : s.system.bitlocker === 'on') : null),
    recommendation: 'Turn on BitLocker (Settings → Privacy & security → Device encryption) so your files are safe if the PC is lost or stolen.',
  },
  {
    id: 'updates', group: 'System', label: 'Windows up to date', points: 10,
    evaluate: windowsUpdated,
    recommendation: 'Open Windows Update and install pending updates (restart if one is waiting).',
  },
  {
    id: 'dns', group: 'Network', label: 'Encrypted DNS', points: 5,
    evaluate: secureDns,
    recommendation: 'Your DNS lookups travel unencrypted. Connect your VPN, or turn on DNS over HTTPS (Settings → Network & internet → Wi-Fi → DNS server assignment → Encrypted).',
  },
  {
    id: 'vpn-installed', group: 'Network', label: 'VPN available', points: 3,
    evaluate: (s) => s.vpn && s.vpn.installed,
    recommendation: 'Install a VPN for privacy on untrusted networks.',
  },
  {
    id: 'vpn-connected', group: 'Network', label: 'VPN connected', points: 3,
    evaluate: (s) => s.vpn && s.vpn.connected,
    recommendation: 'Connect NordVPN to encrypt your traffic.',
  },
  {
    id: 'cfa', group: 'Ransomware', label: 'Ransomware protection', points: 10,
    evaluate: (s) => s.defender && s.defender.controlledFolderAccess,
    recommendation: 'Turn on Controlled folder access (Windows Security → Virus & threat protection → Ransomware protection) to stop unauthorized apps changing your documents.',
  },
];

export function bandFor(score: number): Band {
  if (score >= 95) return 'Excellent';
  if (score >= 85) return 'Protected';
  if (score >= 70) return 'Needs attention';
  if (score >= 50) return 'At risk';
  return 'Critical';
}

export function computeScore(s: SecuritySnapshot): ScoreReport {
  const results: CheckResult[] = CHECKS.map((c) => {
    const value = c.evaluate(s);
    const state = value === null ? 'unknown' : value ? 'pass' : 'fail';
    return {
      id: c.id,
      group: c.group,
      label: c.label,
      points: c.points,
      earned: value ? c.points : 0,
      state,
      recommendation: c.recommendation,
    };
  });
  const score = results.reduce((sum, r) => sum + r.earned, 0);
  const unknownPoints = results
    .filter((r) => r.state === 'unknown')
    .reduce((sum, r) => sum + r.points, 0);
  return { score, band: bandFor(score), results, unknownPoints };
}
