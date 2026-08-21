import { getDb } from '../index';
import type { Wallet } from '../../types';

export const create = (input: {
  userId: number;
  label: string;
  publicKey: string;
  encryptedKey: string;
  makeActive?: boolean;
}): Wallet => {
  const db = getDb();
  return db.transaction(() => {
    if (input.makeActive !== false) {
      db.prepare('UPDATE wallets SET is_active = 0 WHERE user_id = ?').run(input.userId);
    }
    const result = db
      .prepare(
        `INSERT INTO wallets (user_id, label, public_key, encrypted_key, is_active)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        input.userId,
        input.label,
        input.publicKey,
        input.encryptedKey,
        input.makeActive === false ? 0 : 1,
      );
    return db.prepare('SELECT * FROM wallets WHERE id = ?').get(result.lastInsertRowid) as Wallet;
  })();
};

export const listByUser = (userId: number): Wallet[] =>
  getDb()
    .prepare('SELECT * FROM wallets WHERE user_id = ? ORDER BY created_at ASC')
    .all(userId) as Wallet[];

export const getActive = (userId: number): Wallet | undefined =>
  getDb()
    .prepare('SELECT * FROM wallets WHERE user_id = ? AND is_active = 1 LIMIT 1')
    .get(userId) as Wallet | undefined;

export const findById = (id: number): Wallet | undefined =>
  getDb().prepare('SELECT * FROM wallets WHERE id = ?').get(id) as Wallet | undefined;

export const findByPublicKey = (publicKey: string): Wallet | undefined =>
  getDb().prepare('SELECT * FROM wallets WHERE public_key = ?').get(publicKey) as
    | Wallet
    | undefined;

export const setActive = (userId: number, walletId: number): void => {
  const db = getDb();
  db.transaction(() => {
    db.prepare('UPDATE wallets SET is_active = 0 WHERE user_id = ?').run(userId);
    db.prepare('UPDATE wallets SET is_active = 1 WHERE id = ? AND user_id = ?').run(
      walletId,
      userId,
    );
  })();
};

export const rename = (walletId: number, label: string): void => {
  getDb().prepare('UPDATE wallets SET label = ? WHERE id = ?').run(label, walletId);
};

export const remove = (userId: number, walletId: number): void => {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM wallets WHERE id = ? AND user_id = ?').run(walletId, userId);
    const remaining = listByUser(userId);
    const stillActive = remaining.some((wallet) => wallet.is_active === 1);
    if (!stillActive && remaining[0]) {
      db.prepare('UPDATE wallets SET is_active = 1 WHERE id = ?').run(remaining[0].id);
    }
  })();
};
