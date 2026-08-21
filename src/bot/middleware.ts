import type { MiddlewareFn } from 'telegraf';
import * as userRepo from '../db/repositories/users';
import * as walletService from '../services/wallets';
import { isUserFacing } from '../lib/errors';
import { child } from '../lib/logger';
import { getPending, setPending, type BotContext } from './context';

const log = child('bot');

/** Loads (or creates) the user, their settings and their active wallet. */
export const withSession: MiddlewareFn<BotContext> = async (ctx, next) => {
  const from = ctx.from;
  if (!from || from.is_bot) return;

  const startPayload =
    'startPayload' in ctx && typeof ctx.startPayload === 'string' ? ctx.startPayload : undefined;

  ctx.user = userRepo.upsert({
    telegramId: from.id,
    username: from.username,
    firstName: from.first_name,
    referralCode: startPayload,
  });
  ctx.settings = userRepo.getSettings(ctx.user.id);
  ctx.wallet = walletService.getOrCreateActiveWallet(ctx.user.id);
  ctx.pending = getPending(from.id);
  ctx.setPending = (prompt) => setPending(from.id, prompt);

  await next();
};

/**
 * Anything that reaches here has already failed. Users get the message only
 * when it was written for them; everything else becomes a generic line so a
 * stack trace never ends up in a chat.
 */
export const withErrorBoundary: MiddlewareFn<BotContext> = async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    if (isUserFacing(error)) {
      const hint = error.hint ? `\n\n<i>${error.hint}</i>` : '';
      await ctx.reply(`⚠️ ${error.message}${hint}`, { parse_mode: 'HTML' }).catch(() => undefined);
      return;
    }

    log.error({ err: error, from: ctx.from?.id }, 'unhandled bot error');
    await ctx
      .reply('Something broke on our side. Try again in a moment.')
      .catch(() => undefined);
  }
};

/** Rate limit: one action per user per 700ms, enough to stop double taps. */
const lastSeen = new Map<number, number>();

export const withThrottle: MiddlewareFn<BotContext> = async (ctx, next) => {
  const id = ctx.from?.id;
  if (!id) return next();

  const now = Date.now();
  const previous = lastSeen.get(id) ?? 0;
  if (now - previous < 700) {
    if ('callbackQuery' in ctx.update) await ctx.answerCbQuery().catch(() => undefined);
    return;
  }

  lastSeen.set(id, now);
  return next();
};

export const withTiming: MiddlewareFn<BotContext> = async (ctx, next) => {
  const started = Date.now();
  await next();
  log.debug({ ms: Date.now() - started, from: ctx.from?.id }, 'update handled');
};
