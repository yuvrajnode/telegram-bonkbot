import * as orderRepo from '../db/repositories/orders';
import * as positionRepo from '../db/repositories/positions';
import * as notificationRepo from '../db/repositories/notifications';
import { UserFacingError } from '../lib/errors';
import { child } from '../lib/logger';
import { getPricesInSol } from './prices';
import { getTokenInfo } from './tokens';
import * as trading from './trading';
import * as walletService from './wallets';
import * as userRepo from '../db/repositories/users';
import type { Order, OrderKind, Wallet } from '../types';

const log = child('orders');

const MAX_OPEN_ORDERS = 25;

export interface PlaceOrderInput {
  userId: number;
  wallet: Wallet;
  mint: string;
  kind: OrderKind;
  triggerPriceSol: number;
  amountSol?: number;
  amountPct?: number;
  expiresInHours?: number;
}

export const place = async (input: PlaceOrderInput): Promise<Order> => {
  if (orderRepo.listOpenByUser(input.userId).length >= MAX_OPEN_ORDERS) {
    throw new UserFacingError(`You already have ${MAX_OPEN_ORDERS} open orders.`);
  }
  if (input.triggerPriceSol <= 0) {
    throw new UserFacingError('The trigger price has to be greater than zero.');
  }

  const token = await getTokenInfo(input.mint);

  if (input.kind === 'limit_buy') {
    if (!input.amountSol || input.amountSol <= 0) {
      throw new UserFacingError('A limit buy needs a SOL amount.');
    }
  } else if (!input.amountPct || input.amountPct <= 0 || input.amountPct > 100) {
    throw new UserFacingError('Sell orders take a percentage between 1 and 100.');
  }

  const expiresAt = input.expiresInHours
    ? new Date(Date.now() + input.expiresInHours * 3_600_000).toISOString().replace('T', ' ').slice(0, 19)
    : null;

  const order = orderRepo.create({
    userId: input.userId,
    walletId: input.wallet.id,
    mint: input.mint,
    symbol: token.symbol,
    kind: input.kind,
    triggerPriceSol: input.triggerPriceSol,
    amountSol: input.amountSol ?? null,
    amountPct: input.amountPct ?? null,
    expiresAt,
  });

  log.info({ orderId: order.id, kind: order.kind, mint: input.mint }, 'order placed');
  return order;
};

export const listOpen = (userId: number): Order[] => orderRepo.listOpenByUser(userId);

export const cancel = (userId: number, orderId: number): void => {
  if (!orderRepo.cancel(userId, orderId)) {
    throw new UserFacingError('That order is not open, or it is not yours.');
  }
};

/**
 * Buys fire when price drops to or below the trigger; every sell flavour
 * (limit sell, take profit) fires on the way up, except stop losses which
 * fire on the way down.
 */
export const shouldTrigger = (order: Order, priceSol: number): boolean => {
  switch (order.kind) {
    case 'limit_buy':
      return priceSol <= order.trigger_price_sol;
    case 'stop_loss':
      return priceSol <= order.trigger_price_sol;
    case 'limit_sell':
    case 'take_profit':
      return priceSol >= order.trigger_price_sol;
    default:
      return false;
  }
};

const executeOrder = async (order: Order, priceSol: number): Promise<void> => {
  const wallet = walletService.listWallets(order.user_id).find((w) => w.id === order.wallet_id);
  if (!wallet) {
    orderRepo.setStatus(order.id, 'failed');
    return;
  }

  const settings = userRepo.getSettings(order.user_id);
  const source = order.kind === 'limit_buy' ? 'limit_order' : order.kind === 'stop_loss' ? 'stop_loss' : 'take_profit';

  try {
    const result =
      order.kind === 'limit_buy'
        ? await trading.buy({
            userId: order.user_id,
            wallet,
            mint: order.mint,
            amountSol: order.amount_sol ?? 0,
            slippageBps: settings.slippage_bps,
            priorityFeeLamports: settings.priority_fee_lamports,
            mevProtection: Boolean(settings.mev_protection),
            source: 'limit_order',
          })
        : await trading.sell({
            userId: order.user_id,
            wallet,
            mint: order.mint,
            percent: order.amount_pct ?? 100,
            slippageBps: settings.slippage_bps,
            priorityFeeLamports: settings.priority_fee_lamports,
            mevProtection: Boolean(settings.mev_protection),
            source,
          });

    orderRepo.setStatus(order.id, 'filled', result.trade.id);
    notificationRepo.enqueue(order.user_id, 'order_filled', {
      orderId: order.id,
      kind: order.kind,
      symbol: result.token.symbol,
      mint: order.mint,
      priceSol,
      signature: result.signature,
      solAmount: result.solAmount,
      tokenAmount: result.tokenAmount,
    });

    log.info({ orderId: order.id, signature: result.signature }, 'order filled');
  } catch (error) {
    orderRepo.setStatus(order.id, 'failed');
    notificationRepo.enqueue(order.user_id, 'order_failed', {
      orderId: order.id,
      symbol: order.symbol,
      reason: error instanceof Error ? error.message : String(error),
    });
    log.warn({ err: error, orderId: order.id }, 'order execution failed');
  }
};

export interface SweepResult {
  checked: number;
  triggered: number;
  expired: number;
}

/**
 * One pass over every open order. Orders are executed sequentially on
 * purpose: firing ten swaps at once from the same wallet just means nine of
 * them race on the same blockhash and lose.
 */
export const sweep = async (): Promise<SweepResult> => {
  const expired = orderRepo.expireStale();
  const open = orderRepo.listOpen();
  if (open.length === 0) return { checked: 0, triggered: 0, expired };

  const prices = await getPricesInSol([...new Set(open.map((order) => order.mint))]);
  let triggered = 0;

  for (const order of open) {
    const price = prices.get(order.mint);
    if (!price || !shouldTrigger(order, price)) continue;

    // Re-read: a previous iteration may have consumed the same holding.
    const current = orderRepo.findById(order.id);
    if (current?.status !== 'open') continue;

    if (order.kind !== 'limit_buy') {
      const held = positionRepo.find(order.wallet_id, order.mint);
      if (!held || held.token_amount <= 0) {
        orderRepo.setStatus(order.id, 'cancelled');
        continue;
      }
    }

    triggered += 1;
    await executeOrder(order, price);
  }

  return { checked: open.length, triggered, expired };
};
