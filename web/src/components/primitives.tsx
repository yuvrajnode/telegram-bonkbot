import type { ReactNode } from 'react';

export const Panel = ({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={`panel ${className}`}>
    {title && (
      <header className="hairline flex items-start justify-between gap-4 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-chalk-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-chalk-500">{subtitle}</p>}
        </div>
        {action}
      </header>
    )}
    {children}
  </section>
);

export const Delta = ({
  value,
  suffix = '',
  className = '',
}: {
  value: number;
  suffix?: string;
  className?: string;
}) => {
  const flat = Math.abs(value) < 1e-9;
  const tone = flat ? 'text-chalk-500' : value > 0 ? 'text-gain' : 'text-loss';
  return (
    <span className={`tabular ${tone} ${className}`}>
      {flat ? '' : value > 0 ? '+' : '−'}
      {Math.abs(value).toFixed(2)}
      {suffix}
    </span>
  );
};

export const Tag = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'buy' | 'sell' | 'warn' }) => {
  const tones = {
    neutral: 'border-ink-500 text-chalk-300',
    buy: 'border-gain/40 text-gain',
    sell: 'border-loss/40 text-loss',
    warn: 'border-ember-500/50 text-ember-400',
  } as const;

  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

export const EmptyState = ({ title, hint }: { title: string; hint: string }) => (
  <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
    <p className="text-sm text-chalk-300">{title}</p>
    <p className="max-w-xs text-xs text-chalk-500">{hint}</p>
  </div>
);

export const SkeletonRows = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-2 p-4">
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="skeleton h-9 rounded" />
    ))}
  </div>
);

export const Copyable = ({ value, display }: { value: string; display: string }) => (
  <button
    type="button"
    onClick={() => void navigator.clipboard?.writeText(value)}
    title="Copy to clipboard"
    className="tabular rounded px-1 font-mono text-xs text-chalk-300 transition-colors hover:bg-ink-600 hover:text-chalk-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ember-500"
  >
    {display}
  </button>
);
