import { PublicKey } from '@solana/web3.js';
import * as copyRepo from '../db/repositories/copy';
import * as notificationRepo from '../db/repositories/notifications';
import * as positionRepo from '../db/repositories/positions';
import * as userRepo from '../db/repositories/users';
import * as walletRepo from '../db/repositories/wallets';
import { SOL_MINT } from '../lib/constants';
import { UserFacingError } from '../lib/errors';
import { child } from '../lib/logger';
import { isValidAddress, withFailover } from './solana';
import { getTokenInfo } from './tokens';
import * as safety from './safety';
import * as trading from './trading';
import type { CopyTarget } from '../db/repositories/copy';

const log = child('copytrade');

const MAX_TARGETS_PER_USER = 5;
const MIN_SIZE_SOL = 0.01;

/** Transactions pulled per target per pass. A busy wallet still catches up. */
const SCAN_LIMIT = 10;

/** Anything smaller than this in the target's wallet is noise, not a trade. */
const DUST = 1e-9;

export interface DetectedSwap {
  side: 'buy' | 'sell';
  mint: string;
  /** How much of the token the target gained or lost, in UI units. */
  tokenAmount: number;
  /** Fraction of the target's holding they exited, 0..1. Sells only. */
  exitFraction?: number;
}

export const follow = async (input: {
  userId: number;
  walletId: number;
  address: string;
  sizeSol: number;
  label?: string;
}): Promise<CopyTarget> => {
  if (!isValidAddress(input.address)) {
    throw new UserFacingError('That is not a valid wallet address.');
  }

  const wallet = walletRepo.findById(input.walletId);
  if (wallet?.public_key === input.address) {
    throw new UserFacingError('You cannot copy your own wallet.');
  }

  if (input.sizeSol < MIN_SIZE_SOL) {
    throw new UserFacingError(`The minimum copy size is ${MIN_SIZE_SOL} SOL.`);
  }

  if (copyRepo.listByUser(input.userId).length >= MAX_TARGETS_PER_USER) {
    throw new UserFacingError(`You can follow at most ${MAX_TARGETS_PER_USER} wallets.`);
  }

  if (copyRepo.findByAddress(input.userId, input.address)) {
    throw new UserFacingError('You already follow that wallet.');
  }

  const target = copyRepo.create({
    userId: input.userId,
    walletId: input.walletId,
    targetAddress: input.address,
    sizeSol: input.sizeSol,
    ...(input.label ? { label: input.label } : {}),
  });

  // Start from the present. Replaying a wallet's history on follow would open
  // a dozen positions at prices that are hours or days gone.
  const latest = await latestSignature(input.address);
  if (latest) copyRepo.setCursor(target.id, latest);

  log.info({ userId: input.userId, address: input.address }, 'following wallet');
  return copyRepo.findById(target.id)!;
};

export const unfollow = (userId: number, id: number): void => {
  if (!copyRepo.remove(userId, id)) {
    throw new UserFacingError('That follow does not exist, or is not yours.');
  }
};

export const list = (userId: number): CopyTarget[] => copyRepo.listByUser(userId);

const latestSignature = async (address: string): Promise<string | undefined> => {
  const signatures = await withFailover((connection) =>
    connection.getSignaturesForAddress(new PublicKey(address), { limit: 1 }),
  );
  return signatures[0]?.signature;
};

/**
 * Works out what a wallet did in a transaction from its balance deltas rather
 * than by decoding instructions. Every AMM and aggregator encodes swaps
 * differently and new ones appear weekly, but the effect on balances is
 * identical: SOL out and a token in, or the reverse.
 */
export const detectSwap = (input: {
  owner: string;
  preTokens: Array<{ owner?: string; mint: string; uiAmount: number }>;
  postTokens: Array<{ owner?: string; mint: string; uiAmount: number }>;
  solDelta: number;
}): DetectedSwap | undefined => {
  const before = new Map<string, number>();
  const after = new Map<string, number>();

  for (const entry of input.preTokens) {
    if (entry.owner === input.owner) before.set(entry.mint, entry.uiAmount);
  }
  for (const entry of input.postTokens) {
    if (entry.owner === input.owner) after.set(entry.mint, entry.uiAmount);
  }

  const mints = new Set([...before.keys(), ...after.keys()]);
  let best: DetectedSwap | undefined;
  let bestMagnitude = 0;

  for (const mint of mints) {
    if (mint === SOL_MINT) continue;

    const from = before.get(mint) ?? 0;
    const to = after.get(mint) ?? 0;
    const delta = to - from;

    if (Math.abs(delta) <= DUST) continue;

    // Pair the token move with SOL moving the other way; a transfer in or out
    // leaves SOL untouched and is not a trade worth mirroring.
    const looksLikeBuy = delta > 0 && input.solDelta < 0;
    const looksLikeSell = delta < 0 && input.solDelta > 0;
    if (!looksLikeBuy && !looksLikeSell) continue;

    if (Math.abs(delta) > bestMagnitude) {
      bestMagnitude = Math.abs(delta);
      best = looksLikeBuy
        ? { side: 'buy', mint, tokenAmount: delta }
        : {
            side: 'sell',
            mint,
            tokenAmount: Math.abs(delta),
            exitFraction: from > 0 ? Math.min(Math.abs(delta) / from, 1) : 1,
          };
    }
  }

  return best;
};

const swapsSince = async (
  target: CopyTarget,
): Promise<Array<{ signature: string; swap: DetectedSwap }>> => {
  const address = new PublicKey(target.target_address);

  const signatures = await withFailover((connection) =>
    connection.getSignaturesForAddress(address, {
      limit: SCAN_LIMIT,
      ...(target.last_signature ? { until: target.last_signature } : {}),
    }),
  );

  // Newest first from the RPC; mirror in the order the target actually traded.
  const ordered = signatures.filter((entry) => !entry.err).reverse();
  const found: Array<{ signature: string; swap: DetectedSwap }> = [];

  for (const entry of ordered) {
    const parsed = await withFailover((connection) =>
      connection.getParsedTransaction(entry.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      }),
    ).catch(() => null);

    if (!parsed?.meta) continue;

    const accounts = parsed.transaction.message.accountKeys.map((key) => key.pubkey.toBase58());
    const index = accounts.indexOf(target.target_address);
    if (index < 0) continue;

    const solDelta =
      ((parsed.meta.postBalances[index] ?? 0) - (parsed.meta.preBalances[index] ?? 0)) / 1e9;

    const swap = detectSwap({
      owner: target.target_address,
      preTokens: (parsed.meta.preTokenBalances ?? []).map((balance) => ({
        ...(balance.owner ? { owner: balance.owner } : {}),
        mint: balance.mint,
        uiAmount: balance.uiTokenAmount.uiAmount ?? 0,
      })),
      postTokens: (parsed.meta.postTokenBalances ?? []).map((balance) => ({
        ...(balance.owner ? { owner: balance.owner } : {}),
        mint: balance.mint,
        uiAmount: balance.uiTokenAmount.uiAmount ?? 0,
      })),
      solDelta,
    });

    if (swap) found.push({ signature: entry.signature, swap });
  }

  return found;
};

const mirror = async (
  target: CopyTarget,
  signature: string,
  swap: DetectedSwap,
): Promise<void> => {
  if (!copyRepo.claimFill({ targetId: target.id, signature, side: swap.side, mint: swap.mint })) {
    return;
  }

  const wallet = walletRepo.findById(target.wallet_id);
  if (!wallet) return;

  const settings = userRepo.getSettings(target.user_id);

  try {
    if (swap.side === 'buy') {
      // The follower's own safety rules still apply. Copying someone into a
      // honeypot is worse than missing the trade.
      const report = await safety.analyze(swap.mint).catch(() => undefined);
      if (report && safety.isBlocking(report)) {
        notificationRepo.enqueue(target.user_id, 'copy_skipped', {
          address: target.target_address,
          symbol: report.symbol,
          reason: report.flags.find((flag) => flag.severity === 'critical')?.label ?? 'unsafe',
        });
        return;
      }

      const result = await trading.buy({
        userId: target.user_id,
        wallet,
        mint: swap.mint,
        amountSol: target.size_sol,
        slippageBps: settings.slippage_bps,
        priorityFeeLamports: settings.priority_fee_lamports,
        mevProtection: Boolean(settings.mev_protection),
        source: 'manual',
      });

      copyRepo.countFill(target.id);
      notificationRepo.enqueue(target.user_id, 'copy_filled', {
        address: target.target_address,
        side: 'buy',
        symbol: result.token.symbol,
        solAmount: result.solAmount,
        tokenAmount: result.tokenAmount,
        signature: result.signature,
      });
      return;
    }

    if (!target.mirror_sells) return;

    // Only sell what we actually hold, and only in the proportion the target
    // exited. They may be trimming, not leaving.
    const held = positionRepo.find(target.wallet_id, swap.mint);
    if (!held || held.token_amount <= DUST) return;

    const percent = Math.min((swap.exitFraction ?? 1) * 100, 100);
    const result = await trading.sell({
      userId: target.user_id,
      wallet,
      mint: swap.mint,
      percent,
      slippageBps: settings.slippage_bps,
      priorityFeeLamports: settings.priority_fee_lamports,
      mevProtection: Boolean(settings.mev_protection),
      source: 'manual',
    });

    copyRepo.countFill(target.id);
    notificationRepo.enqueue(target.user_id, 'copy_filled', {
      address: target.target_address,
      side: 'sell',
      symbol: result.token.symbol,
      solAmount: result.solAmount,
      tokenAmount: result.tokenAmount,
      signature: result.signature,
    });
  } catch (error) {
    const token = await getTokenInfo(swap.mint).catch(() => undefined);
    notificationRepo.enqueue(target.user_id, 'copy_failed', {
      address: target.target_address,
      symbol: token?.symbol ?? swap.mint.slice(0, 6),
      reason: error instanceof Error ? error.message : String(error),
    });
    log.warn({ err: error, targetId: target.id }, 'mirror failed');
  }
};

export interface CopySweepResult {
  targets: number;
  mirrored: number;
}

export const sweep = async (): Promise<CopySweepResult> => {
  const targets = copyRepo.listActive();
  let mirrored = 0;

  for (const target of targets) {
    try {
      const swaps = await swapsSince(target);

      for (const { signature, swap } of swaps) {
        await mirror(target, signature, swap);
        copyRepo.setCursor(target.id, signature);
        mirrored += 1;
      }
    } catch (error) {
      log.warn({ err: error, targetId: target.id }, 'scan failed');
    }
  }

  return { targets: targets.length, mirrored };
};
