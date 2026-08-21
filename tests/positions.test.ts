import fs from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db';
import { runMigrations } from '../src/db/migrate';
import * as userRepo from '../src/db/repositories/users';
import * as walletRepo from '../src/db/repositories/wallets';
import { applyBuy, applySell } from '../src/services/positions';
import type { TokenInfo } from '../src/types';

const TOKEN: TokenInfo = {
  mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  symbol: 'BONK',
  name: 'Bonk',
  decimals: 5,
  logo_uri: null,
};

let userId: number;
let walletId: number;

beforeEach(() => {
  runMigrations();
  const db = getDb();
  db.exec('DELETE FROM positions; DELETE FROM wallets; DELETE FROM settings; DELETE FROM users;');

  const user = userRepo.upsert({ telegramId: Math.floor(Math.random() * 1e9) });
  userId = user.id;
  walletId = walletRepo.create({
    userId,
    label: 'Main',
    publicKey: `test${Math.random().toString(36).slice(2)}`,
    encryptedKey: 'v1.x.y.z',
  }).id;
});

afterAll(() => {
  closeDb();
  fs.rmSync('./data/test.db', { force: true });
  fs.rmSync('./data/test.db-wal', { force: true });
  fs.rmSync('./data/test.db-shm', { force: true });
});

const buy = (tokenAmount: number, solSpent: number) =>
  applyBuy({ userId, walletId, token: TOKEN, tokenAmount, solSpent });

const sell = (tokenAmount: number, solReceived: number) =>
  applySell({ userId, walletId, token: TOKEN, tokenAmount, solReceived });

describe('position accounting', () => {
  it('averages the cost basis across several buys', () => {
    buy(1000, 1);
    const position = buy(1000, 3);

    expect(position.token_amount).toBe(2000);
    expect(position.cost_basis_sol).toBe(4);
    // Average entry is 0.002 SOL, not the 0.001 of the first fill.
    expect(position.cost_basis_sol / position.token_amount).toBeCloseTo(0.002, 9);
  });

  it('books profit on a partial exit and leaves the rest at the same average', () => {
    buy(1000, 2);
    const { position, realizedPnlSol } = sell(500, 1.6);

    expect(realizedPnlSol).toBeCloseTo(0.6, 9);
    expect(position.token_amount).toBe(500);
    expect(position.cost_basis_sol).toBeCloseTo(1, 9);
    expect(position.realized_pnl_sol).toBeCloseTo(0.6, 9);
  });

  it('books a loss when the exit is below the average entry', () => {
    buy(1000, 2);
    const { realizedPnlSol } = sell(1000, 1.25);
    expect(realizedPnlSol).toBeCloseTo(-0.75, 9);
  });

  it('accumulates realised PnL across multiple exits', () => {
    buy(1000, 2);
    sell(500, 1.6);
    const { position } = sell(500, 0.5);

    expect(position.token_amount).toBe(0);
    expect(position.cost_basis_sol).toBeCloseTo(0, 9);
    expect(position.realized_pnl_sol).toBeCloseTo(0.1, 9);
  });

  it('treats an unbooked holding as pure profit rather than dividing by zero', () => {
    // Tokens airdropped straight to the wallet were never bought through us.
    const { realizedPnlSol, position } = sell(500, 0.4);
    expect(realizedPnlSol).toBe(0.4);
    expect(position.token_amount).toBe(0);
  });

  it('never drives the holding or basis negative on an oversized sell', () => {
    buy(1000, 2);
    const { position } = sell(5000, 3);
    expect(position.token_amount).toBe(0);
    expect(position.cost_basis_sol).toBeGreaterThanOrEqual(0);
  });
});
