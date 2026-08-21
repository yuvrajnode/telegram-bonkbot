import { getDb } from '../index';
import type { Position } from '../../types';

/** Dust below this is treated as a closed position. */
const DUST_THRESHOLD = 1e-9;

export const find = (walletId: number, mint: string): Position | undefined =>
  getDb().prepare('SELECT * FROM positions WHERE wallet_id = ? AND mint = ?').get(walletId, mint) as
    | Position
    | undefined;

export const listByUser = (userId: number): Position[] =>
  getDb()
    .prepare(
      `SELECT * FROM positions WHERE user_id = ? AND token_amount > ?
        ORDER BY updated_at DESC`,
    )
    .all(userId, DUST_THRESHOLD) as Position[];

export const listByWallet = (walletId: number): Position[] =>
  getDb()
    .prepare('SELECT * FROM positions WHERE wallet_id = ? AND token_amount > ? ORDER BY updated_at DESC')
    .all(walletId, DUST_THRESHOLD) as Position[];

export interface UpsertPositionInput {
  userId: number;
  walletId: number;
  mint: string;
  symbol: string;
  decimals: number;
  tokenAmount: number;
  costBasisSol: number;
  realizedPnlSol: number;
}

export const upsert = (input: UpsertPositionInput): Position => {
  getDb()
    .prepare(
      `INSERT INTO positions (
         user_id, wallet_id, mint, symbol, decimals,
         token_amount, cost_basis_sol, realized_pnl_sol, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(wallet_id, mint) DO UPDATE SET
         symbol = excluded.symbol,
         decimals = excluded.decimals,
         token_amount = excluded.token_amount,
         cost_basis_sol = excluded.cost_basis_sol,
         realized_pnl_sol = excluded.realized_pnl_sol,
         updated_at = datetime('now')`,
    )
    .run(
      input.userId,
      input.walletId,
      input.mint,
      input.symbol,
      input.decimals,
      input.tokenAmount,
      input.costBasisSol,
      input.realizedPnlSol,
    );
  return find(input.walletId, input.mint)!;
};

/** Every mint anyone still holds — the watcher polls exactly this set. */
export const distinctOpenMints = (): string[] =>
  getDb()
    .prepare('SELECT DISTINCT mint FROM positions WHERE token_amount > ?')
    .all(DUST_THRESHOLD)
    .map((row) => (row as { mint: string }).mint);
