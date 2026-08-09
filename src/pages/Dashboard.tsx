import { useCallback, useEffect, useMemo, useState } from 'react';
import { AboutPanel } from '../components/AboutPanel';
import { getSecuritySnapshot, isTauri } from '../lib/api';
import { activeThirdPartyAv, assessDns, computeScore } from '../lib/score';
import { relativeTime, timeOfDay, uptimeSince } from '../lib/format';
import type { SecuritySnapshot } from '../types/security';
import { ScoreRing } from '../components/ScoreRing';
import { SecurityCard } from '../components/SecurityCard';
import { DetailRow } from '../components/DetailRow';
import { Recommendations } from '../components/Recommendations';
import { StatusPill, type PillState } from '../components/StatusPill';
import {
  FlameIcon,
  GlobeIcon,
  KeyIcon,
  LockIcon,
  MonitorIcon,
  RefreshIcon,
  SentinelMark,
  ShieldIcon,
} from '../components/Icons';

const REFRESH_INTERVAL_MS = 60_000;

function onOff(v: boolean, offTone: 'bad' | 'warn' = 'bad') {
  return { value: v ? 'On' : 'Off', tone: v ? ('good' as const) : (offTone as 'bad' | 'warn') };
}

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<SecuritySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await getSecuritySnapshot());
      setLoadError(null);
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const report = useMemo(() => (snapshot ? computeScore(snapshot) : null), [snapshot]);

  if (!snapshot || !report) {
    return (
      <div className="boot-screen">
        <div className="boot-mark"><SentinelMark size={44} /></div>
        <h1>Sentinel</h1>
        <p>{loadError ? `Couldn’t read security status: ${loadError}` : 'Checking your protection…'}</p>
      </div>
    );
  }

  const { defender, firewall, system, network, vpn } = snapshot;
  // Fail closed on the headline: if anything couldn't be measured, the
  // at-a-glance verdict must not read as green-and-certain.
  const incomplete =
    snapshot.errors.length > 0 || report.results.some((r) => r.state === 'unknown');
  const overall: PillState = incomplete
    ? 'warn'
    : report.band === 'Excellent' || report.band === 'Protected'
      ? 'ok'
      : report.band === 'Needs attention'
        ? 'warn'
        : 'bad';
  const overallLabel = incomplete ? 'Incomplete' : report.band;

  const dns = assessDns(snapshot);
  const dnsSecure = dns.mode === 'vpn' || dns.mode === 'doh';
  const thirdPartyAv = activeThirdPartyAv(snapshot);
  const activeProfile = network?.profiles.find((p) => p.connected && !/nordlynx|nordvpn/i.test(p.interface))
    ?? network?.profiles[0];
  const updatesOk = report.results.find((r) => r.id === 'updates')?.state === 'pass';

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><SentinelMark size={24} /></div>
          <div>
            <h1>SENTINEL</h1>
            <p>Personal Security Center</p>
          </div>
        </div>
        <div className="topbar-right">
          {!isTauri && <span className="mock-badge">Preview data</span>}
          <StatusPill state={overall} label={overallLabel} />
          <button className="refresh-btn" onClick={refresh} disabled={loading} title="Refresh now">
            <RefreshIcon />
            {loading ? 'Checking…' : 'Refresh'}
          </button>
          <button className="refresh-btn" onClick={() => setShowAbout(true)} title="About Sentinel">
            About
          </button>
        </div>
      </header>
      {showAbout && <AboutPanel onClose={() => setShowAbout(false)} />}

      {snapshot.errors.length > 0 && (
        <div className="error-banner">
          Some checks couldn’t be read:{' '}
          {snapshot.errors.map((e) => `${e.source} (${e.message})`).join('; ')} — they’re shown as
          “Unknown” and don’t count toward your score.
        </div>
      )}

      <section className="hero">
        <div className="hero-score">
          <ScoreRing score={report.score} band={report.band} incomplete={incomplete} />
          {report.unknownPoints > 0 && (
            <p className="hero-unmeasured">{report.unknownPoints} pts couldn’t be measured</p>
          )}
          <p className="hero-checked">Last checked {relativeTime(snapshot.collectedAt)}</p>
        </div>
        <Recommendations results={report.results} />
      </section>

      <div className="card-grid">
        <SecurityCard
          icon={<ShieldIcon />}
          title="Antivirus"
          subtitle={thirdPartyAv ?? 'Microsoft Defender'}
          state={
            defender
              ? (defender.antivirusEnabled && defender.realTimeProtection) || thirdPartyAv
                ? 'ok'
                : 'bad'
              : 'unknown'
          }
        >
          {defender ? (
            thirdPartyAv ? (
              <>
                <DetailRow label="Active antivirus" value={thirdPartyAv} tone="good" />
                <DetailRow label="Microsoft Defender" value={defender.runningMode} />
                <p className="card-note">
                  Defender is standing by in passive mode while {thirdPartyAv} handles protection.
                </p>
              </>
            ) : (
              <>
                <DetailRow label="Real-time protection" {...onOff(defender.realTimeProtection)} />
                <DetailRow label="Cloud protection" {...onOff(defender.cloudProtection, 'warn')} />
                <DetailRow label="Tamper protection" {...onOff(defender.tamperProtection, 'warn')} />
                <DetailRow label="Behavior monitoring" {...onOff(defender.behaviorMonitoring, 'warn')} />
                <DetailRow
                  label="Definitions"
                  value={
                    defender.signatureAgeDays === null
                      ? 'Never updated'
                      : defender.signatureAgeDays <= 1
                        ? 'Current'
                        : `${defender.signatureAgeDays} days old`
                  }
                  tone={
                    defender.signatureAgeDays !== null && defender.signatureAgeDays <= 1
                      ? 'good'
                      : defender.signatureAgeDays === null
                        ? 'bad'
                        : 'warn'
                  }
                />
                <DetailRow label="Version" value={defender.signatureVersion} />
                <DetailRow label="Last quick scan" value={timeOfDay(defender.quickScanEnd)} />
                {defender.runningMode !== 'Normal' && (
                  <DetailRow label="Mode" value={defender.runningMode} tone="warn" />
                )}
              </>
            )
          ) : (
            <p className="card-unknown">Defender status couldn’t be read.</p>
          )}
        </SecurityCard>

        <SecurityCard
          icon={<FlameIcon />}
          title="Firewall"
          subtitle="Windows Firewall"
          state={firewall ? (firewall.private && firewall.public && firewall.domain ? 'ok' : firewall.private || firewall.public ? 'warn' : 'bad') : 'unknown'}
          stateLabel={firewall ? (firewall.private && firewall.public && firewall.domain ? 'All networks' : undefined) : undefined}
        >
          {firewall ? (
            <>
              <DetailRow label="Private networks" {...onOff(firewall.private)} />
              <DetailRow label="Public networks" {...onOff(firewall.public)} />
              <DetailRow label="Domain networks" {...onOff(firewall.domain, 'warn')} />
            </>
          ) : (
            <p className="card-unknown">Firewall status couldn’t be read.</p>
          )}
        </SecurityCard>

        <SecurityCard
          icon={<LockIcon />}
          title="Ransomware"
          subtitle="Controlled Folder Access"
          state={defender ? (defender.controlledFolderAccess ? 'ok' : 'warn') : 'unknown'}
          stateLabel={defender ? (defender.controlledFolderAccess ? 'Enabled' : 'Off') : undefined}
        >
          {defender ? (
            defender.controlledFolderAccess ? (
              <p className="card-note">
                Your documents and pictures are protected from unauthorized changes.
              </p>
            ) : (
              <p className="card-note">
                Controlled Folder Access is off. Turning it on stops unknown apps from changing your
                protected files — find it in Windows Security → Virus &amp; threat protection →
                Ransomware protection.
              </p>
            )
          ) : (
            <p className="card-unknown">Ransomware protection status couldn’t be read.</p>
          )}
        </SecurityCard>

        <SecurityCard
          icon={<MonitorIcon />}
          title="System Security"
          subtitle={system ? system.osName.replace('Microsoft ', '') : 'Windows'}
          state={system ? (system.secureBoot && system.bitlocker === 'on' && updatesOk ? 'ok' : 'warn') : 'unknown'}
        >
          {system ? (
            <>
              <DetailRow
                label="Secure Boot"
                value={system.secureBoot === null ? 'Unknown' : system.secureBoot ? 'On' : 'Off'}
                tone={system.secureBoot ? 'good' : system.secureBoot === null ? 'muted' : 'bad'}
              />
              <DetailRow
                label="Drive encryption"
                value={
                  system.bitlocker === 'on' ? 'BitLocker on'
                    : system.bitlocker === 'suspended' ? 'Suspended'
                    : system.bitlocker === 'encrypting' ? 'Encrypting…'
                    : system.bitlocker === 'unknown' ? 'Unknown'
                    : 'Off'
                }
                tone={system.bitlocker === 'on' ? 'good' : system.bitlocker === 'unknown' ? 'muted' : 'warn'}
              />
              <DetailRow
                label="Windows Update"
                value={system.rebootRequired ? 'Restart needed' : updatesOk ? 'Up to date' : 'Check for updates'}
                tone={updatesOk ? 'good' : 'warn'}
              />
              <DetailRow label="Last update installed" value={relativeTime(system.updateLastInstall)} />
              <DetailRow label="Version" value={`${system.displayVersion ?? ''} (${system.osVersion})`} />
              <DetailRow label="Device" value={system.computerName} />
              <DetailRow label="Uptime" value={uptimeSince(system.lastBoot)} />
            </>
          ) : (
            <p className="card-unknown">System status couldn’t be read.</p>
          )}
        </SecurityCard>

        <SecurityCard
          icon={<GlobeIcon />}
          title="Network"
          subtitle={activeProfile ? activeProfile.name : 'No network'}
          state={network ? (dnsSecure ? 'ok' : dns.mode === 'plain' ? 'warn' : 'unknown') : 'unknown'}
          stateLabel={network ? (dnsSecure ? 'Protected' : dns.mode === 'plain' ? 'Standard' : 'Unknown') : undefined}
        >
          {network ? (
            <>
              <DetailRow
                label="Profile"
                value={activeProfile ? (activeProfile.category === 'Private' ? 'Private network' : `${activeProfile.category} network`) : '—'}
                tone={activeProfile?.category === 'Private' ? 'good' : 'muted'}
              />
              <DetailRow
                label="DNS"
                value={
                  dns.mode === 'vpn'
                    ? `${dns.provider ?? 'VPN'} (through VPN tunnel)`
                    : dns.mode === 'doh'
                      ? `${dns.provider ?? 'Encrypted'} (DNS over HTTPS)`
                      : dns.mode === 'plain'
                        ? dns.provider
                          ? `${dns.provider} (unencrypted)`
                          : 'Router default (unencrypted)'
                        : 'Can’t assess'
                }
                tone={dnsSecure ? 'good' : dns.mode === 'plain' ? 'warn' : 'muted'}
              />
              <DetailRow label="DNS servers" value={dns.servers.join(', ') || '—'} />
            </>
          ) : (
            <p className="card-unknown">Network status couldn’t be read.</p>
          )}
        </SecurityCard>

        <SecurityCard
          icon={<KeyIcon />}
          title="VPN"
          subtitle="NordVPN"
          state={vpn ? (vpn.connected ? 'ok' : vpn.installed ? 'warn' : 'unknown') : 'unknown'}
          stateLabel={vpn ? (vpn.connected ? 'Connected' : vpn.installed ? 'Not connected' : 'Not installed') : undefined}
        >
          {vpn ? (
            <>
              <DetailRow label="Installed" value={vpn.installed ? 'Yes' : 'No'} tone={vpn.installed ? 'good' : 'warn'} />
              <DetailRow
                label="Background service"
                value={vpn.serviceRunning ? 'Running' : 'Stopped'}
                tone={vpn.serviceRunning ? 'good' : 'warn'}
              />
              <DetailRow label="App" value={vpn.appRunning ? 'Running' : 'Not running'} />
              <DetailRow
                label="Tunnel"
                value={vpn.connected ? `Connected (${vpn.adapter ?? 'active'})` : 'Not connected'}
                tone={vpn.connected ? 'good' : 'warn'}
              />
            </>
          ) : (
            <p className="card-unknown">VPN status couldn’t be read.</p>
          )}
        </SecurityCard>
      </div>

      <footer className="footer">
        Sentinel is read-only: it watches your protection but never changes settings. Microsoft
        Defender and Windows handle the protection itself.
      </footer>
    </div>
  );
}
