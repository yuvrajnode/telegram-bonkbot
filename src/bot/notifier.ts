import type { Telegraf } from 'telegraf';
import * as notificationRepo from '../db/repositories/notifications';
import * as userRepo from '../db/repositories/users';
import { formatAmount, formatPrice } from '../lib/format';
import { child } from '../lib/logger';
import { explorerTx } from '../services/solana';
import type { BotContext } from './context';

const log = child('notifier');

interface OrderFilledPayload {
  orderId: number;
  kind: string;
  symbol: string;
  priceSol: number;
  signature: string;
  solAmount: number;
  tokenAmount: number;
}

interface OrderFailedPayload {
  orderId: number;
  symbol: string;
  reason: string;
}

const renderers: Record<string, (payload: never) => string> = {
  order_filled: (payload: OrderFilledPayload) =>
    [
      `🎯 <b>Order #${payload.orderId} filled</b>`,
      '',
      payload.kind === 'limit_buy'
        ? `Bought ${formatAmount(payload.tokenAmount)} ${payload.symbol} for ${payload.solAmount.toFixed(4)} SOL`
        : `Sold ${formatAmount(payload.tokenAmount)} ${payload.symbol} for ${payload.solAmount.toFixed(4)} SOL`,
      `Trigger was ${formatPrice(payload.priceSol)} SOL`,
      '',
      `<a href="${explorerTx(payload.signature)}">View transaction</a>`,
    ].join('\n'),

  order_failed: (payload: OrderFailedPayload) =>
    [
      `⚠️ <b>Order #${payload.orderId} could not fill</b>`,
      '',
      `${payload.symbol}: ${payload.reason.slice(0, 200)}`,
      '',
      '<i>The order was closed. Place a new one if you still want the fill.</i>',
    ].join('\n'),
} as Record<string, (payload: never) => string>;

/**
 * The watcher runs outside any Telegram context, so it writes notifications
 * to a table and this drains them. A failed send is left undelivered and
 * retried on the next pass rather than dropped.
 */
export class Notifier {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly bot: Telegraf<BotContext>,
    private readonly intervalMs = 3_000,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.drain(), this.intervalMs);
    this.timer.unref?.();
    log.info('notifier started');
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async drain(): Promise<void> {
    const pending = notificationRepo.takePending();

    for (const notification of pending) {
      const user = userRepo.findById(notification.user_id);
      const render = renderers[notification.kind];
      if (!user || !render) {
        notificationRepo.markDelivered(notification.id);
        continue;
      }

      try {
        const payload = JSON.parse(notification.payload) as never;
        await this.bot.telegram.sendMessage(user.telegram_id, render(payload), {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
        notificationRepo.markDelivered(notification.id);
      } catch (error) {
        // A user who blocked the bot would otherwise jam the queue forever.
        const blocked = String(error).includes('bot was blocked');
        if (blocked) notificationRepo.markDelivered(notification.id);
        else log.warn({ err: error, id: notification.id }, 'delivery failed, will retry');
      }
    }
  }
}
