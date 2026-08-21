/**
 * Hand-rolled because a chart library for a 40 point line is 90kb of
 * dependency for one path element. Renders nothing below two points rather
 * than drawing a misleading flat line.
 */
export const Sparkline = ({
  values,
  width = 220,
  height = 44,
}: {
  values: number[];
  width?: number;
  height?: number;
}) => {
  if (values.length < 2) {
    return <div className="h-11 w-full rounded bg-ink-700/60" aria-hidden />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / span) * (height - 6) - 3;
    return [x, y] as const;
  });

  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const rising = (values.at(-1) ?? 0) >= (values[0] ?? 0);
  const stroke = rising ? '#3fb970' : '#e5484d';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-11 w-full"
      role="img"
      aria-label={rising ? 'Trending up' : 'Trending down'}
    >
      <defs>
        <linearGradient id={`fade-${rising}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#fade-${rising})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};
