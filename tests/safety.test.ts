import { describe, expect, it, vi, beforeEach } from 'vitest';

// The analyser reaches for Jupiter and an RPC; both are stubbed so the scoring
// and gating logic can be tested without a network or a live mint.
vi.mock('../src/services/jupiter', () => ({ getQuote: vi.fn() }));
vi.mock('../src/services/solana', () => ({
  TOKEN_PROGRAM_ID: {},
  TOKEN_2022_PROGRAM_ID: {},
  withFailover: vi.fn(),
}));
vi.mock('../src/services/tokens', () => ({
  getTokenInfo: vi.fn(async () => ({
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    symbol: 'TEST',
    name: 'Test',
    decimals: 6,
    logo_uri: null,
  })),
}));
vi.mock('@solana/spl-token', () => ({ getMint: vi.fn() }));

import { getQuote } from '../src/services/jupiter';
import { withFailover } from '../src/services/solana';
import { analyze, clearSafetyCache, isBlocking } from '../src/services/safety';

const mockedQuote = vi.mocked(getQuote);
const mockedFailover = vi.mocked(withFailover);

/** Has to be real base58: the analyser builds a PublicKey before any lookup. */
const MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

/** A clean mint: authorities renounced, deep enough to round trip cheaply. */
const healthyMint = (overrides: Record<string, unknown> = {}) => ({
  mintAuthority: null,
  freezeAuthority: null,
  supply: 1_000_000n,
  decimals: 6,
  ...overrides,
});

const stubChain = (mint: ReturnType<typeof healthyMint>, topHolders: string[] = ['0']) => {
  // The analyser reads the mint account first, then the largest accounts.
  let call = 0;
  mockedFailover.mockImplementation(async () => {
    call += 1;
    if (call === 1) return mint as never;
    return { value: topHolders.map((amount) => ({ amount })) } as never;
  });
};

const stubRoundTrip = (returnedLamports: number) => {
  mockedQuote
    .mockResolvedValueOnce({ outAmount: '1000' } as never)
    .mockResolvedValueOnce({ outAmount: String(returnedLamports) } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  clearSafetyCache();
});

describe('safety analysis', () => {
  it('passes a renounced, liquid token', async () => {
    stubChain(healthyMint());
    stubRoundTrip(49_000_000); // 0.05 SOL in, ~2% round trip loss

    const report = await analyze(MINT);

    expect(report.flags).toHaveLength(0);
    expect(report.level).toBe('low');
    expect(isBlocking(report)).toBe(false);
  });

  it('treats an unpriceable sell as a honeypot and blocks it', async () => {
    stubChain(healthyMint());
    mockedQuote.mockRejectedValue(new Error('no route'));

    const report = await analyze(MINT);

    expect(report.flags.map((flag) => flag.code)).toContain('no_sell_route');
    expect(report.level).toBe('critical');
    expect(isBlocking(report)).toBe(true);
  });

  it('blocks a live freeze authority - the deployer can trap the position', async () => {
    stubChain(healthyMint({ freezeAuthority: 'somekey' }));
    stubRoundTrip(49_000_000);

    const report = await analyze(MINT);

    expect(report.flags.map((flag) => flag.code)).toContain('freeze_authority');
    expect(isBlocking(report)).toBe(true);
  });

  it('flags a live mint authority without blocking the trade', async () => {
    stubChain(healthyMint({ mintAuthority: 'somekey' }));
    stubRoundTrip(49_000_000);

    const report = await analyze(MINT);

    expect(report.flags.map((flag) => flag.code)).toContain('mint_authority');
    expect(report.level).toBe('high');
    expect(isBlocking(report)).toBe(false);
  });

  it('grades round trip loss in bands rather than pass/fail', async () => {
    stubChain(healthyMint());
    stubRoundTrip(40_000_000); // 20% loss

    const report = await analyze(MINT);
    expect(report.flags.map((flag) => flag.code)).toContain('thin_liquidity');
    expect(report.roundTripLossPct).toBeCloseTo(20, 1);
  });

  it('flags concentration in the wallets behind the pool', async () => {
    // Largest account is skipped as the pool; the next four hold 50%.
    stubChain(healthyMint(), ['400000', '200000', '150000', '100000', '50000']);
    stubRoundTrip(49_000_000);

    const report = await analyze(MINT);
    expect(report.flags.map((flag) => flag.code)).toContain('holder_concentration');
  });

  it('caches a report so the buy screen and the gate agree', async () => {
    stubChain(healthyMint());
    stubRoundTrip(49_000_000);

    const first = await analyze(MINT);
    const second = await analyze(MINT);

    expect(second).toBe(first);
    expect(mockedQuote).toHaveBeenCalledTimes(2); // not re-probed
  });
});
