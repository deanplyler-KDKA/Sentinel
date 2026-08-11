interface Props {
  label: string;
  score: number | null;
  /** Short status word shown under the label (Excellent, Healthy, …). */
  state: string;
  tone: 'good' | 'warn' | 'bad' | 'muted';
}

const TONE_VAR: Record<Props['tone'], string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  muted: 'var(--text-faint)',
};

/** Compact score ring for the dashboard hero row. */
export function ScoreDial({ label, score, state, tone }: Props) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const filled = score === null ? 0 : (score / 100) * c;
  const color = TONE_VAR[tone];
  return (
    <div className="dial" role="img" aria-label={`${label}: ${score ?? 'checking'} — ${state}`}>
      <div className="dial-ring">
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="var(--chart-grid)" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c - filled}`}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <div className="dial-num">{score ?? '–'}</div>
      </div>
      <div className="dial-meta">
        <div className="dial-label">{label}</div>
        <div className="dial-state" style={{ color }}>{state}</div>
      </div>
    </div>
  );
}
