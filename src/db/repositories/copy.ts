import { getDb } from '../index';

export interface CopyTarget {
  id: number;
  user_id: number;
  wallet_id: number;
  target_address: string;
  label: string | null;
  size_sol: number;
  mirror_sells: number;
  status: 'active' | 'paused';
  last_signature: string | null;
  copied_count: number;
  created_at: string;
  updated_at: string;
}

export const create = (input: {
  userId: number;
  walletId: number;
  targetAddress: string;
  label?: string | null;
  sizeSol: number;
  mirrorSells?: boolean;
}): CopyTarget => {
  const result = getDb()
    .prepare(
      `INSERT INTO copy_targets (user_id, wallet_id, target_address, label, size_sol, mirror_sells)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.walletId,
      input.targetAddress,
      input.label ?? null,
      input.sizeSol,
      input.mirrorSells === false ? 0 : 1,
    );
  return findById(Number(result.lastInsertRowid))!;
};

export const findById = (id: number): CopyTarget | undefined =>
  getDb().prepare('SELECT * FROM copy_targets WHERE id = ?').get(id) as CopyTarget | undefined;

export const findByAddress = (userId: number, address: string): CopyTarget | undefined =>
  getDb()
    .prepare('SELECT * FROM copy_targets WHERE user_id = ? AND target_address = ?')
    .get(userId, address) as CopyTarget | undefined;

export const listByUser = (userId: number): CopyTarget[] =>
  getDb()
    .prepare('SELECT * FROM copy_targets WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as CopyTarget[];

export const listActive = (): CopyTarget[] =>
  getDb().prepare("SELECT * FROM copy_targets WHERE status = 'active'").all() as CopyTarget[];

export const remove = (userId: number, id: number): boolean =>
  getDb()
    .prepare('DELETE FROM copy_targets WHERE id = ? AND user_id = ?')
    .run(id, userId).changes > 0;

export const setStatus = (id: number, status: 'active' | 'paused'): void => {
  getDb()
    .prepare("UPDATE copy_targets SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, id);
};

export const setCursor = (id: number, signature: string): void => {
  getDb()
    .prepare("UPDATE copy_targets SET last_signature = ?, updated_at = datetime('now') WHERE id = ?")
    .run(signature, id);
};

export const countFill = (id: number): void => {
  getDb().prepare('UPDATE copy_targets SET copied_count = copied_count + 1 WHERE id = ?').run(id);
};

/**
 * Records the attempt whether or not it resulted in a trade. Returns false if
 * this signature was already handled - the scanner can legitimately see the
 * same transaction twice across a restart, and copying it twice costs money.
 */
export const claimFill = (input: {
  targetId: number;
  signature: string;
  side: 'buy' | 'sell';
  mint: string;
  tradeId?: number | null;
  skippedReason?: string | null;
}): boolean => {
  try {
    getDb()
      .prepare(
        `INSERT INTO copy_fills (target_id, source_signature, side, mint, trade_id, skipped_reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.targetId,
        input.signature,
        input.side,
        input.mint,
        input.tradeId ?? null,
        input.skippedReason ?? null,
      );
    return true;
  } catch {
    // UNIQUE(target_id, source_signature, mint) already saw this one.
    return false;
  }
};
