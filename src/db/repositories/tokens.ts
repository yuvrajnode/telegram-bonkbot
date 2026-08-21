import { getDb } from '../index';
import type { TokenInfo } from '../../types';

/** Metadata barely changes; a day-old cache entry is still fine. */
const TTL_MS = 24 * 60 * 60 * 1000;

export const get = (mint: string): TokenInfo | undefined =>
  getDb().prepare('SELECT * FROM tokens WHERE mint = ?').get(mint) as TokenInfo | undefined;

export const getFresh = (mint: string): TokenInfo | undefined => {
  const row = get(mint);
  if (!row?.refreshed_at) return undefined;
  const age = Date.now() - new Date(`${row.refreshed_at.replace(' ', 'T')}Z`).getTime();
  return age < TTL_MS ? row : undefined;
};

export const save = (token: TokenInfo): TokenInfo => {
  getDb()
    .prepare(
      `INSERT INTO tokens (mint, symbol, name, decimals, logo_uri, refreshed_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(mint) DO UPDATE SET
         symbol = excluded.symbol,
         name = excluded.name,
         decimals = excluded.decimals,
         logo_uri = excluded.logo_uri,
         refreshed_at = datetime('now')`,
    )
    .run(token.mint, token.symbol, token.name, token.decimals, token.logo_uri ?? null);
  return get(token.mint)!;
};

export const search = (term: string, limit = 10): TokenInfo[] =>
  getDb()
    .prepare(
      `SELECT * FROM tokens
        WHERE symbol LIKE ? COLLATE NOCASE OR name LIKE ? COLLATE NOCASE
        ORDER BY refreshed_at DESC LIMIT ?`,
    )
    .all(`%${term}%`, `%${term}%`, limit) as TokenInfo[];
