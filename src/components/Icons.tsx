interface IconProps {
  size?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** The Sentinel brand mark: radar-sweep ring, sentry light, watchtower. */
export const SentinelMark = ({ size = 22 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
    <circle
      cx="12"
      cy="12"
      r="9.2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeDasharray="43.4 14.4"
      transform="rotate(45 12 12)"
    />
    <circle cx="18.5" cy="5.5" r="2.1" fill="currentColor" stroke="none" />
    <path d="M10.4 7.2h3.2l1.2 9.6H9.2Z" fill="currentColor" stroke="none" />
  </svg>
);

export const ShieldIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 2.5 4.5 5.4v5.2c0 4.6 3.1 8.9 7.5 10.4 4.4-1.5 7.5-5.8 7.5-10.4V5.4L12 2.5Z" />
  </svg>
);

export const ShieldCheckIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 2.5 4.5 5.4v5.2c0 4.6 3.1 8.9 7.5 10.4 4.4-1.5 7.5-5.8 7.5-10.4V5.4L12 2.5Z" />
    <path d="m9 12 2.2 2.2L15.5 9.8" />
  </svg>
);

export const FlameIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M12 3s1 2.4 1 4.2c2.4 1 4.5 3.3 4.5 6.3A5.5 5.5 0 0 1 12 19a5.5 5.5 0 0 1-5.5-5.5c0-2.6 1.6-4.4 3-5.7C10.6 6.6 12 3 12 3Z" />
    <path d="M12 19c-1.4 0-2.5-1.1-2.5-2.5 0-1.2.9-2 1.6-2.9.5-.6.9-1.6.9-1.6s1.7 1.3 2.2 2.6c.4 1 .3 2-.2 2.9A2.6 2.6 0 0 1 12 19Z" />
  </svg>
);

export const LockIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    <circle cx="12" cy="15.3" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const GlobeIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.4 3.8 5.6 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.6-3.8-9S9.5 5.4 12 3Z" />
  </svg>
);

export const MonitorIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <rect x="3" y="4.5" width="18" height="12.5" rx="2" />
    <path d="M9 20.5h6M12 17v3.5" />
  </svg>
);

export const KeyIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)}>
    <circle cx="8" cy="14.5" r="4.5" />
    <path d="m11.3 11.2 8.2-8.2M16 6l2.5 2.5M13.5 8.5 16 11" />
  </svg>
);

export const RefreshIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6M20 3.5V8h-4.5" />
  </svg>
);
