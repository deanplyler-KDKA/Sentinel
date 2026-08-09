import type { CheckResult } from '../lib/score';

interface Props {
  results: CheckResult[];
}

export function Recommendations({ results }: Props) {
  const issues = results.filter((r) => r.state !== 'pass');
  if (issues.length === 0) {
    return (
      <div className="recommendations">
        <h3>Everything looks great</h3>
        <p className="rec-allclear">All security checks are passing. Nothing needs your attention.</p>
      </div>
    );
  }
  return (
    <div className="recommendations">
      <h3>How to raise your score</h3>
      <ul>
        {issues.map((r) => (
          <li key={r.id} className={`rec rec-${r.state}`}>
            <div className="rec-head">
              <span className="rec-label">
                {r.state === 'unknown' ? `${r.label} — couldn’t be checked` : r.label}
              </span>
              <span className="rec-points">+{r.points} pts</span>
            </div>
            <p className="rec-hint">{r.recommendation}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
