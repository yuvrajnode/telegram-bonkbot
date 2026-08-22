import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { env } from '../config/env';
import { child } from '../lib/logger';
import { UserFacingError } from '../lib/errors';
import * as orderService from '../services/orders';
import * as walletService from '../services/wallets';
import * as transfers from '../services/transfers';
import * as copyService from '../services/copytrade';
import * as copyRepo from '../db/repositories/copy';
import * as intents from './intents';
import * as views from './views';
import * as userRepo from '../db/repositories/users';
import { isValidMint } from '../services/solana';
import * as keyboards from './keyboards';
import * as screens from './screens';
import * as tradeFlow from './trade-flow';
import * as prompts from './text-prompts';
import { withErrorBoundary, withSession, withThrottle, withTiming } from './middleware';
import type { BotContext } from './context';

const log = child('bot');

const HELP = [
  '<b>How this works</b>',
  '━━━━━━━━━━━━━━━━━━━━',
  'Paste any Solana mint address and the trade panel opens on that token.',
  '',
  '<b>Commands</b>',
  '/start — main menu',
  '/buy — buy by mint address',
  '/positions — open positions and PnL',
  '/orders — resting limit orders',
  '/wallet — wallets, deposits, export',
  '/withdraw — send SOL or tokens out',
  '/history — recent fills',
  '/copy — mirror another wallet\'s trades',
  '/settings — slippage, priority fee, confirmations',
  '/invite — your referral link',
  '',
  '<b>Good to know</b>',
  '• Your keys are encrypted at rest and only decrypted to sign a swap.',
  '• Roughly 0.007 SOL is left untouched so the wallet can always pay fees.',
  '• Every quote is refreshed the moment you confirm, never reused.',
].join('\n');

export const createBot = (): Telegraf<BotContext> => {
  const bot = new Telegraf<BotContext>(env.telegram.token);

  bot.use(withTiming);
  bot.use(withThrottle);
  bot.use(withSession);
  bot.use(withErrorBoundary);

  bot.start(async (ctx) => {
    ctx.setPending(undefined);
    await screens.showHome(ctx);
  });

  bot.help(async (ctx) => {
    await ctx.reply(HELP, { parse_mode: 'HTML', ...keyboards.backHome() });
  });

  bot.command('buy', async (ctx) => {
    const [, mint] = ctx.message.text.split(/\s+/);
    if (mint && isValidMint(mint)) {
      await screens.showToken(ctx, mint);
      return;
    }
    ctx.setPending({ kind: 'buy_mint' });
    await ctx.reply('Send me the mint address you want to buy.');
  });

  bot.command('withdraw', async (ctx) => {
    const [, maybeMint] = ctx.message.text.split(/\s+/);
    ctx.setPending({
      kind: 'withdraw_destination',
      ...(maybeMint && isValidMint(maybeMint) ? { mint: maybeMint } : {}),
    });
    await ctx.reply(
      [
        'Send the destination address.',
        '',
        'Double check it. A Solana transfer is final — there is nobody to call if it goes to the wrong place.',
      ].join('\n'),
    );
  });

  bot.command('copy', async (ctx) => {
    const [, address, size] = ctx.message.text.split(/\s+/);

    if (!address) {
      await screens.showCopy(ctx);
      return;
    }

    const target = await copyService.follow({
      userId: ctx.user.id,
      walletId: ctx.wallet.id,
      address,
      sizeSol: Number(size ?? 0.1),
    });

    await ctx.reply(
      [
        `Now copying <code>${target.target_address}</code>.`,
        '',
        `Each buy they make is mirrored at <b>${target.size_sol} SOL</b>, and their sells are mirrored in the same proportion they exit.`,
        '',
        '<i>Only trades from here on. Their existing bags are not bought into.</i>',
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
    await screens.showCopy(ctx);
  });

  bot.command('positions', screens.showPositions);
  bot.command('orders', screens.showOrders);
  bot.command('wallet', screens.showWallets);
  bot.command('history', screens.showHistory);
  bot.command('settings', screens.showSettings);
  bot.command('invite', screens.showReferral);
  bot.command('menu', screens.showHome);

  bot.command('cancel', async (ctx) => {
    ctx.setPending(undefined);
    await ctx.reply('Cancelled. Back to the menu.', keyboards.backHome());
  });

  bot.command('stats', async (ctx) => {
    if (!env.telegram.adminIds.includes(ctx.from.id)) return;
    const users = userRepo.listAll();
    await ctx.reply(
      [
        `Users: ${users.length}`,
        `Open orders: ${orderService.listOpen(ctx.user.id).length} (yours)`,
        `Uptime: ${Math.round(process.uptime() / 60)} min`,
      ].join('\n'),
    );
  });

  registerActions(bot);

  bot.on(message('text'), async (ctx) => {
    const text = ctx.message.text.trim();

    if (ctx.pending) {
      await prompts.handlePending(ctx, ctx.pending, text);
      return;
    }

    if (isValidMint(text)) {
      await screens.showToken(ctx, text);
      return;
    }

    await ctx.reply(
      'Send a mint address to trade it, or use /start for the menu.',
      keyboards.backHome(),
    );
  });

  bot.catch((error, ctx) => {
    log.error({ err: error, update: ctx.updateType }, 'telegraf error escaped');
  });

  return bot;
};

const registerActions = (bot: Telegraf<BotContext>): void => {
  const ack = async (ctx: BotContext, text?: string): Promise<void> => {
    await ctx.answerCbQuery(text).catch(() => undefined);
  };

  bot.action('nav:home', async (ctx) => {
    await ack(ctx);
    await screens.showHome(ctx);
  });
  bot.action('nav:positions', async (ctx) => {
    await ack(ctx);
    await screens.showPositions(ctx);
  });
  bot.action('nav:orders', async (ctx) => {
    await ack(ctx);
    await screens.showOrders(ctx);
  });
  bot.action('nav:wallet', async (ctx) => {
    await ack(ctx);
    await screens.showWallets(ctx);
  });
  bot.action('nav:settings', async (ctx) => {
    await ack(ctx);
    await screens.showSettings(ctx);
  });
  bot.action('nav:copy', async (ctx) => {
    await ack(ctx);
    await screens.showCopy(ctx);
  });

  bot.action(/^copy_stop:(\d+)$/, async (ctx) => {
    copyService.unfollow(ctx.user.id, Number(ctx.match[1]));
    await ack(ctx, 'Stopped following');
    await screens.showCopy(ctx);
  });

  bot.action(/^copy_pause:(\d+)$/, async (ctx) => {
    const target = copyRepo.findById(Number(ctx.match[1]));
    if (!target || target.user_id !== ctx.user.id) {
      await ack(ctx);
      throw new UserFacingError('That follow is not yours.');
    }

    const next = target.status === 'active' ? 'paused' : 'active';
    copyRepo.setStatus(target.id, next);
    await ack(ctx, next === 'paused' ? 'Paused' : 'Resumed');
    await screens.showCopy(ctx);
  });

  bot.action('nav:referral', async (ctx) => {
    await ack(ctx);
    await screens.showReferral(ctx);
  });

  bot.action('nav:buy', async (ctx) => {
    await ack(ctx);
    ctx.setPending({ kind: 'buy_mint' });
    await ctx.reply('Send me the mint address you want to buy.');
  });

  bot.action(/^token:(.+)$/, async (ctx) => {
    await ack(ctx);
    await screens.showToken(ctx, ctx.match[1]!);
  });

  bot.action(/^position:(.+)$/, async (ctx) => {
    await ack(ctx);
    await screens.showPosition(ctx, ctx.match[1]!);
  });

  bot.action(/^chart:(.+)$/, async (ctx) => {
    await ack(ctx);
    const mint = ctx.match[1]!;
    await ctx.reply(`Charts for <code>${mint}</code>`, {
      parse_mode: 'HTML',
      ...keyboards.linkRow(mint),
    });
  });

  bot.action(/^buy:(.+):([\d.]+)$/, async (ctx) => {
    await ack(ctx, 'Pricing…');
    await tradeFlow.startBuy(ctx, ctx.match[1]!, Number(ctx.match[2]));
  });

  bot.action(/^buy_custom:(.+)$/, async (ctx) => {
    await ack(ctx);
    ctx.setPending({ kind: 'buy_amount', mint: ctx.match[1]! });
    await ctx.reply('How much SOL do you want to spend?');
  });

  bot.action(/^sell:(.+):([\d.]+)$/, async (ctx) => {
    await ack(ctx, 'Pricing…');
    await tradeFlow.startSell(ctx, ctx.match[1]!, Number(ctx.match[2]));
  });

  bot.action(/^confirm:(.+)$/, async (ctx) => {
    await ack(ctx, 'Sending…');
    await tradeFlow.confirmIntent(ctx, ctx.match[1]!);
  });

  bot.action(/^limit:(limit_buy|limit_sell):(.+)$/, async (ctx) => {
    await ack(ctx);
    await prompts.promptLimitOrder(
      ctx,
      ctx.match[2]!,
      ctx.match[1] as 'limit_buy' | 'limit_sell',
    );
  });

  bot.action(/^order_cancel:(\d+)$/, async (ctx) => {
    orderService.cancel(ctx.user.id, Number(ctx.match[1]));
    await ack(ctx, 'Order cancelled');
    await screens.showOrders(ctx);
  });

  bot.action('wallet_new', async (ctx) => {
    const wallet = walletService.createWallet(ctx.user.id);
    await ack(ctx, `${wallet.label} created`);
    await screens.showWallets(ctx);
  });

  bot.action('wallet_import', async (ctx) => {
    await ack(ctx);
    ctx.setPending({ kind: 'import_wallet' });
    await ctx.reply(
      [
        'Send the private key — base58, or the JSON array from solana-keygen.',
        '',
        'I delete your message straight after reading it. Never paste a key you also use elsewhere.',
      ].join('\n'),
    );
  });

  bot.action(/^wallet_use:(\d+)$/, async (ctx) => {
    const wallet = walletService.switchWallet(ctx.user.id, Number(ctx.match[1]));
    ctx.wallet = wallet;
    await ack(ctx, `Now trading from ${wallet.label}`);
    await screens.showWallets(ctx);
  });

  bot.action('wallet_withdraw', async (ctx) => {
    await ack(ctx);
    ctx.setPending({ kind: 'withdraw_destination' });
    await ctx.reply(
      [
        'Send the destination address.',
        '',
        'Double check it. A Solana transfer is final — there is nobody to call if it goes to the wrong place.',
      ].join('\n'),
    );
  });

  bot.action(/^withdraw_go:(.+)$/, async (ctx) => {
    const intent = intents.takeWithdrawal(ctx.match[1]!, ctx.user.id);
    if (!intent) {
      await ack(ctx);
      throw new UserFacingError('That withdrawal expired.', 'Start it again from /wallet.');
    }

    await ack(ctx, 'Sending…');

    const result = intent.mint
      ? await transfers.withdrawToken({
          wallet: ctx.wallet,
          destination: intent.destination,
          mint: intent.mint,
          percent: intent.percent ?? 100,
          priorityFeeLamports: ctx.settings.priority_fee_lamports,
        })
      : await transfers.withdrawSol({
          wallet: ctx.wallet,
          destination: intent.destination,
          amountSol: intent.amount,
          priorityFeeLamports: ctx.settings.priority_fee_lamports,
        });

    await ctx.reply(views.withdrawDone(result), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
    await screens.showWallets(ctx);
  });

  bot.action('wallet_export', async (ctx) => {
    await ack(ctx);
    const key = walletService.revealPrivateKey(ctx.user.id, ctx.wallet.id);
    const sent = await ctx.reply(
      [
        `<b>${ctx.wallet.label}</b> private key:`,
        '',
        `<code>${key}</code>`,
        '',
        '<i>This message self-destructs in 60 seconds. Anyone holding this string owns the wallet.</i>',
      ].join('\n'),
      { parse_mode: 'HTML' },
    );

    setTimeout(() => {
      void ctx.telegram.deleteMessage(sent.chat.id, sent.message_id).catch(() => undefined);
    }, 60_000);
  });

  bot.action('set:slippage', async (ctx) => {
    await ack(ctx);
    ctx.setPending({ kind: 'set_slippage' });
    await ctx.reply('Send the slippage tolerance as a percentage, e.g. 1.5');
  });

  bot.action('set:priority', async (ctx) => {
    await ack(ctx);
    ctx.setPending({ kind: 'set_priority_fee' });
    await ctx.reply('Send the priority fee in lamports, e.g. 200000');
  });

  bot.action('toggle:confirm', async (ctx) => {
    ctx.settings = userRepo.updateSettings(ctx.user.id, {
      confirm_before_trade: ctx.settings.confirm_before_trade ? 0 : 1,
    });
    await ack(ctx, ctx.settings.confirm_before_trade ? 'Confirmations on' : 'One-tap trading on');
    await screens.showSettings(ctx);
  });

  bot.action('toggle:mev', async (ctx) => {
    ctx.settings = userRepo.updateSettings(ctx.user.id, {
      mev_protection: ctx.settings.mev_protection ? 0 : 1,
    });
    await ack(ctx, ctx.settings.mev_protection ? 'MEV protection on' : 'MEV protection off');
    await screens.showSettings(ctx);
  });

  bot.action(/.*/, async (ctx) => {
    await ack(ctx);
    throw new UserFacingError('That button is from an older message.', 'Send /start for a fresh menu.');
  });
};
