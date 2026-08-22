import { relativeTime, shortAddress } from '../lib/format';
import { Copyable, EmptyState, Tag } from './primitives';
import type { CopyTargetRow } from '../lib/types';

export const CopyPanel = ({ targets }: { targets: CopyTargetRow[] }) => {
  if (targets.length === 0) {
    return (
      <EmptyState
        title="Not following anyone"
        hint="Followed wallets are scanned every 20 seconds and their swaps mirrored at a fixed size."
      />
    );
  }

  return (
    <ul className="divide-y divide-ink-600/40">
      {targets.map((target) => (
        <li key={target.id} className="flex items-center gap-3 px-4 py-3">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              target.status === 'active' ? 'bg-gain' : 'bg-chalk-700'
            }`}
            title={target.status === 'active' ? 'Mirroring' : 'Paused'}
          />

          <div className="min-w-0 flex-1">
            <Copyable value={target.address} display={shortAddress(target.address, 6)} />
            <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-chalk-500">
              <span>{target.sizeSol} SOL per buy</span>
              <span>·</span>
              <span>{target.mirrorSells ? 'sells mirrored' : 'buys only'}</span>
              <span>·</span>
              <span>following {relativeTime(target.createdAt).replace(' ago', '')}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="tabular font-mono text-sm text-chalk-100">{target.copiedCount}</div>
            <div className="text-2xs text-chalk-500">copied</div>
          </div>

          {target.status === 'paused' && <Tag>paused</Tag>}
        </li>
      ))}
    </ul>
  );
};
