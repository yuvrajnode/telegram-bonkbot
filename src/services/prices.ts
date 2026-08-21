import { env } from '../config/env';
import { SOL_MINT } from '../lib/constants';
import { child } from '../lib/logger';
import { fetchJson } from './http';

const log = child('prices');

/**
 * Prices are read on every quote, every position render and every watcher
 * tick, so an in-process cache with a short TTL saves a lot of upstream
 * calls without ever showing a price older than a few seconds.
 */
const TTL_MS = 5_000;

interface CacheEntry {
  usd: number;
  at: number;
}

const cache = new Map<string, CacheEntry>();

interface PriceApiResponse {
  data: Record<string, { id: string; price: string } | undefined>;
}

const fetchUsdPrices = async (mints: string[]): Promise<Map<string, number>> => {
  const result = new Map<string, number>();
  if (mints.length === 0) return result;

  // The upstream caps the id list; 100 at a time stays comfortably inside it.
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    const url = `${env.solana.priceApiUrl}?ids=${batch.join(',')}`;

    try {
      const response = await fetchJson<PriceApiResponse>(url, { timeoutMs: 6_000 });
      for (const [mint, entry] of Object.entries(response.data ?? {})) {
        const price = Number(entry?.price);
        if (Number.isFinite(price) && price > 0) result.set(mint, price);
      }
    } catch (error) {
      log.warn({ err: error, batch: batch.length }, 'price lookup failed');
    }
  }

  return result;
};

export const getUsdPrices = async (mints: string[]): Promise<Map<string, number>> => {
  const now = Date.now();
  const out = new Map<string, number>();
  const stale: string[] = [];

  for (const mint of mints) {
    const hit = cache.get(mint);
    if (hit && now - hit.at < TTL_MS) out.set(mint, hit.usd);
    else stale.push(mint);
  }

  const fresh = await fetchUsdPrices(stale);
  for (const [mint, usd] of fresh) {
    cache.set(mint, { usd, at: now });
    out.set(mint, usd);
  }

  return out;
};

export const getUsdPrice = async (mint: string): Promise<number | undefined> =>
  (await getUsdPrices([mint])).get(mint);

export const getSolUsdPrice = async (): Promise<number> =>
  (await getUsdPrice(SOL_MINT)) ?? 0;

/** Token price denominated in SOL, which is how positions are booked. */
export const getPriceInSol = async (mint: string): Promise<number | undefined> => {
  if (mint === SOL_MINT) return 1;
  const prices = await getUsdPrices([mint, SOL_MINT]);
  const token = prices.get(mint);
  const sol = prices.get(SOL_MINT);
  if (!token || !sol) return undefined;
  return token / sol;
};

export const getPricesInSol = async (mints: string[]): Promise<Map<string, number>> => {
  const prices = await getUsdPrices([...new Set([...mints, SOL_MINT])]);
  const sol = prices.get(SOL_MINT);
  const out = new Map<string, number>();
  if (!sol) return out;

  for (const mint of mints) {
    if (mint === SOL_MINT) {
      out.set(mint, 1);
      continue;
    }
    const usd = prices.get(mint);
    if (usd) out.set(mint, usd / sol);
  }
  return out;
};

export const clearPriceCache = (): void => cache.clear();
