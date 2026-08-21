import { getDb } from '../index';
import type { Trade, TradeSide, TradeSource, TradeStatus } from '../../types';

export interface CreateTradeInput {
  userId: number;
  walletId: number;
  side: TradeSide;
  mint: string;
  symbol: string;
  inAmount: string;
  outAmount: string;
  solAmount: number;
  tokenAmount: number;
  priceSol: number;
  priceUsd?: number | null;
  slippageBps: number;
  signature?: string | null;
  status?: TradeStatus;
  source?: TradeSource;
}

export const create = (input: CreateTradeInput): Trade => {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO trades (
         user_id, wallet_id, side, mint, symbol, in_amount, out_amount,
         sol_amount, token_amount, price_sol, price_usd, slippage_bps,
         signature, status, source
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.walletId,
      input.side,
      input.mint,
      input.symbol,
      input.inAmount,
      input.outAmount,
      input.solAmount,
      input.tokenAmount,
      input.priceSol,
      input.priceUsd ?? null,
      input.slippageBps,
      input.signature ?? null,
      input.status ?? 'pending',
      input.source ?? 'manual',
    );
  return findById(Number(result.lastInsertRowid))!;
};

export const findById = (id: number): Trade | undefined =>
  getDb().prepare('SELECT * FROM trades WHERE id = ?').get(id) as Trade | undefined;

export const markConfirmed = (id: number, signature: string): void => {
  getDb()
    .prepare("UPDATE trades SET status = 'confirmed', signature = ? WHERE id = ?")
    .run(signature, id);
};

export const markFailed = (id: number, error: string): void => {
  getDb().prepare("UPDATE trades SET status = 'failed', error = ? WHERE id = ?").run(error, id);
};

export const listByUser = (userId: number, limit = 20, offset = 0): Trade[] =>
  getDb()
    .prepare(
      `SELECT * FROM trades WHERE user_id = ?
        ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, offset) as Trade[];

export const listByMint = (userId: number, mint: string, limit = 50): Trade[] =>
  getDb()
    .prepare(
      `SELECT * FROM trades WHERE user_id = ? AND mint = ? AND status = 'confirmed'
        ORDER BY created_at ASC LIMIT ?`,
    )
    .all(userId, mint, limit) as Trade[];

export interface TradeStats {
  total: number;
  wins: number;
  losses: number;
  volumeSol: number;
  realizedPnlSol: number;
}

export const statsForUser = (userId: number): TradeStats => {
  const db = getDb();
  const volume = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(sol_amount), 0) AS volume
         FROM trades WHERE user_id = ? AND status = 'confirmed'`,
    )
    .get(userId) as { total: number; volume: number };

  const pnl = db
    .prepare(
      `SELECT COALESCE(SUM(realized_pnl_sol), 0) AS realized,
              SUM(CASE WHEN realized_pnl_sol > 0 THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN realized_pnl_sol < 0 THEN 1 ELSE 0 END) AS losses
         FROM positions WHERE user_id = ?`,
    )
    .get(userId) as { realized: number; wins: number | null; losses: number | null };

  return {
    total: volume.total,
    wins: pnl.wins ?? 0,
    losses: pnl.losses ?? 0,
    volumeSol: volume.volume,
    realizedPnlSol: pnl.realized,
  };
};
