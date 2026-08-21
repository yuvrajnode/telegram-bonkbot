import { compact } from '../lib/format';
import type { Overview } from '../lib/types';

export const Leaderboard = ({ rows }: { rows: Overview['leaderboard'] }) => (
  <ol className="divide-y divide-ink-600/40">
    {rows.map((row, index) => (
      <li key={row.telegramId} className="flex items-center gap-3 px-4 py-2.5">
        <span className="tabular w-5 font-mono text-xs text-chalk-500">{index + 1}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-chalk-100">
          {row.username ? `@${row.username}` : `id ${row.telegramId}`}
        </span>
        <span className="tabular font-mono text-2xs text-chalk-500">{row.trades} fills</span>
        <span
          className={`tabular w-20 text-right font-mono text-sm ${row.realizedPnlSol >= 0 ? 'text-gain' : 'text-loss'}`}
        >
          {row.realizedPnlSol >= 0 ? '+' : ''}
          {compact(row.realizedPnlSol)}
        </span>
      </li>
    ))}
  </ol>
);
