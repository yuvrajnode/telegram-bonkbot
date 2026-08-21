import { compact, pct, price, shortAddress, usd } from '../lib/format';
import { Copyable, EmptyState } from './primitives';
import type { Portfolio } from '../lib/types';

export const PositionsTable = ({ positions }: { positions: Portfolio['positions'] }) => {
  if (positions.length === 0) {
    return (
      <EmptyState
        title="No open positions"
        hint="Anything bought through the bot shows up here with live PnL against its average entry."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <thead>
          <tr className="hairline text-left">
            {['Token', 'Size', 'Entry', 'Mark', 'Value', 'Unrealised', 'Realised'].map((head) => (
              <th key={head} className="label px-4 py-2 font-medium last:text-right">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => {
            const up = position.unrealizedPnlSol >= 0;
            return (
              <tr
                key={position.mint}
                className="group border-b border-ink-600/40 transition-colors last:border-0 hover:bg-ink-700/50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`h-6 w-0.5 rounded-full ${up ? 'bg-gain' : 'bg-loss'}`}
                      aria-hidden
                    />
                    <div>
                      <div className="font-medium text-chalk-100">{position.symbol}</div>
                      <Copyable value={position.mint} display={shortAddress(position.mint, 5)} />
                    </div>
                  </div>
                </td>
                <td className="tabular px-4 py-3 font-mono text-chalk-300">
                  {compact(position.amount)}
                </td>
                <td className="tabular px-4 py-3 font-mono text-chalk-500">
                  {price(position.entryPriceSol)}
                </td>
                <td className="tabular px-4 py-3 font-mono text-chalk-100">
                  {price(position.priceSol)}
                </td>
                <td className="tabular px-4 py-3 font-mono">
                  <div className="text-chalk-100">{position.valueSol.toFixed(4)}</div>
                  <div className="text-2xs text-chalk-500">{usd(position.valueUsd)}</div>
                </td>
                <td className="tabular px-4 py-3 font-mono">
                  <div className={up ? 'text-gain' : 'text-loss'}>
                    {position.unrealizedPnlSol >= 0 ? '+' : ''}
                    {position.unrealizedPnlSol.toFixed(4)}
                  </div>
                  <div className={`text-2xs ${up ? 'text-gain/70' : 'text-loss/70'}`}>
                    {pct(position.unrealizedPnlPct)}
                  </div>
                </td>
                <td className="tabular px-4 py-3 text-right font-mono text-chalk-300">
                  {position.realizedPnlSol >= 0 ? '+' : ''}
                  {position.realizedPnlSol.toFixed(4)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
