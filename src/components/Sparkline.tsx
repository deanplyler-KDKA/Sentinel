interface Props {
  title: string;
  valueLabel: string;
  data: number[];
  /** Fixed max for percentage charts; omit to auto-scale (rates). */
  max?: number;
  height?: number;
}

/**
 * Restrained live chart: one line, subtle area fill, no axes ceremony.
 * Colors come from chart tokens only.
 */
export function Sparkline({ title, valueLabel, data, max, height = 56 }: Props) {
  const w = 300;
  const h = height;
  const top = max ?? Math.max(1, ...data) * 1.15;
  const n = Math.max(data.length, 2);
  const pts = data.map((v, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - Math.min(1, v / top) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(' ');
  const area = `0,${h} ${line} ${w},${h}`;

  return (
    <div className="spark">
      <div className="spark-head">
        <span className="spark-title">{title}</span>
        <span className="spark-value">{valueLabel}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: h }}>
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="var(--chart-grid)" strokeWidth="1" />
        {data.length >= 2 && (
          <>
            <polygon points={area} fill="var(--chart-fill)" />
            <polyline
              points={line}
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </>
        )}
      </svg>
    </div>
  );
}
