import { describe, expect, it } from 'vitest';
import { shouldTrigger } from '../src/services/orders';
import type { Order, OrderKind } from '../src/types';

const order = (kind: OrderKind, triggerPriceSol: number): Order => ({
  id: 1,
  user_id: 1,
  wallet_id: 1,
  mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  symbol: 'BONK',
  kind,
  trigger_price_sol: triggerPriceSol,
  amount_sol: 1,
  amount_pct: null,
  status: 'open',
  trade_id: null,
  expires_at: null,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
});

describe('order triggers', () => {
  it('fires a limit buy at or below the trigger', () => {
    expect(shouldTrigger(order('limit_buy', 0.01), 0.009)).toBe(true);
    expect(shouldTrigger(order('limit_buy', 0.01), 0.01)).toBe(true);
    expect(shouldTrigger(order('limit_buy', 0.01), 0.011)).toBe(false);
  });

  it('fires a limit sell and a take profit on the way up', () => {
    expect(shouldTrigger(order('limit_sell', 0.01), 0.011)).toBe(true);
    expect(shouldTrigger(order('take_profit', 0.01), 0.0099)).toBe(false);
  });

  it('fires a stop loss on the way down, unlike every other sell', () => {
    expect(shouldTrigger(order('stop_loss', 0.01), 0.009)).toBe(true);
    expect(shouldTrigger(order('stop_loss', 0.01), 0.011)).toBe(false);
  });
});
