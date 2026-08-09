import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  /** Tints the value: good=green, bad=red, warn=amber, muted=default. */
  tone?: 'good' | 'bad' | 'warn' | 'muted';
}

export function DetailRow({ label, value, tone = 'muted' }: Props) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className={`detail-value tone-${tone}`}>{value}</span>
    </div>
  );
}
