import * as tradeRepo from '../db/repositories/trades';
import * as userRepo from '../db/repositories/users';
import * as notificationRepo from '../db/repositories/notifications';
import { SOL_MINT, SOL_RESERVE_LAMPORTS, BPS_DENOMINATOR } from '../lib/constants';
import { InsufficientBalanceError, UserFacingError } from '../lib/errors';
import { fromBaseUnits, lamportsToSol, solToLamports, toBaseUnits } from '../lib/format';
import { child } from '../lib/logger';
import { env } from '../config/env';
import { buildSwapTransaction, getQuote, priceImpactPct, routeLabels } from './jupiter';
import { getSolBalance, getTokenBalance, sendAndConfirm } from './solana';
import { getTokenInfo } from './tokens';
import { getSolUsdPrice } from './prices';
import { getKeypair } from './wallets';
import * as positions from './positions';
import type { TokenInfo, Trade, TradeSource, Wallet } from '../types';

const log = child('trading');

export interface TradePreview {
  token: TokenInfo;
  inAmount: bigint;
  outAmount: bigint;
  /** Human amounts, already scaled by decimals. */
  inUi: number;
  outUi: number;
  priceSol: number;
  priceImpact: number;
  minReceived: number;
  route: string[];
  slippageBps: number;
}

export interface BuyParams {
  userId: number;
  wallet: Wallet;
  mint: string;
  amountSol: number;
  slippageBps: number;
  priorityFeeLamports: number;
  source?: TradeSource;
}

export interface SellParams {
  userId: number;
  wallet: Wallet;
  mint: string;
  /** Percentage of the current holding, 0 < pct <= 100. */
  percent: number;
  slippageBps: number;
  priorityFeeLamports: number;
  source?: TradeSource;
}

export interface TradeResult {
  trade: Trade;
  signature: string;
  token: TokenInfo;
  solAmount: number;
  tokenAmount: number;
  realizedPnlSol?: number;
}

const assertSolHeadroom = async (publicKey: string, amountSol: number): Promise<void> => {
  const balance = await getSolBalance(publicKey);
  const needed = amountSol + lamportsToSol(SOL_RESERVE_LAMPORTS);

  if (balance < needed) {
    throw new InsufficientBalanceError(`${needed.toFixed(4)} SOL`, `${balance.toFixed(4)} SOL`);
  }
};

export const previewBuy = async (params: BuyParams): Promise<TradePreview> => {
  const token = await getTokenInfo(params.mint);
  const lamports = solToLamports(params.amountSol);

  const quote = await getQuote({
    inputMint: SOL_MINT,
    outputMint: params.mint,
    amount: lamports,
    slippageBps: params.slippageBps,
  });

  const outUi = fromBaseUnits(quote.outAmount, token.decimals);

  return {
    token,
    inAmount: lamports,
    outAmount: BigInt(quote.outAmount),
    inUi: params.amountSol,
    outUi,
    priceSol: outUi > 0 ? params.amountSol / outUi : 0,
    priceImpact: priceImpactPct(quote),
    minReceived: fromBaseUnits(quote.otherAmountThreshold, token.decimals),
    route: routeLabels(quote),
    slippageBps: params.slippageBps,
  };
};

export const previewSell = async (params: SellParams): Promise<TradePreview> => {
  const token = await getTokenInfo(params.mint);
  const balance = await getTokenBalance(params.wallet.public_key, params.mint);

  if (!balance || balance.amount <= 0) {
    throw new UserFacingError(`You do not hold any ${token.symbol}.`);
  }

  const rawTotal = BigInt(balance.rawAmount);
  const sellRaw =
    params.percent >= 100
      ? rawTotal
      : (rawTotal * BigInt(Math.round(params.percent * 100))) / BigInt(10_000);

  if (sellRaw <= 0n) {
    throw new UserFacingError('That percentage rounds down to zero tokens.');
  }

  const quote = await getQuote({
    inputMint: params.mint,
    outputMint: SOL_MINT,
    amount: sellRaw,
    slippageBps: params.slippageBps,
  });

  const inUi = fromBaseUnits(sellRaw, token.decimals);
  const outUi = lamportsToSol(BigInt(quote.outAmount));

  return {
    token,
    inAmount: sellRaw,
    outAmount: BigInt(quote.outAmount),
    inUi,
    outUi,
    priceSol: inUi > 0 ? outUi / inUi : 0,
    priceImpact: priceImpactPct(quote),
    minReceived: lamportsToSol(BigInt(quote.otherAmountThreshold)),
    route: routeLabels(quote),
    slippageBps: params.slippageBps,
  };
};

/**
 * Quotes go stale in seconds, so execution re-quotes immediately before
 * signing rather than reusing whatever the preview showed the user. The
 * preview is a display artifact; the fresh quote is the contract.
 */
const executeSwap = async (args: {
  userId: number;
  wallet: Wallet;
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
  priorityFeeLamports: number;
}): Promise<{ signature: string; outAmount: bigint }> => {
  const quote = await getQuote({
    inputMint: args.inputMint,
    outputMint: args.outputMint,
    amount: args.amount,
    slippageBps: args.slippageBps,
  });

  const transaction = await buildSwapTransaction({
    quote,
    userPublicKey: args.wallet.public_key,
    priorityFeeLamports: args.priorityFeeLamports,
  });

  transaction.sign([getKeypair(args.wallet)]);
  const signature = await sendAndConfirm(transaction);

  return { signature, outAmount: BigInt(quote.outAmount) };
};

const creditReferrer = (userId: number, tradeId: number, solAmount: number): void => {
  if (env.trading.platformFeeBps <= 0) return;

  const user = userRepo.findById(userId);
  if (!user?.referred_by) return;

  // Referrers earn a quarter of whatever the deployment charged on the trade.
  const fee = (solAmount * env.trading.platformFeeBps) / BPS_DENOMINATOR;
  notificationRepo.recordReferralEarning(user.referred_by, tradeId, fee * 0.25);
};

export const buy = async (params: BuyParams): Promise<TradeResult> => {
  const token = await getTokenInfo(params.mint);
  await assertSolHeadroom(params.wallet.public_key, params.amountSol);

  const lamports = solToLamports(params.amountSol);
  const solUsd = await getSolUsdPrice().catch(() => 0);

  const trade = tradeRepo.create({
    userId: params.userId,
    walletId: params.wallet.id,
    side: 'buy',
    mint: params.mint,
    symbol: token.symbol,
    inAmount: lamports.toString(),
    outAmount: '0',
    solAmount: params.amountSol,
    tokenAmount: 0,
    priceSol: 0,
    slippageBps: params.slippageBps,
    source: params.source ?? 'manual',
  });

  try {
    const { signature, outAmount } = await executeSwap({
      userId: params.userId,
      wallet: params.wallet,
      inputMint: SOL_MINT,
      outputMint: params.mint,
      amount: lamports,
      slippageBps: params.slippageBps,
      priorityFeeLamports: params.priorityFeeLamports,
    });

    const tokenAmount = fromBaseUnits(outAmount, token.decimals);
    const priceSol = tokenAmount > 0 ? params.amountSol / tokenAmount : 0;

    tradeRepo.markConfirmed(trade.id, signature);
    tradeRepo.finalizeAmounts(trade.id, {
      outAmount: outAmount.toString(),
      tokenAmount,
      priceSol,
      priceUsd: solUsd > 0 ? priceSol * solUsd : null,
    });

    positions.applyBuy({
      userId: params.userId,
      walletId: params.wallet.id,
      token,
      tokenAmount,
      solSpent: params.amountSol,
    });

    creditReferrer(params.userId, trade.id, params.amountSol);
    log.info({ signature, mint: params.mint, sol: params.amountSol }, 'buy filled');

    return {
      trade: tradeRepo.findById(trade.id)!,
      signature,
      token,
      solAmount: params.amountSol,
      tokenAmount,
    };
  } catch (error) {
    tradeRepo.markFailed(trade.id, error instanceof Error ? error.message : String(error));
    throw error;
  }
};

export const sell = async (params: SellParams): Promise<TradeResult> => {
  const token = await getTokenInfo(params.mint);
  const balance = await getTokenBalance(params.wallet.public_key, params.mint);

  if (!balance || balance.amount <= 0) {
    throw new UserFacingError(`You do not hold any ${token.symbol}.`);
  }

  const rawTotal = BigInt(balance.rawAmount);
  const sellRaw =
    params.percent >= 100
      ? rawTotal
      : (rawTotal * BigInt(Math.round(params.percent * 100))) / BigInt(10_000);

  if (sellRaw <= 0n) {
    throw new UserFacingError('That percentage rounds down to zero tokens.');
  }

  const tokenAmount = fromBaseUnits(sellRaw, token.decimals);
  const solUsd = await getSolUsdPrice().catch(() => 0);

  const trade = tradeRepo.create({
    userId: params.userId,
    walletId: params.wallet.id,
    side: 'sell',
    mint: params.mint,
    symbol: token.symbol,
    inAmount: sellRaw.toString(),
    outAmount: '0',
    solAmount: 0,
    tokenAmount,
    priceSol: 0,
    slippageBps: params.slippageBps,
    source: params.source ?? 'manual',
  });

  try {
    const { signature, outAmount } = await executeSwap({
      userId: params.userId,
      wallet: params.wallet,
      inputMint: params.mint,
      outputMint: SOL_MINT,
      amount: sellRaw,
      slippageBps: params.slippageBps,
      priorityFeeLamports: params.priorityFeeLamports,
    });

    const solReceived = lamportsToSol(outAmount);
    const priceSol = tokenAmount > 0 ? solReceived / tokenAmount : 0;

    tradeRepo.markConfirmed(trade.id, signature);
    tradeRepo.finalizeAmounts(trade.id, {
      outAmount: outAmount.toString(),
      solAmount: solReceived,
      priceSol,
      priceUsd: solUsd > 0 ? priceSol * solUsd : null,
    });

    const { realizedPnlSol } = positions.applySell({
      userId: params.userId,
      walletId: params.wallet.id,
      token,
      tokenAmount,
      solReceived,
    });

    creditReferrer(params.userId, trade.id, solReceived);
    log.info({ signature, mint: params.mint, sol: solReceived }, 'sell filled');

    return {
      trade: tradeRepo.findById(trade.id)!,
      signature,
      token,
      solAmount: solReceived,
      tokenAmount,
      realizedPnlSol,
    };
  } catch (error) {
    tradeRepo.markFailed(trade.id, error instanceof Error ? error.message : String(error));
    throw error;
  }
};

/** Convenience for the sell-by-amount path used by limit orders. */
export const sellTokens = async (
  params: Omit<SellParams, 'percent'> & { tokenAmount: number },
): Promise<TradeResult> => {
  const balance = await getTokenBalance(params.wallet.public_key, params.mint);
  if (!balance || balance.amount <= 0) {
    throw new UserFacingError('Nothing left to sell.');
  }
  const percent = Math.min((params.tokenAmount / balance.amount) * 100, 100);
  return sell({ ...params, percent });
};

export const unusedReserveHint = (): number => lamportsToSol(SOL_RESERVE_LAMPORTS);

export const toBaseUnitsForToken = (amount: number, token: TokenInfo): bigint =>
  toBaseUnits(amount, token.decimals);
