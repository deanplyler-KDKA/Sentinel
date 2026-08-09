export type PillState = 'ok' | 'warn' | 'bad' | 'unknown';

const LABELS: Record<PillState, string> = {
  ok: 'Protected',
  warn: 'Needs attention',
  bad: 'At risk',
  unknown: 'Unknown',
};

interface Props {
  state: PillState;
  label?: string;
}

export function StatusPill({ state, label }: Props) {
  return (
    <span className={`pill pill-${state}`}>
      <span className="pill-dot" />
      {label ?? LABELS[state]}
    </span>
  );
}
