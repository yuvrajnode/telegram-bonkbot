import {
  formatAmount,
  formatPct,
  formatPrice,
  formatUsd,
  shortenAddress,
} from '../lib/format';
import { explorerTx } from '../services/solana';
import type { PortfolioSummary, PositionView } from '../services/positions';
import type { TradePreview, TradeResult } from '../services/trading';
import type { SafetyReport } from '../services/safety';
import type { Order, TokenInfo, Trade, Wallet } from '../types';

/** Telegram's HTML parse mode only forgives these three. */
export const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sign = (value: number): string => (value >= 0 ? '🟢' : '🔴');

const rule = '━━━━━━━━━━━━━━━━━━━━';

export const homeScreen = (input: {
  firstName: string;
  wallet: Wallet;
  solBalance: number;
  solUsd: number;
  summary: PortfolioSummary;
}): string => {
  const { summary } = input;
  const equity = input.solBalance + summary.valueSol;

  return [
    `<b>BonkBot</b> · Solana trading desk`,
    rule,
    `Hey ${escape(input.firstName)}, here is where you stand.`,
    '',
    `<b>Wallet</b>  <code>${input.wallet.public_key}</code>`,
    `<b>Balance</b>  ${input.solBalance.toFixed(4)} SOL · ${formatUsd(input.solBalance * input.solUsd)}`,
    `<b>Holdings</b>  ${summary.valueSol.toFixed(4)} SOL · ${formatUsd(summary.valueUsd)}`,
    `<b>Equity</b>  ${equity.toFixed(4)} SOL`,
    '',
    `${sign(summary.unrealizedPnlSol)} Unrealised  ${summary.unrealizedPnlSol.toFixed(4)} SOL`,
    `${sign(summary.realizedPnlSol)} Realised  ${summary.realizedPnlSol.toFixed(4)} SOL`,
    `📊 ${summary.totalTrades} trades · ${summary.winRate.toFixed(0)}% win rate`,
    '',
    `<i>Paste any mint address to trade it instantly.</i>`,
  ].join('\n');
};

const RISK_BADGE: Record<SafetyReport['level'], string> = {
  low: '🟢 Looks clean',
  medium: '🟡 Some risk',
  high: '🟠 High risk',
  critical: '🔴 Do not buy',
};

/** Two worst flags is enough; a wall of warnings gets skimmed and ignored. */
export const riskBlock = (report: SafetyReport): string => {
  const order: Record<SafetyReport['level'], number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const worst = [...report.flags].sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 2);

  const lines = [`<b>Safety</b>  ${RISK_BADGE[report.level]} <i>(${report.score}/100)</i>`];
  for (const flag of worst) lines.push(`  • ${escape(flag.label)} — ${escape(flag.detail)}`);
  if (report.flags.length === 0) {
    lines.push('  • Sell route priced, no mint or freeze authority left open.');
  }
  return lines.join('\n');
};

export const tokenScreen = (input: {
  token: TokenInfo;
  priceSol: number;
  priceUsd: number;
  solBalance: number;
  position?: PositionView | undefined;
  safety?: SafetyReport | undefined;
}): string => {
  const lines = [
    `<b>${escape(input.token.symbol)}</b> · ${escape(input.token.name)}`,
    rule,
    `<code>${input.token.mint}</code>`,
    '',
    `<b>Price</b>  ${formatUsd(input.priceUsd)} · ${formatPrice(input.priceSol)} SOL`,
    `<b>Your SOL</b>  ${input.solBalance.toFixed(4)}`,
  ];

  if (input.position && input.position.position.token_amount > 0) {
    const view = input.position;
    lines.push(
      '',
      `<b>Open position</b>`,
      `Holding  ${formatAmount(view.position.token_amount)} ${escape(view.position.symbol)}`,
      `Entry  ${formatPrice(view.entryPriceSol)} SOL · Now ${formatPrice(view.priceSol)} SOL`,
      `${sign(view.unrealizedPnlSol)} ${view.unrealizedPnlSol.toFixed(4)} SOL (${formatPct(view.unrealizedPnlPct)})`,
    );
  }

  if (input.safety) lines.push('', riskBlock(input.safety));

  lines.push('', '<i>Pick a size below, or send a custom amount.</i>');
  return lines.join('\n');
};

export const previewScreen = (preview: TradePreview, side: 'buy' | 'sell'): string => {
  const impactFlag = preview.priceImpact > 5 ? ' ⚠️' : '';

  return [
    `<b>Confirm ${side}</b> · ${escape(preview.token.symbol)}`,
    rule,
    side === 'buy'
      ? `Spending  <b>${preview.inUi.toFixed(4)} SOL</b>`
      : `Selling  <b>${formatAmount(preview.inUi)} ${escape(preview.token.symbol)}</b>`,
    side === 'buy'
      ? `Receiving  ~${formatAmount(preview.outUi)} ${escape(preview.token.symbol)}`
      : `Receiving  ~${preview.outUi.toFixed(4)} SOL`,
    '',
    `Price  ${formatPrice(preview.priceSol)} SOL`,
    `Impact  ${preview.priceImpact.toFixed(2)}%${impactFlag}`,
    `Slippage  ${(preview.slippageBps / 100).toFixed(2)}%`,
    `Worst case  ${formatAmount(preview.minReceived)} ${side === 'buy' ? escape(preview.token.symbol) : 'SOL'}`,
    `Route  ${escape(preview.route.slice(0, 3).join(' → ') || 'direct')}`,
    '',
    `<i>Quotes move fast. This is re-priced the moment you confirm.</i>`,
  ].join('\n');
};

export const fillScreen = (result: TradeResult, side: 'buy' | 'sell'): string => {
  const lines = [
    side === 'buy' ? '✅ <b>Bought</b>' : '✅ <b>Sold</b>',
    rule,
    side === 'buy'
      ? `${formatAmount(result.tokenAmount)} ${escape(result.token.symbol)} for ${result.solAmount.toFixed(4)} SOL`
      : `${formatAmount(result.tokenAmount)} ${escape(result.token.symbol)} for ${result.solAmount.toFixed(4)} SOL`,
  ];

  if (typeof result.realizedPnlSol === 'number') {
    lines.push(
      `${sign(result.realizedPnlSol)} Realised ${result.realizedPnlSol.toFixed(4)} SOL on this exit`,
    );
  }

  lines.push('', `<a href="${explorerTx(result.signature)}">View transaction</a>`);
  return lines.join('\n');
};

export const positionsScreen = (summary: PortfolioSummary): string => {
  if (summary.positions.length === 0) {
    return [
      '<b>Positions</b>',
      rule,
      'Nothing open yet.',
      '',
      '<i>Paste a mint address and the buy menu opens right up.</i>',
    ].join('\n');
  }

  const rows = summary.positions.map((view) =>
    [
      `${sign(view.unrealizedPnlSol)} <b>${escape(view.position.symbol)}</b>  ${formatPct(view.unrealizedPnlPct)}`,
      `    ${formatAmount(view.position.token_amount)} @ ${formatPrice(view.entryPriceSol)} → ${formatPrice(view.priceSol)}`,
      `    ${view.valueSol.toFixed(4)} SOL · ${formatUsd(view.valueUsd)}`,
    ].join('\n'),
  );

  return [
    '<b>Positions</b>',
    rule,
    rows.join('\n\n'),
    '',
    rule,
    `Total  ${summary.valueSol.toFixed(4)} SOL · ${formatUsd(summary.valueUsd)}`,
    `${sign(summary.unrealizedPnlSol)} Unrealised ${summary.unrealizedPnlSol.toFixed(4)} SOL`,
  ].join('\n');
};

export const walletScreen = (
  entries: Array<{ wallet: Wallet; solBalance: number }>,
  solUsd: number,
): string => {
  const rows = entries.map((entry) =>
    [
      `${entry.wallet.is_active ? '●' : '○'} <b>${escape(entry.wallet.label)}</b>`,
      `    <code>${entry.wallet.public_key}</code>`,
      `    ${entry.solBalance.toFixed(4)} SOL · ${formatUsd(entry.solBalance * solUsd)}`,
    ].join('\n'),
  );

  return [
    '<b>Wallets</b>',
    rule,
    rows.join('\n\n'),
    '',
    '<i>Deposit by sending SOL to the address above. Keys are encrypted at rest and never leave this server.</i>',
  ].join('\n');
};

export const ordersScreen = (orders: Order[]): string => {
  if (orders.length === 0) {
    return [
      '<b>Open orders</b>',
      rule,
      'No resting orders.',
      '',
      '<i>Set one from any token screen — limit buy, limit sell, or a stop.</i>',
    ].join('\n');
  }

  const label: Record<Order['kind'], string> = {
    limit_buy: 'Limit buy',
    limit_sell: 'Limit sell',
    stop_loss: 'Stop loss',
    take_profit: 'Take profit',
  };

  const rows = orders.map((order) =>
    [
      `<b>#${order.id}</b> ${label[order.kind]} · ${escape(order.symbol)}`,
      `    Trigger ${formatPrice(order.trigger_price_sol)} SOL`,
      order.amount_sol
        ? `    Size ${order.amount_sol} SOL`
        : `    Size ${order.amount_pct}% of holding`,
      order.expires_at ? `    Expires ${order.expires_at} UTC` : '    Good till cancelled',
    ].join('\n'),
  );

  return ['<b>Open orders</b>', rule, rows.join('\n\n')].join('\n');
};

export const historyScreen = (trades: Trade[]): string => {
  if (trades.length === 0) {
    return ['<b>History</b>', rule, 'No trades yet.'].join('\n');
  }

  const rows = trades.map((trade) => {
    const arrow = trade.side === 'buy' ? '▲' : '▼';
    const status = trade.status === 'confirmed' ? '' : ` · ${trade.status}`;
    return `${arrow} <b>${escape(trade.symbol)}</b>  ${trade.sol_amount.toFixed(4)} SOL  <i>${trade.created_at}</i>${status}`;
  });

  return ['<b>Recent trades</b>', rule, rows.join('\n')].join('\n');
};

export const referralScreen = (input: {
  code: string;
  botUsername: string;
  invited: number;
  earnedSol: number;
}): string =>
  [
    '<b>Invite friends</b>',
    rule,
    'Share your link. You earn a slice of the fee on every trade they make.',
    '',
    `<code>https://t.me/${input.botUsername}?start=${input.code}</code>`,
    '',
    `Invited  <b>${input.invited}</b>`,
    `Earned  <b>${input.earnedSol.toFixed(4)} SOL</b>`,
  ].join('\n');

export const settingsScreen = (settings: {
  slippage_bps: number;
  priority_fee_lamports: number;
}): string =>
  [
    '<b>Settings</b>',
    rule,
    `Slippage tolerance decides how far the fill can drift before the swap reverts. ${(settings.slippage_bps / 100).toFixed(2)}% is a reasonable default for liquid pairs; low-liquidity launches often need more.`,
    '',
    `A higher priority fee gets your transaction into a block sooner when the network is busy. You are paying ${settings.priority_fee_lamports.toLocaleString()} lamports per swap.`,
  ].join('\n');

export const walletAddress = (wallet: Wallet): string =>
  `Deposit address for <b>${escape(wallet.label)}</b>\n\n<code>${wallet.public_key}</code>\n\n<i>${shortenAddress(wallet.public_key, 6)} — tap the address to copy.</i>`;
