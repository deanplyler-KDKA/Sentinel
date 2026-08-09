import { useEffect, useState } from 'react';
import { getTimeline } from '../lib/api';
import type { TimelineEvent } from '../types/security';

interface Props {
  onClose: () => void;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function TimelinePanel({ onClose }: Props) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTimeline()
      .then(setEvents)
      .catch((e) => {
        setError(String(e));
        setEvents([]);
      });
  }, []);

  const groups: { label: string; items: TimelineEvent[] }[] = [];
  for (const ev of events ?? []) {
    const label = dayLabel(ev.ts);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(ev);
    else groups.push({ label, items: [ev] });
  }

  return (
    <div className="about-overlay" onClick={onClose}>
      <div className="about-panel timeline-panel" onClick={(e) => e.stopPropagation()}>
        <header className="about-header">
          <div>
            <h2>Security timeline</h2>
            <p className="about-version">What changed, and when Sentinel noticed</p>
          </div>
          <button className="about-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {events === null && <p className="timeline-empty">Loading…</p>}
        {error && <p className="timeline-empty">Couldn’t load the timeline: {error}</p>}
        {events !== null && !error && events.length === 0 && (
          <p className="timeline-empty">
            Nothing recorded yet. Sentinel adds an entry whenever your protection changes —
            definitions updates, VPN connects, network changes, settings turning on or off.
          </p>
        )}

        <div className="timeline-list">
          {groups.map((g) => (
            <section key={g.label}>
              <h3 className="timeline-day">{g.label}</h3>
              {g.items.map((ev) => (
                <div key={ev.id} className="timeline-row">
                  <span className="timeline-time">{timeLabel(ev.ts)}</span>
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
    </div>
  );
}
