export function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return 'Unknown';
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

export function timeOfDay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString()} ${time}`;
}
