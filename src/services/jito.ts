import { VersionedTransaction } from '@solana/web3.js';
import { env } from '../config/env';
import { child } from '../lib/logger';
import { TransactionFailedError } from '../lib/errors';
import { fetchJson } from './http';

const log = child('jito');

/**
 * Jito submission path, used when a user turns on MEV protection.
 *
 * A swap sent to a normal RPC sits in the public mempool where a sandwich bot
 * can see it, front-run it, and sell into the price it just moved. A bundle
 * goes straight to a block builder instead: it is never gossiped, and it
 * either lands atomically in the block or not at all. The cost is the tip.
 */

interface BundleResponse {
  result?: string;
  error?: { code: number; message: string };
}

interface BundleStatusResponse {
  result?: {
    value: Array<{
      bundle_id: string;
      transactions: string[];
      slot: number;
      confirmation_status: string | null;
      err: { Ok: null } | unknown;
    }>;
  };
}

const rpc = async <T>(method: string, params: unknown[]): Promise<T> =>
  fetchJson<T>(`${env.jito.blockEngineUrl}/bundles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    timeoutMs: 10_000,
    retries: 1,
  });

export const sendBundle = async (transactions: VersionedTransaction[]): Promise<string> => {
  const encoded = transactions.map((transaction) =>
    Buffer.from(transaction.serialize()).toString('base64'),
  );

  const response = await rpc<BundleResponse>('sendBundle', [encoded, { encoding: 'base64' }]);

  if (response.error || !response.result) {
    throw new TransactionFailedError(
      `Jito rejected the bundle: ${response.error?.message ?? 'no bundle id returned'}`,
    );
  }

  log.debug({ bundleId: response.result }, 'bundle submitted');
  return response.result;
};

export type BundleOutcome = 'landed' | 'pending' | 'failed';

export const getBundleStatus = async (bundleId: string): Promise<BundleOutcome> => {
  try {
    const response = await rpc<BundleStatusResponse>('getBundleStatuses', [[bundleId]]);
    const status = response.result?.value?.[0];

    if (!status) return 'pending';
    if (status.confirmation_status === 'confirmed' || status.confirmation_status === 'finalized') {
      return 'landed';
    }
    return 'pending';
  } catch (error) {
    log.debug({ err: error, bundleId }, 'status lookup failed');
    return 'pending';
  }
};

/**
 * Bundles are all-or-nothing and there is no queue to wait in: if the builder
 * does not include it within a few slots, it never will. Give up quickly and
 * let the caller decide whether to retry with a bigger tip.
 */
export const waitForBundle = async (bundleId: string, timeoutMs = 20_000): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const outcome = await getBundleStatus(bundleId);
    if (outcome === 'landed') return true;
    if (outcome === 'failed') return false;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  return false;
};

export const tipLamports = (): number => env.jito.tipLamports;
