export const usd = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(value) >= 1 ? 2 : 6,
  }).format(value);

export const sol = (value: number, digits = 4): string => `${value.toFixed(digits)} SOL`;

/**
 * Token prices span nine orders of magnitude here, so precision scales with
 * the number instead of being fixed.
 */
export const price = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) return '—';
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (abs >= 1) return value.toFixed(4);
  if (abs >= 0.0001) return value.toFixed(6);
  return value.toExponential(2);
};

export const compact = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
};

export const pct = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

export const shortAddress = (value: string, size = 4): string =>
  value.length <= size * 2 + 1 ? value : `${value.slice(0, size)}…${value.slice(-size)}`;

export const relativeTime = (iso: string): string => {
  const then = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);

  if (!Number.isFinite(seconds)) return iso;
  if (seconds < 60) return `${Math.max(seconds, 0)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
};
