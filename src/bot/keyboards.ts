import { Markup } from 'telegraf';
import type { InlineKeyboardMarkup } from 'telegraf/types';
import { shortenAddress } from '../lib/format';
import type { Order, Wallet } from '../types';

type Keyboard = Markup.Markup<InlineKeyboardMarkup>;

const button = Markup.button.callback;

export const home = (): Keyboard =>
  Markup.inlineKeyboard([
    [button('⚡ Buy', 'nav:buy'), button('💵 Sell', 'nav:positions')],
    [button('📊 Positions', 'nav:positions'), button('🎯 Orders', 'nav:orders')],
    [button('👛 Wallet', 'nav:wallet'), button('⚙️ Settings', 'nav:settings')],
    [button('🤝 Invite friends', 'nav:referral'), button('↻ Refresh', 'nav:home')],
  ]);

export const buyAmounts = (mint: string, presets: number[]): Keyboard => {
  const rows = [];
  for (let i = 0; i < presets.length; i += 2) {
    rows.push(
      presets.slice(i, i + 2).map((amount) => button(`${amount} SOL`, `buy:${mint}:${amount}`)),
    );
  }
  rows.push([button('✏️ Custom amount', `buy_custom:${mint}`)]);
  rows.push([button('🎯 Limit buy', `limit:limit_buy:${mint}`), button('↻ Refresh', `token:${mint}`)]);
  rows.push([button('‹ Back', 'nav:home')]);
  return Markup.inlineKeyboard(rows);
};

export const confirmTrade = (payload: string): Keyboard =>
  Markup.inlineKeyboard([
    [button('✅ Confirm', `confirm:${payload}`), button('✖️ Cancel', 'nav:home')],
  ]);

export const positionActions = (mint: string, presets: number[]): Keyboard => {
  const rows = [];
  for (let i = 0; i < presets.length; i += 2) {
    rows.push(
      presets.slice(i, i + 2).map((pct) => button(`Sell ${pct}%`, `sell:${mint}:${pct}`)),
    );
  }
  rows.push([
    button('⚡ Buy more', `token:${mint}`),
    button('🎯 Limit sell', `limit:limit_sell:${mint}`),
  ]);
  rows.push([button('📈 Chart', `chart:${mint}`), button('↻ Refresh', `position:${mint}`)]);
  rows.push([button('‹ Positions', 'nav:positions')]);
  return Markup.inlineKeyboard(rows);
};

export const positionList = (mints: Array<{ mint: string; symbol: string }>): Keyboard => {
  const rows = [];
  for (let i = 0; i < mints.length; i += 2) {
    rows.push(
      mints.slice(i, i + 2).map((token) => button(token.symbol, `position:${token.mint}`)),
    );
  }
  rows.push([button('↻ Refresh', 'nav:positions'), button('‹ Back', 'nav:home')]);
  return Markup.inlineKeyboard(rows);
};

export const walletMenu = (wallets: Wallet[]): Keyboard => {
  const rows = wallets.map((wallet) => [
    button(
      `${wallet.is_active ? '● ' : '○ '}${wallet.label} · ${shortenAddress(wallet.public_key)}`,
      `wallet_use:${wallet.id}`,
    ),
  ]);
  rows.push([button('➕ Generate', 'wallet_new'), button('📥 Import', 'wallet_import')]);
  rows.push([button('📤 Withdraw', 'wallet_withdraw'), button('🔑 Export key', 'wallet_export')]);
  rows.push([button('↻ Refresh', 'nav:wallet')]);
  rows.push([button('‹ Back', 'nav:home')]);
  return Markup.inlineKeyboard(rows);
};

export const settingsMenu = (settings: {
  slippage_bps: number;
  priority_fee_lamports: number;
  confirm_before_trade: number;
  mev_protection: number;
}): Keyboard =>
  Markup.inlineKeyboard([
    [button(`Slippage · ${(settings.slippage_bps / 100).toFixed(2)}%`, 'set:slippage')],
    [button(`Priority fee · ${settings.priority_fee_lamports.toLocaleString()} lamports`, 'set:priority')],
    [
      button(
        `Confirm trades · ${settings.confirm_before_trade ? 'on' : 'off'}`,
        'toggle:confirm',
      ),
    ],
    [button(`MEV protection · ${settings.mev_protection ? 'on' : 'off'}`, 'toggle:mev')],
    [button('‹ Back', 'nav:home')],
  ]);

export const orderList = (orders: Order[]): Keyboard => {
  const rows = orders
    .slice(0, 10)
    .map((order) => [button(`✖️ Cancel #${order.id} · ${order.symbol}`, `order_cancel:${order.id}`)]);
  rows.push([button('↻ Refresh', 'nav:orders'), button('‹ Back', 'nav:home')]);
  return Markup.inlineKeyboard(rows);
};

export const confirmWithdraw = (id: string): Keyboard =>
  Markup.inlineKeyboard([
    [button('✅ Send it', `withdraw_go:${id}`), button('✖️ Cancel', 'nav:wallet')],
  ]);

export const backHome = (): Keyboard =>
  Markup.inlineKeyboard([[button('‹ Back to menu', 'nav:home')]]);

export const linkRow = (mint: string): Keyboard =>
  Markup.inlineKeyboard([
    [
      Markup.button.url('Dexscreener', `https://dexscreener.com/solana/${mint}`),
      Markup.button.url('Solscan', `https://solscan.io/token/${mint}`),
    ],
    [button('‹ Back', `token:${mint}`)],
  ]);
