import type { ReactNode } from 'react';
import {
  ChipIcon, ClockIcon, DevicesIcon, GaugeIcon, GearIcon, GlobeIcon, HeartPulseIcon,
  SentinelMark, ShieldIcon,
} from './Icons';

export type Page =
  | 'dashboard'
  | 'protect'
  | 'performance'
  | 'network'
  | 'health'
  | 'devices'
  | 'history'
  | 'settings';

const ITEMS: Array<{ id: Page; label: string; icon: ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <GaugeIcon /> },
  { id: 'protect', label: 'Protect', icon: <ShieldIcon size={18} /> },
  { id: 'performance', label: 'Performance', icon: <ChipIcon /> },
  { id: 'network', label: 'Network', icon: <GlobeIcon size={18} /> },
  { id: 'health', label: 'Health', icon: <HeartPulseIcon /> },
  { id: 'devices', label: 'Devices', icon: <DevicesIcon /> },
  { id: 'history', label: 'History', icon: <ClockIcon /> },
  { id: 'settings', label: 'Settings', icon: <GearIcon /> },
];

interface Props {
  page: Page;
  onNavigate: (page: Page) => void;
  version: string;
}

export function Nav({ page, onNavigate, version }: Props) {
  return (
    <nav className="nav">
      <div className="nav-brand">
        <div className="nav-brand-mark">
          <SentinelMark size={20} />
        </div>
        <h1>SENTINEL</h1>
      </div>
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={`nav-item${page === item.id ? ' active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
      <div className="nav-spacer" />
      <div className="nav-foot">v{version}</div>
    </nav>
  );
}
