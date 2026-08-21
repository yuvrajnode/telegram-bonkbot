export interface Overview {
  solUsd: number;
  users: number;
  trades: number;
  volumeSol: number;
  realizedPnlSol: number;
  openOrders: number;
  leaderboard: Array<{
    username: string | null;
    telegramId: number;
    trades: number;
    volumeSol: number;
    realizedPnlSol: number;
  }>;
}

export interface Portfolio {
  user: { id: number; telegramId: number; username: string | null; joinedAt: string };
  solUsd: number;
  wallets: Array<{
    id: number;
    label: string;
    publicKey: string;
    isActive: boolean;
    solBalance: number;
  }>;
  totals: {
    valueSol: number;
    valueUsd: number;
    unrealizedPnlSol: number;
    realizedPnlSol: number;
    trades: number;
    winRate: number;
  };
  positions: Array<{
    mint: string;
    symbol: string;
    amount: number;
    entryPriceSol: number;
    priceSol: number;
    valueSol: number;
    valueUsd: number;
    unrealizedPnlSol: number;
    unrealizedPnlPct: number;
    realizedPnlSol: number;
  }>;
}

export interface TradeRow {
  id: number;
  side: 'buy' | 'sell';
  symbol: string;
  mint: string;
  solAmount: number;
  tokenAmount: number;
  priceSol: number;
  status: 'pending' | 'confirmed' | 'failed';
  source: string;
  signature: string | null;
  createdAt: string;
}

export interface OrderRow {
  id: number;
  kind: 'limit_buy' | 'limit_sell' | 'stop_loss' | 'take_profit';
  symbol: string;
  mint: string;
  triggerPriceSol: number;
  amountSol: number | null;
  amountPct: number | null;
  expiresAt: string | null;
  createdAt: string;
}
