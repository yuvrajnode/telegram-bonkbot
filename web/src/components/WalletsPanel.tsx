import { shortAddress, usd } from '../lib/format';
import { Copyable } from './primitives';
import type { Portfolio } from '../lib/types';

export const WalletsPanel = ({
  wallets,
  solUsd,
}: {
  wallets: Portfolio['wallets'];
  solUsd: number;
}) => (
  <ul className="divide-y divide-ink-600/40">
    {wallets.map((wallet) => (
      <li key={wallet.id} className="flex items-center gap-3 px-4 py-3">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${wallet.isActive ? 'bg-ember-500' : 'bg-ink-500'}`}
          title={wallet.isActive ? 'Active for trading' : 'Idle'}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-chalk-100">{wallet.label}</div>
          <Copyable value={wallet.publicKey} display={shortAddress(wallet.publicKey, 6)} />
        </div>
        <div className="text-right">
          <div className="tabular font-mono text-sm text-chalk-100">
            {wallet.solBalance.toFixed(4)}
          </div>
          <div className="text-2xs text-chalk-500">{usd(wallet.solBalance * solUsd)}</div>
        </div>
      </li>
    ))}
  </ul>
);
