import { useEffect, useMemo, useState } from 'react';
import { getTimeline } from '../lib/api';
import type { TimelineEvent } from '../types/security';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'security', label: 'Security', categories: ['defender', 'firewall', 'ransomware'] },
  { id: 'network', label: 'Network', categories: ['network', 'vpn'] },
  { id: 'system', label: 'System', categories: ['system', 'app'] },
] as const;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export function HistoryPage() {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');

  useEffect(() => {
    getTimeline()
      .then(setEvents)
      .catch((e) => {
        setError(String(e));
        setEvents([]);
      });
  }, []);

  const filtered = useMemo(() => {
    if (!events) return [];
    const def = FILTERS.find((f) => f.id === filter);
    if (!def || filter === 'all') return events;
    const cats: readonly string[] = 'categories' in def ? def.categories : [];
    return events.filter((e) => cats.includes(e.category));
  }, [events, filter]);

  const groups: { label: string; items: TimelineEvent[] }[] = [];
  for (const ev of filtered) {
    const label = dayLabel(ev.ts);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(ev);
    else groups.push({ label, items: [ev] });
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h2>History</h2>
          <p>Meaningful changes only — stored locally, nothing leaves this PC.</p>
        </div>
      </header>

      <div className="filter-row">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip${filter === f.id ? ' active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {events === null && <p className="timeline-empty">Loading…</p>}
      {error && <p className="timeline-empty">Couldn’t load history: {error}</p>}
      {events !== null && !error && filtered.length === 0 && (
        <p className="timeline-empty">
          Nothing recorded {filter === 'all' ? 'yet' : 'in this category yet'}. Sentinel adds an entry
          whenever your protection or system state meaningfully changes.
        </p>
      )}

      <div className="timeline-list">
        {groups.map((g) => (
          <section key={g.label}>
            <h3 className="timeline-day">{g.label}</h3>
            {g.items.map((ev) => (
              <div key={ev.id} className="timeline-row">
                <span className="timeline-time">
                  {new Date(ev.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
                <span className={`timeline-dot dot-${ev.severity}`} />
                <div className="timeline-body">
                  <span className="timeline-message">
                    {ev.message}
                    {ev.afterGap && <span className="timeline-gap">while Sentinel was closed</span>}
                  </span>
                  {ev.detail && <span className="timeline-detail">{ev.detail}</span>}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
