import { VersionedTransaction } from '@solana/web3.js';
import { env } from '../config/env';
import { child } from '../lib/logger';
import { RouteNotFoundError } from '../lib/errors';
import { fetchJson } from './http';

const log = child('jupiter');

export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: { label?: string; ammKey: string; inAmount: string; outAmount: string };
    percent: number;
  }>;
  contextSlot?: number;
}

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  /** Base units of the input mint. */
  amount: bigint;
  slippageBps: number;
  /** Direct routes only are faster to land but usually price worse. */
  onlyDirectRoutes?: boolean;
}

export const getQuote = async (params: QuoteParams): Promise<QuoteResponse> => {
  const query = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount.toString(),
    slippageBps: String(params.slippageBps),
    onlyDirectRoutes: String(params.onlyDirectRoutes ?? false),
  });

  if (env.trading.platformFeeBps > 0) {
    query.set('platformFeeBps', String(env.trading.platformFeeBps));
  }

  const url = `${env.solana.jupiterApiUrl}/quote?${query.toString()}`;

  try {
    const quote = await fetchJson<QuoteResponse>(url, { timeoutMs: 8_000 });
    if (!quote?.outAmount || quote.outAmount === '0') {
      throw new RouteNotFoundError(params.outputMint);
    }
    return quote;
  } catch (error) {
    if (error instanceof RouteNotFoundError) throw error;
    log.warn({ err: error, mint: params.outputMint }, 'quote failed');
    throw new RouteNotFoundError(params.outputMint);
  }
};

interface SwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

export interface BuildSwapParams {
  quote: QuoteResponse;
  userPublicKey: string;
  priorityFeeLamports: number;
  /** Wrap/unwrap SOL automatically so users never see a wSOL account. */
  wrapAndUnwrapSol?: boolean;
  /**
   * When set, the transaction carries a Jito tip instead of a priority fee and
   * is meant to be submitted as a bundle rather than to a public RPC.
   */
  jitoTipLamports?: number;
}

export const buildSwapTransaction = async (
  params: BuildSwapParams,
): Promise<VersionedTransaction> => {
  const body: Record<string, unknown> = {
    quoteResponse: params.quote,
    userPublicKey: params.userPublicKey,
    wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
    dynamicComputeUnitLimit: true,
    // A tip and a priority fee are alternatives, not additions: the tip pays
    // the block builder directly, so paying both just burns SOL twice.
    prioritizationFeeLamports: params.jitoTipLamports
      ? { jitoTipLamports: params.jitoTipLamports }
      : params.priorityFeeLamports,
  };

  if (env.trading.platformFeeBps > 0 && env.trading.platformFeeWallet) {
    body.feeAccount = env.trading.platformFeeWallet;
  }

  const response = await fetchJson<SwapResponse>(`${env.solana.jupiterApiUrl}/swap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: 12_000,
    retries: 1,
  });

  return VersionedTransaction.deserialize(Buffer.from(response.swapTransaction, 'base64'));
};

/** Jupiter returns impact as a string fraction; surface it as a percentage. */
export const priceImpactPct = (quote: QuoteResponse): number =>
  Number(quote.priceImpactPct ?? 0) * 100;

export const routeLabels = (quote: QuoteResponse): string[] =>
  quote.routePlan.map((leg) => leg.swapInfo.label ?? 'unknown');
