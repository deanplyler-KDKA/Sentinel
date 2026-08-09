import type { Band } from '../lib/score';

interface Props {
  score: number;
  band: Band;
}

const BAND_COLORS: Record<Band, string> = {
  Excellent: 'var(--good)',
  Protected: 'var(--good)',
  'Needs attention': 'var(--warn)',
  'At risk': 'var(--orange)',
  Critical: 'var(--bad)',
};

export function ScoreRing({ score, band }: Props) {
  const r = 84;
  const c = 2 * Math.PI * r;
  const filled = (score / 100) * c;
  const color = BAND_COLORS[band];
  return (
    <div className="score-ring" role="img" aria-label={`Security score ${score} out of 100 — ${band}`}>
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
        <div className="score-band" style={{ color }}>{band}</div>
      </div>
    </div>
  );
}
