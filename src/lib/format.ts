import { LAMPORTS_PER_SOL } from './constants';

/** Convert a raw base-unit amount into a human number. */
export const fromBaseUnits = (amount: bigint | string | number, decimals: number): number =>
  Number(BigInt(amount)) / 10 ** decimals;

/** Convert a human number into raw base units, truncating dust below one unit. */
export const toBaseUnits = (amount: number, decimals: number): bigint =>
  BigInt(Math.floor(amount * 10 ** decimals));

export const lamportsToSol = (lamports: bigint | number): number =>
  Number(lamports) / LAMPORTS_PER_SOL;

export const solToLamports = (sol: number): bigint =>
  BigInt(Math.round(sol * LAMPORTS_PER_SOL));

/**
 * Prices in this market span from 4,000 (SOL) to 0.0000000021 (a fresh
 * memecoin), so a fixed precision is useless. Scale the digits instead.
 */
export const formatPrice = (value: number): string => {
  if (!Number.isFinite(value) || value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (abs >= 1) return value.toFixed(4);
  if (abs >= 0.0001) return value.toFixed(6);
  return value.toExponential(3);
};

export const formatAmount = (value: number, maxDigits = 4): string => {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toLocaleString('en-US', { maximumFractionDigits: maxDigits });
};

export const formatUsd = (value: number): string => {
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : 6;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })}`;
};

export const formatPct = (value: number): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

export const shortenAddress = (address: string, size = 4): string =>
  address.length <= size * 2 + 1 ? address : `${address.slice(0, size)}…${address.slice(-size)}`;

export const bpsToPct = (bps: number): string => `${(bps / 100).toFixed(2)}%`;
