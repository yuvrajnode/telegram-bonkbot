import * as positionRepo from '../db/repositories/positions';
import * as tradeRepo from '../db/repositories/trades';
import { getPricesInSol, getSolUsdPrice } from './prices';
import type { Position, TokenInfo } from '../types';

/**
 * Cost basis is tracked as a weighted average, not FIFO. For a bot where a
 * position is usually a handful of buys followed by partial exits, the two
 * agree on the final number and the average is far cheaper to keep correct
 * under concurrent fills.
 */
export const applyBuy = (input: {
  userId: number;
  walletId: number;
  token: TokenInfo;
  tokenAmount: number;
  solSpent: number;
}): Position => {
  const existing = positionRepo.find(input.walletId, input.token.mint);

  return positionRepo.upsert({
    userId: input.userId,
    walletId: input.walletId,
    mint: input.token.mint,
    symbol: input.token.symbol,
    decimals: input.token.decimals,
    tokenAmount: (existing?.token_amount ?? 0) + input.tokenAmount,
    costBasisSol: (existing?.cost_basis_sol ?? 0) + input.solSpent,
    realizedPnlSol: existing?.realized_pnl_sol ?? 0,
  });
};

export interface SellResult {
  position: Position;
  realizedPnlSol: number;
}

export const applySell = (input: {
  userId: number;
  walletId: number;
  token: TokenInfo;
  tokenAmount: number;
  solReceived: number;
}): SellResult => {
  const existing = positionRepo.find(input.walletId, input.token.mint);

  // Selling something the bot never booked (an airdrop, a manual transfer in)
  // is all profit as far as this ledger is concerned.
  const heldBefore = existing?.token_amount ?? 0;
  const basisBefore = existing?.cost_basis_sol ?? 0;

  const soldFraction = heldBefore > 0 ? Math.min(input.tokenAmount / heldBefore, 1) : 0;
  const basisConsumed = basisBefore * soldFraction;
  const realized = input.solReceived - basisConsumed;

  const position = positionRepo.upsert({
    userId: input.userId,
    walletId: input.walletId,
    mint: input.token.mint,
    symbol: input.token.symbol,
    decimals: input.token.decimals,
    tokenAmount: Math.max(heldBefore - input.tokenAmount, 0),
    costBasisSol: Math.max(basisBefore - basisConsumed, 0),
    realizedPnlSol: (existing?.realized_pnl_sol ?? 0) + realized,
  });

  return { position, realizedPnlSol: realized };
};

export interface PositionView {
  position: Position;
  priceSol: number;
  entryPriceSol: number;
  valueSol: number;
  valueUsd: number;
  unrealizedPnlSol: number;
  unrealizedPnlPct: number;
  totalPnlSol: number;
}

const toView = (position: Position, priceSol: number, solUsd: number): PositionView => {
  const valueSol = position.token_amount * priceSol;
  const unrealized = valueSol - position.cost_basis_sol;
  const entryPrice = position.token_amount > 0 ? position.cost_basis_sol / position.token_amount : 0;

  return {
    position,
    priceSol,
    entryPriceSol: entryPrice,
    valueSol,
    valueUsd: valueSol * solUsd,
    unrealizedPnlSol: unrealized,
    unrealizedPnlPct:
      position.cost_basis_sol > 0 ? (unrealized / position.cost_basis_sol) * 100 : 0,
    totalPnlSol: unrealized + position.realized_pnl_sol,
  };
};

export const listOpen = async (userId: number): Promise<PositionView[]> => {
  const positions = positionRepo.listByUser(userId);
  if (positions.length === 0) return [];

  const [prices, solUsd] = await Promise.all([
    getPricesInSol(positions.map((position) => position.mint)),
    getSolUsdPrice(),
  ]);

  return positions
    .map((position) => toView(position, prices.get(position.mint) ?? 0, solUsd))
    .sort((a, b) => b.valueSol - a.valueSol);
};

export const findView = async (
  walletId: number,
  mint: string,
): Promise<PositionView | undefined> => {
  const position = positionRepo.find(walletId, mint);
  if (!position) return undefined;
  const [prices, solUsd] = await Promise.all([getPricesInSol([mint]), getSolUsdPrice()]);
  return toView(position, prices.get(mint) ?? 0, solUsd);
};

export interface PortfolioSummary {
  positions: PositionView[];
  valueSol: number;
  valueUsd: number;
  unrealizedPnlSol: number;
  realizedPnlSol: number;
  totalTrades: number;
  winRate: number;
}

export const summarize = async (userId: number): Promise<PortfolioSummary> => {
  const positions = await listOpen(userId);
  const stats = tradeRepo.statsForUser(userId);

  const valueSol = positions.reduce((sum, view) => sum + view.valueSol, 0);
  const valueUsd = positions.reduce((sum, view) => sum + view.valueUsd, 0);
  const unrealized = positions.reduce((sum, view) => sum + view.unrealizedPnlSol, 0);
  const decided = stats.wins + stats.losses;

  return {
    positions,
    valueSol,
    valueUsd,
    unrealizedPnlSol: unrealized,
    realizedPnlSol: stats.realizedPnlSol,
    totalTrades: stats.total,
    winRate: decided > 0 ? (stats.wins / decided) * 100 : 0,
  };
};
