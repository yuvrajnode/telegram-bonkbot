import { child } from '../lib/logger';

const log = child('http');

export interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

/**
 * Thin fetch wrapper with a timeout and bounded retries. Public Solana
 * infrastructure rate limits aggressively, and a 429 in the middle of a swap
 * is worth one more attempt before the quote goes stale.
 */
export const fetchJson = async <T>(url: string, options: FetchJsonOptions = {}): Promise<T> => {
  const { timeoutMs = 10_000, retries = 2, ...init } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`upstream ${response.status}`);
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`${response.status} ${body.slice(0, 200)}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const backoff = 250 * 2 ** attempt;
        log.debug({ url, attempt, backoff }, 'retrying request');
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};
