export function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - Date.parse(iso);
  // A future timestamp means clock skew or a bad source — say so, don't say "Just now".
  if (Number.isNaN(ms) || ms < 0) return 'Unknown';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export function uptimeSince(bootIso: string): string {
  const ms = Date.now() - Date.parse(bootIso);
  if (Number.isNaN(ms) || ms < 0) return 'Unknown';
  const hrs = Math.floor(ms / 3_600_000);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}, ${hrs % 24} hr`;
  const mins = Math.floor(ms / 60_000);
  if (hrs > 0) return `${hrs} hr ${mins % 60} min`;
  return `${mins} min`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} GB`.replace(' GB', ' MB');
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function formatBps(bps: number): string {
  const bits = bps * 8;
  if (bits < 1e6) return `${(bits / 1e3).toFixed(0)} Kbps`;
  if (bits < 1e9) return `${(bits / 1e6).toFixed(1)} Mbps`;
  return `${(bits / 1e9).toFixed(2)} Gbps`;
}

export function formatGb(gb: number): string {
  return gb >= 1000 ? `${(gb / 1000).toFixed(2)} TB` : `${gb.toFixed(0)} GB`;
}

export function formatUptime(secs: number): string {
  const days = Math.floor(secs / 86_400);
  const hrs = Math.floor((secs % 86_400) / 3600);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}, ${hrs} hr`;
  const mins = Math.floor((secs % 3600) / 60);
  return hrs > 0 ? `${hrs} hr ${mins} min` : `${mins} min`;
}

export function timeOfDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString()} ${time}`;
}
