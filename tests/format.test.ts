import { describe, expect, it } from 'vitest';
import {
  bpsToPct,
  formatAmount,
  formatPrice,
  fromBaseUnits,
  lamportsToSol,
  shortenAddress,
  solToLamports,
  toBaseUnits,
} from '../src/lib/format';

describe('base unit conversion', () => {
  it('round-trips a whole token', () => {
    expect(toBaseUnits(1.5, 9)).toBe(1_500_000_000n);
    expect(fromBaseUnits(1_500_000_000n, 9)).toBe(1.5);
  });

  it('truncates below one base unit instead of rounding up', () => {
    // 0.9 of the smallest unit is not 1 unit; a naive round would mint dust.
    expect(toBaseUnits(0.0000000009, 9)).toBe(0n);
  });

  it('handles the six-decimal tokens most SPL mints use', () => {
    expect(toBaseUnits(12.345678, 6)).toBe(12_345_678n);
  });

  it('converts lamports both ways', () => {
    expect(solToLamports(0.25)).toBe(250_000_000n);
    expect(lamportsToSol(250_000_000n)).toBe(0.25);
  });
});

describe('formatPrice', () => {
  it('scales precision with magnitude', () => {
    expect(formatPrice(4231.5)).toBe('4,231.5');
    expect(formatPrice(1.23456789)).toBe('1.2346');
    expect(formatPrice(0.00123456)).toBe('0.001235');
  });

  it('falls back to exponential for memecoin prices', () => {
    expect(formatPrice(0.0000000021)).toBe('2.100e-9');
  });

  it('never renders NaN to a user', () => {
    expect(formatPrice(Number.NaN)).toBe('0');
    expect(formatPrice(0)).toBe('0');
  });
});

describe('display helpers', () => {
  it('compacts large token balances', () => {
    expect(formatAmount(42_180_000)).toBe('42.18M');
    expect(formatAmount(1840.22)).toBe('1.84K');
    expect(formatAmount(604.5)).toBe('604.5');
  });

  it('shortens addresses without mangling short strings', () => {
    expect(shortenAddress('So11111111111111111111111111111111111111112')).toBe('So11…1112');
    expect(shortenAddress('abc')).toBe('abc');
  });

  it('renders basis points as a percentage', () => {
    expect(bpsToPct(150)).toBe('1.50%');
  });
});
