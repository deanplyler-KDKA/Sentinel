import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { activeThirdPartyAv, assessDns } from '../lib/score';
import { relativeTime, timeOfDay } from '../lib/format';
import { ScoreRing } from '../components/ScoreRing';
import { SecurityCard } from '../components/SecurityCard';
import { DetailRow } from '../components/DetailRow';
import { Recommendations } from '../components/Recommendations';
import { FlameIcon, LockIcon, MonitorIcon, ShieldIcon, KeyIcon, GlobeIcon } from '../components/Icons';

function onOff(v: boolean, offTone: 'bad' | 'warn' = 'bad') {
  return { value: v ? 'On' : 'Off', tone: v ? ('good' as const) : (offTone as 'bad' | 'warn') };
}

export function Protect() {
  const { snapshot, security } = useStore();
  const report = security;
  const dns = useMemo(() => (snapshot ? assessDns(snapshot) : null), [snapshot]);

  if (!snapshot || !report) {
    return (
      <div>
        <header className="page-head"><div><h2>Protect</h2><p>Checking your protection…</p></div></header>
      </div>
    );
  }

  const { defender, firewall, system, vpn } = snapshot;
  const incomplete = snapshot.errors.length > 0 || report.results.some((r) => r.state === 'unknown');
  const thirdPartyAv = activeThirdPartyAv(snapshot);
  const updatesOk = report.results.find((r) => r.id === 'updates')?.state === 'pass';
  const dnsSecure = dns?.mode === 'vpn' || dns?.mode === 'doh';

  return (
    <div>
      <header className="page-head">
        <div>
          <h2>Protect</h2>
          <p>Protection is provided by Microsoft Defender and Windows — Sentinel watches it and never changes settings.</p>
        </div>
      </header>

      {snapshot.errors.length > 0 && (
        <div className="error-banner">
          Some checks couldn’t be read: {snapshot.errors.map((e) => e.source).join(', ')} — shown as
          “Unknown” and never counted as protected.
        </div>
      )}

      <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <ScoreRing score={report.score} band={report.band} incomplete={incomplete} />
          {report.unknownPoints > 0 && (
            <p className="small tone-warn">{report.unknownPoints} pts couldn’t be measured</p>
          )}
          <p className="faint small">Last checked {relativeTime(snapshot.collectedAt)}</p>
        </div>
        <div style={{ flex: 1, minWidth: 280 }}>
          <Recommendations results={report.results} />
        </div>
      </div>

      <div className="section-title">Protection detail</div>
      <div className="grid-3">
        <SecurityCard
          icon={<ShieldIcon />}
          title="Antivirus"
          subtitle={thirdPartyAv ?? 'Microsoft Defender'}
          state={defender ? ((defender.antivirusEnabled && defender.realTimeProtection) || thirdPartyAv ? 'ok' : 'bad') : 'unknown'}
        >
          {defender ? (
            thirdPartyAv ? (
              <>
                <DetailRow label="Active antivirus" value={thirdPartyAv} tone="good" />
                <DetailRow label="Microsoft Defender" value={defender.runningMode} />
                <p className="card-note">Defender is standing by in passive mode while {thirdPartyAv} handles protection.</p>
              </>
            ) : (
              <>
                <DetailRow label="Real-time protection" {...onOff(defender.realTimeProtection)} />
                <DetailRow label="Cloud protection" {...onOff(defender.cloudProtection, 'warn')} />
                <DetailRow label="Tamper protection" {...onOff(defender.tamperProtection, 'warn')} />
                <DetailRow label="Behavior monitoring" {...onOff(defender.behaviorMonitoring, 'warn')} />
                <DetailRow
                  label="Definitions"
                  value={defender.signatureAgeDays === null ? 'Never updated' : defender.signatureAgeDays <= 1 ? 'Current' : `${defender.signatureAgeDays} days old`}
                  tone={defender.signatureAgeDays !== null && defender.signatureAgeDays <= 1 ? 'good' : defender.signatureAgeDays === null ? 'bad' : 'warn'}
                />
                <DetailRow label="Last quick scan" value={timeOfDay(defender.quickScanEnd)} />
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
          stateLabel={firewall && firewall.private && firewall.public && firewall.domain ? 'All networks' : undefined}
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
            <p className="card-note">
              {defender.controlledFolderAccess
                ? 'Your documents and pictures are protected from unauthorized changes.'
                : 'Controlled Folder Access is off. Turning it on stops unknown apps from changing your protected files — find it in Windows Security → Virus & threat protection → Ransomware protection.'}
            </p>
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
              <DetailRow label="Secure Boot" value={system.secureBoot === null ? 'Unknown' : system.secureBoot ? 'On' : 'Off'} tone={system.secureBoot ? 'good' : system.secureBoot === null ? 'muted' : 'bad'} />
              <DetailRow
                label="Drive encryption"
                value={system.bitlocker === 'on' ? 'BitLocker on' : system.bitlocker === 'unknown' ? 'Unknown' : system.bitlocker}
                tone={system.bitlocker === 'on' ? 'good' : system.bitlocker === 'unknown' ? 'muted' : 'warn'}
              />
              <DetailRow label="Windows Update" value={system.rebootRequired ? 'Restart needed' : updatesOk ? 'Up to date' : 'Check for updates'} tone={updatesOk ? 'good' : 'warn'} />
              <DetailRow label="Last update installed" value={relativeTime(system.updateLastInstall)} />
              <DetailRow label="Version" value={`${system.displayVersion ?? ''} (${system.osVersion})`} />
            </>
          ) : (
            <p className="card-unknown">System status couldn’t be read.</p>
          )}
        </SecurityCard>

        <SecurityCard
          icon={<GlobeIcon />}
          title="Network protection"
          subtitle={dns?.mode === 'vpn' ? 'DNS through VPN tunnel' : 'DNS configuration'}
          state={snapshot.network ? (dnsSecure ? 'ok' : dns?.mode === 'plain' ? 'warn' : 'unknown') : 'unknown'}
          stateLabel={snapshot.network ? (dnsSecure ? 'Protected' : dns?.mode === 'plain' ? 'Standard' : 'Unknown') : undefined}
        >
          {dns ? (
            <>
              <DetailRow
                label="DNS"
                value={
                  dns.mode === 'vpn' ? `${dns.provider ?? 'VPN'} (through VPN tunnel)`
                    : dns.mode === 'doh' ? `${dns.provider ?? 'Encrypted'} (DNS over HTTPS)`
                      : dns.mode === 'plain' ? (dns.provider ? `${dns.provider} (unencrypted)` : 'Router default (unencrypted)')
                        : 'Can’t assess'
                }
                tone={dnsSecure ? 'good' : 'muted'}
              />
              <DetailRow label="Servers" value={dns.servers.join(', ') || '—'} />
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
              <DetailRow label="Background service" value={vpn.serviceRunning ? 'Running' : 'Stopped'} tone={vpn.serviceRunning ? 'good' : 'warn'} />
              <DetailRow label="Tunnel" value={vpn.connected ? `Connected (${vpn.adapter ?? 'active'})` : 'Not connected'} tone={vpn.connected ? 'good' : 'muted'} />
              <p className="card-note">A VPN is optional on trusted networks — it never lowers your score to leave it off.</p>
            </>
          ) : (
            <p className="card-unknown">VPN status couldn’t be read.</p>
          )}
        </SecurityCard>
      </div>
    </div>
  );
}
