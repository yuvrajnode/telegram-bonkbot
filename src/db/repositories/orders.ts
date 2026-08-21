import { getDb } from '../index';
import type { Order, OrderKind, OrderStatus } from '../../types';

export interface CreateOrderInput {
  userId: number;
  walletId: number;
  mint: string;
  symbol: string;
  kind: OrderKind;
  triggerPriceSol: number;
  amountSol?: number | null;
  amountPct?: number | null;
  expiresAt?: string | null;
}

export const create = (input: CreateOrderInput): Order => {
  const result = getDb()
    .prepare(
      `INSERT INTO orders (
         user_id, wallet_id, mint, symbol, kind,
         trigger_price_sol, amount_sol, amount_pct, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.walletId,
      input.mint,
      input.symbol,
      input.kind,
      input.triggerPriceSol,
      input.amountSol ?? null,
      input.amountPct ?? null,
      input.expiresAt ?? null,
    );
  return findById(Number(result.lastInsertRowid))!;
};

export const findById = (id: number): Order | undefined =>
  getDb().prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order | undefined;

export const listOpenByUser = (userId: number): Order[] =>
  getDb()
    .prepare("SELECT * FROM orders WHERE user_id = ? AND status = 'open' ORDER BY created_at DESC")
    .all(userId) as Order[];

export const listOpen = (): Order[] =>
  getDb().prepare("SELECT * FROM orders WHERE status = 'open'").all() as Order[];

export const listOpenMints = (): string[] =>
  getDb()
    .prepare("SELECT DISTINCT mint FROM orders WHERE status = 'open'")
    .all()
    .map((row) => (row as { mint: string }).mint);

export const setStatus = (id: number, status: OrderStatus, tradeId?: number | null): void => {
  getDb()
    .prepare(
      `UPDATE orders SET status = ?, trade_id = COALESCE(?, trade_id), updated_at = datetime('now')
        WHERE id = ?`,
    )
    .run(status, tradeId ?? null, id);
};

export const cancel = (userId: number, orderId: number): boolean => {
  const result = getDb()
    .prepare(
      `UPDATE orders SET status = 'cancelled', updated_at = datetime('now')
        WHERE id = ? AND user_id = ? AND status = 'open'`,
    )
    .run(orderId, userId);
  return result.changes > 0;
};

export const expireStale = (): number =>
  getDb()
    .prepare(
      `UPDATE orders SET status = 'expired', updated_at = datetime('now')
        WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at < datetime('now')`,
    )
    .run().changes;
