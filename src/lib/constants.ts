export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Left in the wallet so the account stays rent exempt and can still pay fees. */
export const SOL_RESERVE_LAMPORTS = 7_000_000; // ~0.007 SOL

export const BPS_DENOMINATOR = 10_000;

export const QUICK_BUY_PRESETS_SOL = [0.1, 0.25, 0.5, 1] as const;
export const QUICK_SELL_PRESETS_PCT = [25, 50, 75, 100] as const;

/** Jupiter rejects quotes older than a few seconds; refresh before signing. */
export const QUOTE_TTL_MS = 8_000;
