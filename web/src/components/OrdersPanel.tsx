import { price, relativeTime } from '../lib/format';
import { EmptyState, Tag } from './primitives';
import type { OrderRow } from '../lib/types';

const kindLabel: Record<OrderRow['kind'], string> = {
  limit_buy: 'Limit buy',
  limit_sell: 'Limit sell',
  stop_loss: 'Stop loss',
  take_profit: 'Take profit',
};

export const OrdersPanel = ({ orders }: { orders: OrderRow[] }) => {
  if (orders.length === 0) {
    return (
      <EmptyState
        title="Nothing resting"
        hint="Limit and stop orders sit here until the watcher trips them."
      />
    );
  }

  return (
    <ul className="divide-y divide-ink-600/40">
      {orders.map((order) => (
        <li key={order.id} className="px-4 py-3 transition-colors hover:bg-ink-700/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Tag tone={order.kind === 'limit_buy' ? 'buy' : order.kind === 'stop_loss' ? 'sell' : 'warn'}>
                {kindLabel[order.kind]}
              </Tag>
              <span className="text-sm font-medium text-chalk-100">{order.symbol}</span>
            </div>
            <span className="tabular font-mono text-sm text-chalk-100">
              {price(order.triggerPriceSol)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-2xs text-chalk-500">
            <span>
              {order.amountSol !== null
                ? `${order.amountSol} SOL`
                : `${order.amountPct}% of holding`}
              {' · '}
              {order.expiresAt ? `expires ${order.expiresAt.slice(0, 10)}` : 'good till cancelled'}
            </span>
            <span>placed {relativeTime(order.createdAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
};
