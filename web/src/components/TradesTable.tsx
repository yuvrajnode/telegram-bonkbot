import { compact, price, relativeTime } from '../lib/format';
import { EmptyState, Tag } from './primitives';
import type { TradeRow } from '../lib/types';

const sourceLabel: Record<string, string> = {
  manual: 'manual',
  limit_order: 'limit',
  stop_loss: 'stop',
  take_profit: 'target',
};

export const TradesTable = ({ trades }: { trades: TradeRow[] }) => {
  if (trades.length === 0) {
    return <EmptyState title="No fills yet" hint="Executed swaps land here with their signature." />;
  }

  return (
    <ul className="divide-y divide-ink-600/40">
      {trades.map((trade) => (
        <li
          key={trade.id}
          className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ink-700/50"
        >
          <Tag tone={trade.side === 'buy' ? 'buy' : 'sell'}>{trade.side}</Tag>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm font-medium text-chalk-100">{trade.symbol}</span>
              <span className="tabular font-mono text-xs text-chalk-500">
                @ {price(trade.priceSol)}
              </span>
              {trade.status !== 'confirmed' && (
                <Tag tone={trade.status === 'failed' ? 'sell' : 'warn'}>{trade.status}</Tag>
              )}
            </div>
            <div className="text-2xs text-chalk-500">
              {compact(trade.tokenAmount)} {trade.symbol} · {sourceLabel[trade.source] ?? trade.source}
            </div>
          </div>

          <div className="text-right">
            <div className="tabular font-mono text-sm text-chalk-100">
              {trade.side === 'buy' ? '−' : '+'}
              {trade.solAmount.toFixed(4)}
            </div>
            <div className="text-2xs text-chalk-500">{relativeTime(trade.createdAt)}</div>
          </div>

          {trade.signature && (
            <a
              href={`https://solscan.io/tx/${trade.signature}`}
              target="_blank"
              rel="noreferrer"
              className="rounded px-1.5 py-1 text-2xs text-chalk-500 transition-colors hover:bg-ink-600 hover:text-ember-400"
              title="Open on Solscan"
            >
              ↗
            </a>
          )}
        </li>
      ))}
    </ul>
  );
};
