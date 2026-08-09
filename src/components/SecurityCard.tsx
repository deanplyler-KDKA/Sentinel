import type { ReactNode } from 'react';
import { StatusPill, type PillState } from './StatusPill';

interface Props {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  state: PillState;
  stateLabel?: string;
  children: ReactNode;
}

export function SecurityCard({ icon, title, subtitle, state, stateLabel, children }: Props) {
  return (
    <section className={`card card-${state}`}>
      <header className="card-header">
        <div className={`card-icon icon-${state}`}>{icon}</div>
        <div className="card-titles">
          <h3>{title}</h3>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        <StatusPill state={state} label={stateLabel} />
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}
