import { getDb } from '../index';
import type { Notification } from '../../types';

export const enqueue = (userId: number, kind: string, payload: unknown): void => {
  getDb()
    .prepare('INSERT INTO notifications (user_id, kind, payload) VALUES (?, ?, ?)')
    .run(userId, kind, JSON.stringify(payload));
};

export const takePending = (limit = 25): Notification[] =>
  getDb()
    .prepare(
      'SELECT * FROM notifications WHERE delivered_at IS NULL ORDER BY created_at ASC LIMIT ?',
    )
    .all(limit) as Notification[];

export const markDelivered = (id: number): void => {
  getDb()
    .prepare("UPDATE notifications SET delivered_at = datetime('now') WHERE id = ?")
    .run(id);
};

export const recordReferralEarning = (
  referrerId: number,
  tradeId: number,
  amountSol: number,
): void => {
  getDb()
    .prepare('INSERT INTO referral_earnings (referrer_id, trade_id, amount_sol) VALUES (?, ?, ?)')
    .run(referrerId, tradeId, amountSol);
};

export const referralEarnings = (referrerId: number): number =>
  (
    getDb()
      .prepare('SELECT COALESCE(SUM(amount_sol), 0) AS total FROM referral_earnings WHERE referrer_id = ?')
      .get(referrerId) as { total: number }
  ).total;
