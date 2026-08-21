import type { ReactNode } from 'react';

export type View = 'desk' | 'activity' | 'network';

const NAV: Array<{ id: View; label: string; hint: string }> = [
  { id: 'desk', label: 'Desk', hint: 'Positions and balances' },
  { id: 'activity', label: 'Activity', hint: 'Fills and resting orders' },
  { id: 'network', label: 'Network', hint: 'Bot-wide totals' },
];

const Logo = () => (
  <svg viewBox="0 0 28 28" className="h-6 w-6" aria-hidden>
    <rect x="1" y="1" width="26" height="26" rx="7" fill="#f2662f" opacity="0.14" />
    <path
      d="M8 19.5V8.5h5.4c2.1 0 3.4 1 3.4 2.7 0 1.2-.7 2-1.8 2.4 1.4.3 2.3 1.3 2.3 2.7 0 1.9-1.5 3.2-4 3.2H8Zm2.6-6.6h2.3c.9 0 1.4-.4 1.4-1.1 0-.7-.5-1.1-1.4-1.1h-2.3v2.2Zm0 4.5h2.6c1 0 1.6-.4 1.6-1.2 0-.8-.6-1.2-1.6-1.2h-2.6v2.4Z"
      fill="#ff8a4c"
    />
    <circle cx="20.5" cy="9" r="2" fill="#3fb970" />
  </svg>
);

export const Shell = ({
  view,
  onViewChange,
  live,
  updatedAt,
  onRefresh,
  children,
}: {
  view: View;
  onViewChange: (view: View) => void;
  live: boolean;
  updatedAt: Date | null;
  onRefresh: () => void;
  children: ReactNode;
}) => (
  <div className="min-h-screen">
    <header className="sticky top-0 z-20 border-b border-ink-600 bg-ink-900/85 backdrop-blur">
      <div className="mx-auto flex max-w-[88rem] items-center gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">BonkBot</div>
            <div className="text-2xs text-chalk-500">Solana trading desk</div>
          </div>
        </div>

        <nav className="ml-4 hidden items-center gap-1 sm:flex">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onViewChange(item.id)}
              title={item.hint}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ember-500 ${
                view === item.id
                  ? 'bg-ink-700 text-chalk-100'
                  : 'text-chalk-500 hover:bg-ink-800 hover:text-chalk-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 text-2xs text-chalk-500"
            title={live ? 'Connected to the bot API' : 'API unreachable — showing the sample desk'}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-gain' : 'bg-ember-500'}`}
            />
            {live ? 'live' : 'sample data'}
          </span>
          {updatedAt && (
            <span className="tabular hidden font-mono text-2xs text-chalk-700 sm:inline">
              {updatedAt.toLocaleTimeString('en-GB')}
            </span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-md border border-ink-600 px-2.5 py-1.5 text-xs text-chalk-300 transition-colors hover:border-ink-500 hover:text-chalk-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-ember-500"
          >
            Refresh
          </button>
        </div>
      </div>

      <nav className="flex gap-1 border-t border-ink-600 px-4 py-2 sm:hidden">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onViewChange(item.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
              view === item.id ? 'bg-ink-700 text-chalk-100' : 'text-chalk-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>

    <main className="mx-auto max-w-[88rem] px-4 py-6 sm:px-6">{children}</main>

    <footer className="mx-auto max-w-[88rem] px-4 pb-10 pt-4 text-2xs text-chalk-700 sm:px-6">
      Read-only view. Trades are placed from Telegram, where the signing keys live.
    </footer>
  </div>
);
