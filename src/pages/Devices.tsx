import { useStore } from '../lib/store';
import { formatUptime } from '../lib/format';
import { DetailRow } from '../components/DetailRow';
import { DevicesIcon } from '../components/Icons';

export function Devices() {
  const { snapshot, perf, overall, security, pcHealth } = useStore();
  const sys = snapshot?.system ?? null;

  return (
    <div>
      <header className="page-head">
        <div>
          <h2>Devices</h2>
          <p>This PC today — household devices arrive in a future release.</p>
        </div>
      </header>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-icon icon-neutral"><DevicesIcon /></div>
            <div className="card-titles">
              <h3>{sys?.computerName ?? 'This PC'}</h3>
              <p className="card-subtitle">{sys ? `${sys.osName.replace('Microsoft ', '')} ${sys.displayVersion ?? ''}` : 'Checking…'}</p>
            </div>
          </div>
          <DetailRow label="Overall" value={overall.state} tone={overall.state === 'Excellent' || overall.state === 'Healthy' ? 'good' : 'warn'} />
          <DetailRow label="Security score" value={security ? `${security.score}/100` : '…'} />
          <DetailRow label="PC Health score" value={pcHealth ? `${pcHealth.score}/100` : '…'} />
          <DetailRow label="Uptime" value={perf ? formatUptime(perf.uptimeSecs) : '…'} />
          <DetailRow label="Processor" value={perf?.cpuModel ?? '…'} />
        </div>
        <div className="card">
          <div className="card-titles"><h3>Household dashboard</h3></div>
          <p className="card-note">
            A future release will let other computers in your home run a small Sentinel agent and
            report their health here — scores, updates, and protection status for every device,
            entirely on your local network. Nothing is built into this version yet, and when it
            arrives it will be strictly opt-in.
          </p>
        </div>
      </div>
    </div>
  );
}
