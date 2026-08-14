import { useState } from 'react';
import { openWindowsSetting } from '../lib/api';
import type { Suggestion, SuggestionSeverity } from '../lib/suggest';

const SEVERITY_LABEL: Record<SuggestionSeverity, string> = {
  critical: 'Action recommended',
  important: 'Needs attention',
  suggested: 'Worth checking',
};

const SEVERITY_CLASS: Record<SuggestionSeverity, string> = {
  critical: 'issue-bad',
  important: '',
  suggested: 'issue-info',
};

interface Props {
  suggestions: Suggestion[];
  /** Cap for compact placements like the dashboard. */
  limit?: number;
  emptyMessage?: string;
}

export function SuggestionList({ suggestions, limit, emptyMessage }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const shown = limit ? suggestions.slice(0, limit) : suggestions;

  if (suggestions.length === 0) {
    return (
      <p className="card-note">
        {emptyMessage ?? 'Nothing needs your attention right now.'}
      </p>
    );
  }

  async function runAction(target: Suggestion['action']) {
    if (!target) return;
    setActionError(null);
    try {
      await openWindowsSetting(target.target);
    } catch (e) {
      setActionError(String(e));
    }
  }

  return (
    <div className="stack">
      {actionError && <div className="error-banner">{actionError}</div>}
      {shown.map((s) => {
        const expanded = open === s.id;
        return (
          <div key={s.id} className={`issue ${SEVERITY_CLASS[s.severity]}`}>
            <div className="issue-head">
              <button
                className="issue-toggle"
                onClick={() => setOpen(expanded ? null : s.id)}
                aria-expanded={expanded}
              >
                <span className="issue-title">{s.title}</span>
              </button>
              <span className="issue-tag">
                {s.area} · {SEVERITY_LABEL[s.severity]}
              </span>
            </div>
            <p className="issue-body">{s.why}</p>

            {expanded && (
              <div className="issue-detail">
                <p className="issue-evidence">{s.evidence}</p>
                <ol className="issue-steps">
                  {s.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {s.action && (
                  <button className="btn btn-primary" onClick={() => runAction(s.action)}>
                    {s.action.label}
                  </button>
                )}
              </div>
            )}
            {!expanded && (
              <button className="issue-more" onClick={() => setOpen(s.id)}>
                How to fix this
              </button>
            )}
          </div>
        );
      })}
      {limit && suggestions.length > limit && (
        <p className="small faint">
          {suggestions.length - limit} more on the Health page.
        </p>
      )}
    </div>
  );
}
