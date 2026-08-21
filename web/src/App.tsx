import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOrders, fetchOverview, fetchPortfolio, fetchTrades } from './lib/api';
import { pct, usd } from './lib/format';
import { Leaderboard } from './components/Leaderboard';
import { Metric } from './components/Metric';
import { OrdersPanel } from './components/OrdersPanel';
import { PositionsTable } from './components/PositionsTable';
import { Shell, type View } from './components/Shell';
import { Sparkline } from './components/Sparkline';
import { TradesTable } from './components/TradesTable';
import { WalletsPanel } from './components/WalletsPanel';
import { Panel, SkeletonRows } from './components/primitives';
import type { Overview, OrderRow, Portfolio, TradeRow } from './lib/types';

const REFRESH_MS = 20_000;

/** Which account the desk view is looking at. Defaults to the sample user. */
const userRef = new URLSearchParams(window.location.search).get('user') ?? '1';

interface DeskData {
  overview: Overview;
  portfolio: Portfolio;
  trades: TradeRow[];
  orders: OrderRow[];
}

export default function App() {
  const [view, setView] = useState<View>('desk');
  const [data, setData] = useState<DeskData | null>(null);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const [[overview, o1], [portfolio, o2], [trades, o3], [orders, o4]] = await Promise.all([
      fetchOverview(),
      fetchPortfolio(userRef),
      fetchTrades(userRef),
      fetchOrders(userRef),
    ]);

    setData({ overview, portfolio, trades: trades.trades, orders: orders.orders });
    setLive(o1 && o2 && o3 && o4);
    setUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  /**
   * The API has no candle history, so the sparkline plots the account's own
   * cumulative SOL flow across recent fills - real data, oldest first.
   */
  const equityCurve = useMemo(() => {
    if (!data) return [];
    let running = 0;
    return [...data.trades]
      .reverse()
      .map((trade) => {
        running += trade.side === 'buy' ? -trade.solAmount : trade.solAmount;
        return running;
      });
  }, [data]);

  if (!data) {
    return (
      <Shell view={view} onViewChange={setView} live={false} updatedAt={null} onRefresh={() => void load()}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="panel h-[5.5rem] p-4">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton mt-3 h-6 w-28 rounded" />
            </div>
          ))}
        </div>
        <Panel className="mt-4" title="Positions">
          <SkeletonRows rows={4} />
        </Panel>
      </Shell>
    );
  }

  const { overview, portfolio, trades, orders } = data;
  const equitySol =
    portfolio.totals.valueSol +
    portfolio.wallets.reduce((sum, wallet) => sum + wallet.solBalance, 0);

  return (
    <Shell
      view={view}
      onViewChange={setView}
      live={live}
      updatedAt={updatedAt}
      onRefresh={() => void load()}
    >
      {view === 'desk' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Equity"
              value={`${equitySol.toFixed(4)} SOL`}
              detail={usd(equitySol * portfolio.solUsd)}
            />
            <Metric
              label="Unrealised PnL"
              value={`${portfolio.totals.unrealizedPnlSol >= 0 ? '+' : ''}${portfolio.totals.unrealizedPnlSol.toFixed(4)}`}
              tone={portfolio.totals.unrealizedPnlSol >= 0 ? 'gain' : 'loss'}
              detail={`across ${portfolio.positions.length} open ${portfolio.positions.length === 1 ? 'position' : 'positions'}`}
            />
            <Metric
              label="Realised PnL"
              value={`${portfolio.totals.realizedPnlSol >= 0 ? '+' : ''}${portfolio.totals.realizedPnlSol.toFixed(4)}`}
              tone={portfolio.totals.realizedPnlSol >= 0 ? 'gain' : 'loss'}
              detail={`${portfolio.totals.trades} fills · ${portfolio.totals.winRate.toFixed(0)}% win rate`}
            />
            <Metric
              label="SOL price"
              value={usd(portfolio.solUsd)}
              detail={`account opened ${portfolio.user.joinedAt.slice(0, 10)}`}
            />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title="Open positions"
              subtitle="Marked against the average entry the bot recorded"
            >
              <PositionsTable positions={portfolio.positions} />
            </Panel>

            <div className="space-y-4">
              <Panel title="Wallets" subtitle="Keys are held by the bot, encrypted at rest">
                <WalletsPanel wallets={portfolio.wallets} solUsd={portfolio.solUsd} />
              </Panel>

              <Panel title="Net SOL flow" subtitle="Cumulative across recent fills">
                <div className="px-4 pb-4 pt-3">
                  <Sparkline values={equityCurve} />
                  <p className="mt-2 text-2xs text-chalk-500">
                    {trades.length} fills · net{' '}
                    <span className={equityCurve.at(-1)! >= 0 ? 'text-gain' : 'text-loss'}>
                      {(equityCurve.at(-1) ?? 0).toFixed(4)} SOL
                    </span>
                  </p>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      )}

      {view === 'activity' && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Panel title="Recent fills" subtitle="Newest first, straight from the trade log">
            <TradesTable trades={trades} />
          </Panel>
          <Panel title="Resting orders" subtitle="Swept every 10 seconds by the watcher">
            <OrdersPanel orders={orders} />
          </Panel>
        </div>
      )}

      {view === 'network' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Traders" value={overview.users.toLocaleString()} />
            <Metric label="Fills" value={overview.trades.toLocaleString()} />
            <Metric
              label="Volume"
              value={`${Math.round(overview.volumeSol).toLocaleString()} SOL`}
              detail={usd(overview.volumeSol * overview.solUsd)}
            />
            <Metric label="Resting orders" value={overview.openOrders.toLocaleString()} />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Panel title="Realised PnL leaders" subtitle="Booked profit in SOL, all time">
              <Leaderboard rows={overview.leaderboard} />
            </Panel>
            <Panel title="Desk health" subtitle="What the deployment is doing right now">
              <dl className="divide-y divide-ink-600/40">
                {[
                  ['Aggregate realised PnL', `${overview.realizedPnlSol.toFixed(2)} SOL`],
                  ['Average fill size', `${(overview.volumeSol / Math.max(overview.trades, 1)).toFixed(3)} SOL`],
                  ['Orders per trader', (overview.openOrders / Math.max(overview.users, 1)).toFixed(2)],
                  ['Win rate (this account)', pct(portfolio.totals.winRate)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3">
                    <dt className="text-sm text-chalk-500">{label}</dt>
                    <dd className="tabular font-mono text-sm text-chalk-100">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </div>
      )}
    </Shell>
  );
}
