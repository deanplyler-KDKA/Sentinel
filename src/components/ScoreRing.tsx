import type { Band } from '../lib/score';

interface Props {
  score: number;
  band: Band;
  /** True when some checks couldn't be measured — the band text must not read green-and-certain. */
  incomplete?: boolean;
}

const BAND_COLORS: Record<Band, string> = {
  Excellent: 'var(--good)',
  Protected: 'var(--good)',
  'Needs attention': 'var(--warn)',
  'At risk': 'var(--orange)',
  Critical: 'var(--bad)',
};

export function ScoreRing({ score, band, incomplete = false }: Props) {
  const r = 84;
  const c = 2 * Math.PI * r;
  const filled = (score / 100) * c;
  const color = BAND_COLORS[band];
  const label = incomplete ? 'Incomplete' : band;
  const labelColor = incomplete ? 'var(--warn)' : color;
  return (
    <div className="score-ring" role="img" aria-label={`Security score ${score} out of 100 — ${label}`}>
      <svg width="220" height="220" viewBox="0 0 220 220">
        <circle cx="110" cy="110" r={r} className="ring-track" />
        <circle
          cx="110"
          cy="110"
          r={r}
          className="ring-fill"
          style={{ stroke: color, strokeDasharray: `${filled} ${c - filled}` }}
          transform="rotate(-90 110 110)"
        />
      </svg>
      <div className="score-center">
        <div className="score-number">{score}</div>
        <div className="score-max">/100</div>
        <div className="score-band" style={{ color: labelColor }}>{label}</div>
      </div>
    </div>
  );
}
