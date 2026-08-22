import { demoCopyTargets, demoOrders, demoOverview, demoPortfolio, demoTrades } from './demo';
import type { CopyTargetRow, Overview, OrderRow, Portfolio, TradeRow } from './types';

const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiOffline extends Error {
  constructor() {
    super('dashboard api unreachable');
  }
}

const get = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new ApiOffline();
  return (await response.json()) as T;
};

/**
 * Every call falls back to the sample desk when the API is not running. It
 * keeps the dashboard demonstrable on a static host, and makes the layout
 * work on real-shaped data rather than empty states.
 */
const withDemo = async <T>(load: () => Promise<T>, fallback: T): Promise<[T, boolean]> => {
  try {
    return [await load(), true];
  } catch {
    return [fallback, false];
  }
};

export const fetchOverview = () => withDemo(() => get<Overview>('/api/overview'), demoOverview);

export const fetchPortfolio = (userRef: number | string) =>
  withDemo(() => get<Portfolio>(`/api/users/${userRef}/portfolio`), demoPortfolio);

export const fetchTrades = (userRef: number | string) =>
  withDemo(
    () => get<{ trades: TradeRow[] }>(`/api/users/${userRef}/trades?limit=25`),
    { trades: demoTrades },
  );

export const fetchOrders = (userRef: number | string) =>
  withDemo(
    () => get<{ orders: OrderRow[] }>(`/api/users/${userRef}/orders`),
    { orders: demoOrders },
  );

export const fetchCopyTargets = (userRef: number | string) =>
  withDemo(
    () => get<{ targets: CopyTargetRow[] }>(`/api/users/${userRef}/copy-targets`),
    { targets: demoCopyTargets },
  );
