import * as orderService from '../services/orders';
import * as copyService from '../services/copytrade';
import * as positionService from '../services/positions';
import * as walletService from '../services/wallets';
import * as tradeRepo from '../db/repositories/trades';
import * as userRepo from '../db/repositories/users';
import * as notificationRepo from '../db/repositories/notifications';
import { getSolBalance } from '../services/solana';
import { getPriceInSol, getSolUsdPrice } from '../services/prices';
import { getTokenInfo } from '../services/tokens';
import * as safety from '../services/safety';
import * as keyboards from './keyboards';
import * as views from './views';
import type { BotContext } from './context';

const parseJsonArray = (raw: string, fallback: number[]): number[] => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.every((n) => typeof n === 'number') ? parsed : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Editing in place keeps the chat from turning into a wall of duplicated
 * menus. When the update came from a message (not a button) there is nothing
 * to edit, so it falls back to a fresh reply.
 */
const render = async (
  ctx: BotContext,
  text: string,
  keyboard: ReturnType<typeof keyboards.home>,
): Promise<void> => {
  const options = {
    parse_mode: 'HTML' as const,
    link_preview_options: { is_disabled: true },
    ...keyboard,
  };

  if (ctx.callbackQuery && 'message' in ctx.callbackQuery && ctx.callbackQuery.message) {
    try {
      await ctx.editMessageText(text, options);
      return;
    } catch {
      // "message is not modified" and expired messages both land here.
    }
  }

  await ctx.reply(text, options);
};

export const showHome = async (ctx: BotContext): Promise<void> => {
  const [solBalance, solUsd, summary] = await Promise.all([
    getSolBalance(ctx.wallet.public_key).catch(() => 0),
    getSolUsdPrice().catch(() => 0),
    positionService.summarize(ctx.user.id),
  ]);

  await render(
    ctx,
    views.homeScreen({
      firstName: ctx.user.first_name ?? 'trader',
      wallet: ctx.wallet,
      solBalance,
      solUsd,
      summary,
    }),
    keyboards.home(),
  );
};

export const showToken = async (ctx: BotContext, mint: string): Promise<void> => {
  const [token, priceSol, solUsd, solBalance, position, report] = await Promise.all([
    getTokenInfo(mint),
    getPriceInSol(mint).catch(() => 0),
    getSolUsdPrice().catch(() => 0),
    getSolBalance(ctx.wallet.public_key).catch(() => 0),
    positionService.findView(ctx.wallet.id, mint),
    safety.analyze(mint).catch(() => undefined),
  ]);

  const presets = parseJsonArray(ctx.settings.buy_presets_sol, [0.1, 0.25, 0.5, 1]);

  await render(
    ctx,
    views.tokenScreen({
      token,
      priceSol: priceSol ?? 0,
      priceUsd: (priceSol ?? 0) * solUsd,
      solBalance,
      position,
      safety: report,
    }),
    keyboards.buyAmounts(mint, presets),
  );
};

export const showPositions = async (ctx: BotContext): Promise<void> => {
  const summary = await positionService.summarize(ctx.user.id);
  await render(
    ctx,
    views.positionsScreen(summary),
    keyboards.positionList(
      summary.positions.map((view) => ({
        mint: view.position.mint,
        symbol: view.position.symbol,
      })),
    ),
  );
};

export const showPosition = async (ctx: BotContext, mint: string): Promise<void> => {
  const view = await positionService.findView(ctx.wallet.id, mint);
  if (!view || view.position.token_amount <= 0) {
    await showToken(ctx, mint);
    return;
  }

  const [token, solUsd, solBalance] = await Promise.all([
    getTokenInfo(mint),
    getSolUsdPrice().catch(() => 0),
    getSolBalance(ctx.wallet.public_key).catch(() => 0),
  ]);

  const presets = parseJsonArray(ctx.settings.sell_presets_pct, [25, 50, 75, 100]);

  await render(
    ctx,
    views.tokenScreen({
      token,
      priceSol: view.priceSol,
      priceUsd: view.priceSol * solUsd,
      solBalance,
      position: view,
    }),
    keyboards.positionActions(mint, presets),
  );
};

export const showWallets = async (ctx: BotContext): Promise<void> => {
  const [entries, solUsd] = await Promise.all([
    walletService.overview(ctx.user.id),
    getSolUsdPrice().catch(() => 0),
  ]);

  await render(
    ctx,
    views.walletScreen(entries, solUsd),
    keyboards.walletMenu(entries.map((entry) => entry.wallet)),
  );
};

export const showOrders = async (ctx: BotContext): Promise<void> => {
  const orders = orderService.listOpen(ctx.user.id);
  await render(ctx, views.ordersScreen(orders), keyboards.orderList(orders));
};

export const showSettings = async (ctx: BotContext): Promise<void> => {
  const settings = userRepo.getSettings(ctx.user.id);
  ctx.settings = settings;
  await render(ctx, views.settingsScreen(settings), keyboards.settingsMenu(settings));
};

export const showHistory = async (ctx: BotContext): Promise<void> => {
  const trades = tradeRepo.listByUser(ctx.user.id, 15);
  await render(ctx, views.historyScreen(trades), keyboards.backHome());
};

export const showCopy = async (ctx: BotContext): Promise<void> => {
  const targets = copyService.list(ctx.user.id);
  await render(ctx, views.copyScreen(targets), keyboards.copyList(targets));
};

export const showReferral = async (ctx: BotContext): Promise<void> => {
  const me = await ctx.telegram.getMe();
  await render(
    ctx,
    views.referralScreen({
      code: ctx.user.referral_code,
      botUsername: me.username ?? 'bonkbot',
      invited: userRepo.countReferrals(ctx.user.id),
      earnedSol: notificationRepo.referralEarnings(ctx.user.id),
    }),
    keyboards.backHome(),
  );
};
