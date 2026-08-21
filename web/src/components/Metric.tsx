import type { ReactNode } from 'react';

/**
 * The number is the point, so it gets the largest type on the page and a
 * tabular font: a ticking value that shifts sideways is unreadable.
 */
export const Metric = ({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: 'neutral' | 'gain' | 'loss';
}) => {
  const valueTone =
    tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-chalk-100';

  return (
    <div className="panel px-4 py-3">
      <p className="label">{label}</p>
      <p className={`tabular mt-1.5 font-mono text-xl font-medium tracking-tight ${valueTone}`}>
        {value}
      </p>
      {detail && <div className="mt-1 text-xs text-chalk-500">{detail}</div>}
    </div>
  );
};
