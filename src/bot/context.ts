import type { Context } from 'telegraf';
import type { Settings, User, Wallet } from '../types';

/**
 * A very small step machine. The bot asks for one free-text value at a time
 * ("send me the mint", "how much SOL?"), so a pending prompt per chat is
 * enough - no need for the full scene/stage machinery.
 */
export type PendingPrompt =
  | { kind: 'buy_mint' }
  | { kind: 'buy_amount'; mint: string }
  | { kind: 'sell_percent'; mint: string }
  | { kind: 'import_wallet' }
  | { kind: 'set_slippage' }
  | { kind: 'set_priority_fee' }
  | { kind: 'limit_order_price'; mint: string; kind_of: 'limit_buy' | 'limit_sell' }
  | { kind: 'limit_order_amount'; mint: string; kind_of: 'limit_buy' | 'limit_sell'; price: number };

export interface BotContext extends Context {
  user: User;
  settings: Settings;
  wallet: Wallet;
  pending?: PendingPrompt | undefined;
  setPending: (prompt: PendingPrompt | undefined) => void;
}

const prompts = new Map<number, PendingPrompt>();

export const getPending = (telegramId: number): PendingPrompt | undefined =>
  prompts.get(telegramId);

export const setPending = (telegramId: number, prompt: PendingPrompt | undefined): void => {
  if (prompt) prompts.set(telegramId, prompt);
  else prompts.delete(telegramId);
};

export const clearAllPending = (): void => prompts.clear();
