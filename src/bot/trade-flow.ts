import * as trading from '../services/trading';
import * as safety from '../services/safety';
import { UserFacingError } from '../lib/errors';
import * as keyboards from './keyboards';
import * as views from './views';
import * as intents from './intents';
import * as screens from './screens';
import type { BotContext } from './context';

const replyHtml = (ctx: BotContext, text: string, extra: object = {}) =>
  ctx.reply(text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

/**
 * With confirmation on, the user sees a priced preview and taps once more.
 * With it off the swap goes straight out - which is the whole point of a
 * bot like this, so the setting defaults to on and is easy to flip.
 */
/**
 * A critical report means the token cannot be sold, or the deployer can freeze
 * the account holding it. Buying is refused outright rather than warned about:
 * a warning above a Confirm button is a warning people tap through.
 *
 * The gate never blocks a sell - getting out of something dangerous is
 * exactly what a user in trouble needs to do.
 */
const assertTradable = async (mint: string): Promise<void> => {
  const report = await safety.analyze(mint).catch(() => undefined);
  if (!report || !safety.isBlocking(report)) return;

  const reason = report.flags.find((flag) => flag.severity === 'critical');
  throw new UserFacingError(
    `${report.symbol} failed the safety check: ${reason?.label ?? 'unsellable'}.`,
    reason?.detail ?? 'A sell could not be priced for this token.',
  );
};

export const startBuy = async (ctx: BotContext, mint: string, amountSol: number): Promise<void> => {
  await assertTradable(mint);

  if (!ctx.settings.confirm_before_trade) {
    await executeBuy(ctx, mint, amountSol);
    return;
  }

  const preview = await trading.previewBuy({
    userId: ctx.user.id,
    wallet: ctx.wallet,
    mint,
    amountSol,
    slippageBps: ctx.settings.slippage_bps,
    priorityFeeLamports: ctx.settings.priority_fee_lamports,
  });

  const id = intents.remember({ userId: ctx.user.id, side: 'buy', mint, amountSol });
  await replyHtml(ctx, views.previewScreen(preview, 'buy'), keyboards.confirmTrade(id));
};

export const startSell = async (ctx: BotContext, mint: string, percent: number): Promise<void> => {
  if (!ctx.settings.confirm_before_trade) {
    await executeSell(ctx, mint, percent);
    return;
  }

  const preview = await trading.previewSell({
    userId: ctx.user.id,
    wallet: ctx.wallet,
    mint,
    percent,
    slippageBps: ctx.settings.slippage_bps,
    priorityFeeLamports: ctx.settings.priority_fee_lamports,
  });

  const id = intents.remember({ userId: ctx.user.id, side: 'sell', mint, percent });
  await replyHtml(ctx, views.previewScreen(preview, 'sell'), keyboards.confirmTrade(id));
};

export const executeBuy = async (
  ctx: BotContext,
  mint: string,
  amountSol: number,
): Promise<void> => {
  await assertTradable(mint);
  const notice = await ctx.reply('⏳ Routing your buy…');

  try {
    const result = await trading.buy({
      userId: ctx.user.id,
      wallet: ctx.wallet,
      mint,
      amountSol,
      slippageBps: ctx.settings.slippage_bps,
      priorityFeeLamports: ctx.settings.priority_fee_lamports,
      mevProtection: Boolean(ctx.settings.mev_protection),
    });

    await ctx.telegram.editMessageText(
      notice.chat.id,
      notice.message_id,
      undefined,
      views.fillScreen(result, 'buy'),
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    );
    await screens.showPosition(ctx, mint);
  } catch (error) {
    await ctx.telegram
      .deleteMessage(notice.chat.id, notice.message_id)
      .catch(() => undefined);
    throw error;
  }
};

export const executeSell = async (
  ctx: BotContext,
  mint: string,
  percent: number,
): Promise<void> => {
  const notice = await ctx.reply('⏳ Routing your sell…');

  try {
    const result = await trading.sell({
      userId: ctx.user.id,
      wallet: ctx.wallet,
      mint,
      percent,
      slippageBps: ctx.settings.slippage_bps,
      priorityFeeLamports: ctx.settings.priority_fee_lamports,
      mevProtection: Boolean(ctx.settings.mev_protection),
    });

    await ctx.telegram.editMessageText(
      notice.chat.id,
      notice.message_id,
      undefined,
      views.fillScreen(result, 'sell'),
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    );
    await screens.showPositions(ctx);
  } catch (error) {
    await ctx.telegram
      .deleteMessage(notice.chat.id, notice.message_id)
      .catch(() => undefined);
    throw error;
  }
};

export const confirmIntent = async (ctx: BotContext, id: string): Promise<void> => {
  const intent = intents.take(id, ctx.user.id);
  if (!intent) {
    throw new UserFacingError('That confirmation expired.', 'Pull a fresh quote and try again.');
  }

  if (intent.side === 'buy') {
    await executeBuy(ctx, intent.mint, intent.amountSol ?? 0);
  } else {
    await executeSell(ctx, intent.mint, intent.percent ?? 100);
  }
};
