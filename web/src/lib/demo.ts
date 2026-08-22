import type { CopyTargetRow, Overview, OrderRow, Portfolio, TradeRow } from './types';

/**
 * Sample desk used when the API is not reachable (a static deploy, or the
 * bot process being down). Numbers are plausible rather than round so the
 * layout gets exercised the way real data exercises it.
 */

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString().replace('T', ' ').slice(0, 19);

export const demoOverview: Overview = {
  solUsd: 214.36,
  users: 1284,
  trades: 18_642,
  volumeSol: 41_208.77,
  realizedPnlSol: 612.44,
  openOrders: 96,
  leaderboard: [
    { username: 'lowfloatlarry', telegramId: 71_223_004, trades: 412, volumeSol: 3104.2, realizedPnlSol: 188.31 },
    { username: 'exitliquidity', telegramId: 55_910_882, trades: 268, volumeSol: 1980.5, realizedPnlSol: 94.07 },
    { username: 'mev_survivor', telegramId: 40_118_223, trades: 741, volumeSol: 5312.9, realizedPnlSol: 61.88 },
    { username: 'nofeelings', telegramId: 88_204_551, trades: 96, volumeSol: 702.4, realizedPnlSol: 22.15 },
    { username: 'chartsdontlie', telegramId: 13_557_909, trades: 154, volumeSol: 811.0, realizedPnlSol: -8.42 },
  ],
};

export const demoPortfolio: Portfolio = {
  user: { id: 1, telegramId: 71_223_004, username: 'lowfloatlarry', joinedAt: '2025-11-02 09:14:00' },
  solUsd: 214.36,
  wallets: [
    {
      id: 1,
      label: 'Main',
      publicKey: '7xKXtg2CW3qNvKfMhLYb4pDqmR9uYaHLoP1sVtEeJ4Zm',
      isActive: true,
      solBalance: 12.4471,
    },
    {
      id: 2,
      label: 'Degen',
      publicKey: 'BqTk9NcYvA2s5dWmXpR7uHf3LzJeCg1QoVn8ZyPd6Ktb',
      isActive: false,
      solBalance: 1.9032,
    },
  ],
  totals: {
    valueSol: 27.8134,
    valueUsd: 5962.06,
    unrealizedPnlSol: 4.2217,
    realizedPnlSol: 9.8804,
    trades: 412,
    winRate: 58.2,
  },
  positions: [
    {
      mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
      symbol: 'WIF',
      amount: 1840.22,
      entryPriceSol: 0.006812,
      priceSol: 0.008431,
      valueSol: 15.5148,
      valueUsd: 3325.75,
      unrealizedPnlSol: 2.9812,
      unrealizedPnlPct: 23.76,
      realizedPnlSol: 1.204,
    },
    {
      mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      symbol: 'BONK',
      amount: 42_180_000,
      entryPriceSol: 0.00000014,
      priceSol: 0.00000019,
      valueSol: 8.0142,
      valueUsd: 1717.92,
      unrealizedPnlSol: 2.1064,
      unrealizedPnlPct: 35.66,
      realizedPnlSol: 6.402,
    },
    {
      mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      symbol: 'JUP',
      amount: 604.5,
      entryPriceSol: 0.00812,
      priceSol: 0.00719,
      valueSol: 4.3464,
      valueUsd: 931.68,
      unrealizedPnlSol: -0.5622,
      unrealizedPnlPct: -11.45,
      realizedPnlSol: 2.274,
    },
  ],
};

export const demoTrades: TradeRow[] = [
  { id: 412, side: 'sell', symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', solAmount: 3.1204, tokenAmount: 16_400_000, priceSol: 0.00000019, status: 'confirmed', source: 'take_profit', signature: '5rQm…', createdAt: minutesAgo(6) },
  { id: 411, side: 'buy', symbol: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', solAmount: 5.0, tokenAmount: 612.4, priceSol: 0.008165, status: 'confirmed', source: 'manual', signature: '2Kdp…', createdAt: minutesAgo(24) },
  { id: 410, side: 'buy', symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', solAmount: 2.5, tokenAmount: 307.8, priceSol: 0.00812, status: 'confirmed', source: 'limit_order', signature: '9Fzt…', createdAt: minutesAgo(96) },
  { id: 409, side: 'sell', symbol: 'POPCAT', mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', solAmount: 1.8442, tokenAmount: 240.1, priceSol: 0.00768, status: 'confirmed', source: 'stop_loss', signature: 'Ax4v…', createdAt: minutesAgo(180) },
  { id: 408, side: 'buy', symbol: 'MEW', mint: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', solAmount: 1.0, tokenAmount: 8420.0, priceSol: 0.000118, status: 'failed', source: 'manual', signature: null, createdAt: minutesAgo(210) },
];

export const demoOrders: OrderRow[] = [
  { id: 84, kind: 'take_profit', symbol: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', triggerPriceSol: 0.0102, amountSol: null, amountPct: 50, expiresAt: null, createdAt: minutesAgo(320) },
  { id: 83, kind: 'stop_loss', symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', triggerPriceSol: 0.0064, amountSol: null, amountPct: 100, expiresAt: null, createdAt: minutesAgo(420) },
  { id: 82, kind: 'limit_buy', symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', triggerPriceSol: 0.00000015, amountSol: 2.5, amountPct: null, expiresAt: '2026-09-01 00:00:00', createdAt: minutesAgo(900) },
];

export const demoCopyTargets: CopyTargetRow[] = [
  {
    id: 3,
    address: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
    label: null,
    sizeSol: 0.25,
    mirrorSells: true,
    status: 'active',
    copiedCount: 18,
    createdAt: minutesAgo(4320),
  },
  {
    id: 2,
    address: 'GDfnEsia2WLAW5t8yx2X5j2mkfA74i5kwGdDuZHt7XmG',
    label: null,
    sizeSol: 0.1,
    mirrorSells: false,
    status: 'paused',
    copiedCount: 6,
    createdAt: minutesAgo(9000),
  },
];
