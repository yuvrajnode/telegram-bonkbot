import { describe, expect, it } from 'vitest';
import { remember, take } from '../src/bot/intents';

describe('trade intents', () => {
  it('keeps callback data inside the 64 byte Telegram limit', () => {
    const id = remember({ userId: 1, side: 'buy', mint: 'So11111111111111111111111111111111111111112', amountSol: 1 });
    expect(`confirm:${id}`.length).toBeLessThanOrEqual(64);
  });

  it('returns the intent exactly once', () => {
    const id = remember({ userId: 7, side: 'sell', mint: 'mint', percent: 50 });
    expect(take(id, 7)?.percent).toBe(50);
    expect(take(id, 7)).toBeUndefined();
  });

  it('will not hand an intent to a different user', () => {
    const id = remember({ userId: 7, side: 'buy', mint: 'mint', amountSol: 1 });
    expect(take(id, 8)).toBeUndefined();
    // The original owner can still claim it.
    expect(take(id, 7)).toBeDefined();
  });
});
