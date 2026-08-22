import crypto from 'node:crypto';

/**
 * Telegram caps callback data at 64 bytes and a mint alone eats 44 of them,
 * so a pending confirmation is parked here and the button only carries a
 * short handle. Entries are dropped once used or once they go stale.
 */
export interface TradeIntent {
  userId: number;
  side: 'buy' | 'sell';
  mint: string;
  amountSol?: number;
  percent?: number;
  createdAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const intents = new Map<string, TradeIntent>();

const sweep = (): void => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, intent] of intents) {
    if (intent.createdAt < cutoff) intents.delete(id);
  }
};

export const remember = (intent: Omit<TradeIntent, 'createdAt'>): string => {
  sweep();
  const id = crypto.randomBytes(6).toString('base64url');
  intents.set(id, { ...intent, createdAt: Date.now() });
  return id;
};

export const take = (id: string, userId: number): TradeIntent | undefined => {
  const intent = intents.get(id);
  if (!intent || intent.userId !== userId) return undefined;
  intents.delete(id);
  return Date.now() - intent.createdAt < TTL_MS ? intent : undefined;
};

export const size = (): number => intents.size;

export interface WithdrawIntent {
  userId: number;
  walletId: number;
  destination: string;
  /** Absent for a SOL withdrawal. */
  mint?: string;
  amount: number;
  percent?: number;
  symbol: string;
  createdAt: number;
}

const withdrawals = new Map<string, WithdrawIntent>();

export const rememberWithdrawal = (intent: Omit<WithdrawIntent, 'createdAt'>): string => {
  const id = crypto.randomBytes(6).toString('base64url');
  withdrawals.set(id, { ...intent, createdAt: Date.now() });
  return id;
};

export const takeWithdrawal = (id: string, userId: number): WithdrawIntent | undefined => {
  const intent = withdrawals.get(id);
  if (!intent || intent.userId !== userId) return undefined;
  withdrawals.delete(id);
  return Date.now() - intent.createdAt < TTL_MS ? intent : undefined;
};
