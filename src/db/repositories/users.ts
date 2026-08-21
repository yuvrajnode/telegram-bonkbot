import crypto from 'node:crypto';
import { getDb } from '../index';
import type { Settings, User } from '../../types';
import { env } from '../../config/env';

const REFERRAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const newReferralCode = (): string => {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => REFERRAL_ALPHABET[b % REFERRAL_ALPHABET.length]).join('');
};

export interface UpsertUserInput {
  telegramId: number;
  username?: string | undefined;
  firstName?: string | undefined;
  referralCode?: string | undefined;
}

export const findByTelegramId = (telegramId: number): User | undefined =>
  getDb().prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as User | undefined;

export const findById = (id: number): User | undefined =>
  getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;

export const findByReferralCode = (code: string): User | undefined =>
  getDb().prepare('SELECT * FROM users WHERE referral_code = ?').get(code) as User | undefined;

/**
 * Creates the user on first contact and refreshes the Telegram profile fields
 * on every later one. Referrals only stick on creation: nobody gets to
 * re-attribute an existing account by replaying a /start link.
 */
export const upsert = (input: UpsertUserInput): User => {
  const db = getDb();
  const existing = findByTelegramId(input.telegramId);

  if (existing) {
    db.prepare(
      `UPDATE users
          SET username = ?, first_name = ?, last_seen_at = datetime('now')
        WHERE id = ?`,
    ).run(input.username ?? null, input.firstName ?? null, existing.id);
    return findById(existing.id)!;
  }

  const referrer = input.referralCode ? findByReferralCode(input.referralCode) : undefined;

  let code = newReferralCode();
  while (findByReferralCode(code)) code = newReferralCode();

  const result = db
    .prepare(
      `INSERT INTO users (telegram_id, username, first_name, referred_by, referral_code)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.telegramId,
      input.username ?? null,
      input.firstName ?? null,
      referrer?.id ?? null,
      code,
    );

  const userId = Number(result.lastInsertRowid);
  db.prepare(
    `INSERT INTO settings (user_id, slippage_bps, priority_fee_lamports)
     VALUES (?, ?, ?)`,
  ).run(userId, env.trading.defaultSlippageBps, env.trading.defaultPriorityFeeLamports);

  return findById(userId)!;
};

export const getSettings = (userId: number): Settings => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as
    | Settings
    | undefined;
  if (row) return row;

  db.prepare(
    `INSERT INTO settings (user_id, slippage_bps, priority_fee_lamports) VALUES (?, ?, ?)`,
  ).run(userId, env.trading.defaultSlippageBps, env.trading.defaultPriorityFeeLamports);
  return db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as Settings;
};

type SettingsPatch = Partial<
  Pick<
    Settings,
    | 'slippage_bps'
    | 'priority_fee_lamports'
    | 'buy_presets_sol'
    | 'sell_presets_pct'
    | 'confirm_before_trade'
    | 'mev_protection'
  >
>;

export const updateSettings = (userId: number, patch: SettingsPatch): Settings => {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return getSettings(userId);

  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  getDb()
    .prepare(`UPDATE settings SET ${assignments}, updated_at = datetime('now') WHERE user_id = ?`)
    .run(...entries.map(([, value]) => value), userId);

  return getSettings(userId);
};

export const countReferrals = (userId: number): number =>
  (
    getDb().prepare('SELECT COUNT(*) AS n FROM users WHERE referred_by = ?').get(userId) as {
      n: number;
    }
  ).n;

export const listAll = (): User[] =>
  getDb().prepare('SELECT * FROM users ORDER BY created_at DESC').all() as User[];
