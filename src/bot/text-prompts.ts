import * as orderService from '../services/orders';
import * as walletService from '../services/wallets';
import * as userRepo from '../db/repositories/users';
import { UserFacingError } from '../lib/errors';
import { getPriceInSol } from '../services/prices';
import { getTokenInfo } from '../services/tokens';
import { isValidMint } from '../services/solana';
import { formatPrice } from '../lib/format';
import * as screens from './screens';
import * as tradeFlow from './trade-flow';
import type { BotContext, PendingPrompt } from './context';

const parseNumber = (raw: string): number => {
  const value = Number(raw.replace(/[, ]/g, '').replace('%', ''));
  if (!Number.isFinite(value) || value <= 0) {
    throw new UserFacingError('That is not a number I can use.');
  }
  return value;
};

/**
 * Handles whatever the user typed while a prompt was pending. Returns false
 * when there was no prompt, so the caller can fall through to mint detection.
 */
export const handlePending = async (
  ctx: BotContext,
  prompt: PendingPrompt,
  text: string,
): Promise<void> => {
  ctx.setPending(undefined);

  switch (prompt.kind) {
    case 'buy_mint': {
      if (!isValidMint(text)) {
        throw new UserFacingError('That does not look like a mint address.');
      }
      await screens.showToken(ctx, text);
      return;
    }

    case 'buy_amount': {
      await tradeFlow.startBuy(ctx, prompt.mint, parseNumber(text));
      return;
    }

    case 'sell_percent': {
      const percent = Math.min(parseNumber(text), 100);
      await tradeFlow.startSell(ctx, prompt.mint, percent);
      return;
    }

    case 'import_wallet': {
      const wallet = walletService.importWallet(ctx.user.id, text);
      // The message contains a private key; get it out of the chat history.
      await ctx.deleteMessage().catch(() => undefined);
      await ctx.reply(
        `Imported ${wallet.label}. The message with your key was deleted from this chat.`,
      );
      await screens.showWallets(ctx);
      return;
    }

    case 'set_slippage': {
      const pct = parseNumber(text);
      if (pct > 50) {
        throw new UserFacingError('50% slippage is not a trade, it is a donation.');
      }
      ctx.settings = userRepo.updateSettings(ctx.user.id, {
        slippage_bps: Math.round(pct * 100),
      });
      await screens.showSettings(ctx);
      return;
    }

    case 'set_priority_fee': {
      const lamports = Math.round(parseNumber(text));
      ctx.settings = userRepo.updateSettings(ctx.user.id, {
        priority_fee_lamports: lamports,
      });
      await screens.showSettings(ctx);
      return;
    }

    case 'limit_order_price': {
      const price = parseNumber(text);
      ctx.setPending({
        kind: 'limit_order_amount',
        mint: prompt.mint,
        kind_of: prompt.kind_of,
        price,
      });
      await ctx.reply(
        prompt.kind_of === 'limit_buy'
          ? 'How much SOL should the order spend when it fills?'
          : 'What percentage of your holding should it sell?',
      );
      return;
    }

    case 'limit_order_amount': {
      const amount = parseNumber(text);
      const order = await orderService.place({
        userId: ctx.user.id,
        wallet: ctx.wallet,
        mint: prompt.mint,
        kind: prompt.kind_of,
        triggerPriceSol: prompt.price,
        ...(prompt.kind_of === 'limit_buy'
          ? { amountSol: amount }
          : { amountPct: Math.min(amount, 100) }),
      });

      const token = await getTokenInfo(prompt.mint);
      await ctx.reply(
        `Order #${order.id} is resting: ${prompt.kind_of === 'limit_buy' ? 'buy' : 'sell'} ${token.symbol} at ${formatPrice(prompt.price)} SOL.`,
      );
      await screens.showOrders(ctx);
      return;
    }
  }
};

export const promptLimitOrder = async (
  ctx: BotContext,
  mint: string,
  kind: 'limit_buy' | 'limit_sell',
): Promise<void> => {
  const [token, price] = await Promise.all([getTokenInfo(mint), getPriceInSol(mint)]);
  ctx.setPending({ kind: 'limit_order_price', mint, kind_of: kind });

  await ctx.reply(
    [
      `${token.symbol} trades at ${formatPrice(price ?? 0)} SOL right now.`,
      '',
      kind === 'limit_buy'
        ? 'Send the price you want to buy at (in SOL).'
        : 'Send the price you want to sell at (in SOL).',
    ].join('\n'),
  );
};
