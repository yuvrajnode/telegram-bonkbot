import { describe, expect, it } from 'vitest';
import { detectSwap } from '../src/services/copytrade';
import { SOL_MINT } from '../src/lib/constants';

const TARGET = '7xKXtg2CW3qNvKfMhLYb4pDqmR9uYaHLoP1sVtEeJ4Zm';
const OTHER = 'BqTk9NcYvA2s5dWmXpR7uHf3LzJeCg1QoVn8ZyPd6Ktb';
const WIF = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';
const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

/**
 * Swaps are identified from balance deltas rather than decoded instructions,
 * so these cases are the whole contract: every AMM looks the same here.
 */
describe('swap detection from balance deltas', () => {
  it('reads a buy: token in, SOL out', () => {
    const swap = detectSwap({
      owner: TARGET,
      preTokens: [],
      postTokens: [{ owner: TARGET, mint: WIF, uiAmount: 1200 }],
      solDelta: -5,
    });

    expect(swap).toEqual({ side: 'buy', mint: WIF, tokenAmount: 1200 });
  });

  it('reads a sell and how much of the bag was exited', () => {
    const swap = detectSwap({
      owner: TARGET,
      preTokens: [{ owner: TARGET, mint: WIF, uiAmount: 1000 }],
      postTokens: [{ owner: TARGET, mint: WIF, uiAmount: 250 }],
      solDelta: 3.2,
    });

    expect(swap?.side).toBe('sell');
    expect(swap?.exitFraction).toBeCloseTo(0.75, 6);
  });

  it('ignores a plain token transfer - no SOL moved, so nothing was traded', () => {
    expect(
      detectSwap({
        owner: TARGET,
        preTokens: [{ owner: TARGET, mint: WIF, uiAmount: 1000 }],
        postTokens: [{ owner: TARGET, mint: WIF, uiAmount: 0 }],
        solDelta: -0.000005, // fee only
      }),
    ).toBeUndefined();
  });

  it('ignores balances belonging to other wallets in the same transaction', () => {
    // The pool and the counterparty appear in the same meta; only the target
    // being followed counts.
    expect(
      detectSwap({
        owner: TARGET,
        preTokens: [{ owner: OTHER, mint: WIF, uiAmount: 0 }],
        postTokens: [{ owner: OTHER, mint: WIF, uiAmount: 9000 }],
        solDelta: -5,
      }),
    ).toBeUndefined();
  });

  it('ignores wrapped SOL legs so a wrap is not mistaken for a trade', () => {
    expect(
      detectSwap({
        owner: TARGET,
        preTokens: [{ owner: TARGET, mint: SOL_MINT, uiAmount: 0 }],
        postTokens: [{ owner: TARGET, mint: SOL_MINT, uiAmount: 5 }],
        solDelta: -5,
      }),
    ).toBeUndefined();
  });

  it('picks the largest leg when a route touches several mints', () => {
    const swap = detectSwap({
      owner: TARGET,
      preTokens: [{ owner: TARGET, mint: BONK, uiAmount: 100 }],
      postTokens: [
        { owner: TARGET, mint: BONK, uiAmount: 101 },
        { owner: TARGET, mint: WIF, uiAmount: 5000 },
      ],
      solDelta: -8,
    });

    expect(swap?.mint).toBe(WIF);
  });

  it('treats a full exit as a complete sell', () => {
    const swap = detectSwap({
      owner: TARGET,
      preTokens: [{ owner: TARGET, mint: BONK, uiAmount: 42_000 }],
      postTokens: [{ owner: TARGET, mint: BONK, uiAmount: 0 }],
      solDelta: 1.4,
    });

    expect(swap?.exitFraction).toBe(1);
  });

  it('ignores dust so a rounding artefact is not copied', () => {
    expect(
      detectSwap({
        owner: TARGET,
        preTokens: [{ owner: TARGET, mint: BONK, uiAmount: 100 }],
        postTokens: [{ owner: TARGET, mint: BONK, uiAmount: 100.0000000001 }],
        solDelta: -0.5,
      }),
    ).toBeUndefined();
  });
});
