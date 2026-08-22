import { PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { SOL_MINT, LAMPORTS_PER_SOL } from '../lib/constants';
import { child } from '../lib/logger';
import { getQuote } from './jupiter';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, withFailover } from './solana';
import { getTokenInfo } from './tokens';

const log = child('safety');

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFlag {
  code: string;
  label: string;
  detail: string;
  severity: RiskLevel;
}

export interface SafetyReport {
  mint: string;
  symbol: string;
  level: RiskLevel;
  score: number; // 0 clean, 100 unsalvageable
  flags: RiskFlag[];
  /** Round-trip loss in percent: buy then immediately sell the same size. */
  roundTripLossPct?: number;
  topHolderPct?: number;
  checkedAt: number;
}

const SEVERITY_WEIGHT: Record<RiskLevel, number> = {
  low: 5,
  medium: 20,
  high: 35,
  critical: 60,
};

const levelFor = (score: number): RiskLevel => {
  if (score >= 60) return 'critical';
  if (score >= 35) return 'high';
  if (score >= 15) return 'medium';
  return 'low';
};

/** Reports are cached briefly: the buy screen and the confirm screen both ask. */
const cache = new Map<string, SafetyReport>();
const TTL_MS = 60_000;

/**
 * The single most useful question about a new token is not "is the contract
 * verified" - Solana has no such thing - but "can I get back out?". So the
 * check is empirical: price a buy, then price selling exactly what that buy
 * would return. A honeypot either has no sell route at all, or the round trip
 * loses far more than the spread and fees can explain.
 */
const probeRoundTrip = async (
  mint: string,
): Promise<{ lossPct: number; sellable: boolean }> => {
  const probeLamports = BigInt(Math.round(0.05 * LAMPORTS_PER_SOL));

  try {
    const buy = await getQuote({
      inputMint: SOL_MINT,
      outputMint: mint,
      amount: probeLamports,
      slippageBps: 500,
    });

    const sell = await getQuote({
      inputMint: mint,
      outputMint: SOL_MINT,
      amount: BigInt(buy.outAmount),
      slippageBps: 500,
    });

    const returned = Number(sell.outAmount);
    const spent = Number(probeLamports);
    const lossPct = ((spent - returned) / spent) * 100;

    return { lossPct, sellable: returned > 0 };
  } catch (error) {
    log.debug({ err: error, mint }, 'round trip probe failed');
    return { lossPct: 100, sellable: false };
  }
};

const readMintAccount = async (mint: string) => {
  const key = new PublicKey(mint);
  return withFailover(async (connection) => {
    try {
      return await getMint(connection, key, undefined, TOKEN_PROGRAM_ID);
    } catch {
      return getMint(connection, key, undefined, TOKEN_2022_PROGRAM_ID);
    }
  });
};

const topHolderShare = async (mint: string, supply: bigint): Promise<number | undefined> => {
  if (supply <= 0n) return undefined;

  try {
    const largest = await withFailover((connection) =>
      connection.getTokenLargestAccounts(new PublicKey(mint)),
    );

    // The top account is usually the liquidity pool, which is not a red flag
    // by itself - it is the second and third that mean a single wallet can
    // dump on you. Skip the largest and measure the next four.
    const holders = largest.value.slice(1, 5);
    const held = holders.reduce((sum, account) => sum + BigInt(account.amount), 0n);

    return (Number(held) / Number(supply)) * 100;
  } catch (error) {
    log.debug({ err: error, mint }, 'holder lookup failed');
    return undefined;
  }
};

export const analyze = async (mint: string): Promise<SafetyReport> => {
  const cached = cache.get(mint);
  if (cached && Date.now() - cached.checkedAt < TTL_MS) return cached;

  const token = await getTokenInfo(mint);
  const flags: RiskFlag[] = [];

  const [mintAccount, roundTrip] = await Promise.all([
    readMintAccount(mint).catch(() => undefined),
    probeRoundTrip(mint),
  ]);

  if (mintAccount) {
    if (mintAccount.mintAuthority) {
      flags.push({
        code: 'mint_authority',
        label: 'Mint authority live',
        detail: 'The deployer can still print new supply and dilute holders.',
        severity: 'high',
      });
    }

    if (mintAccount.freezeAuthority) {
      flags.push({
        code: 'freeze_authority',
        label: 'Freeze authority live',
        detail: 'The deployer can freeze your account so you cannot sell.',
        severity: 'critical',
      });
    }
  } else {
    flags.push({
      code: 'mint_unreadable',
      label: 'Mint account unreadable',
      detail: 'The mint could not be read on-chain. Treat it as unknown.',
      severity: 'medium',
    });
  }

  if (!roundTrip.sellable) {
    flags.push({
      code: 'no_sell_route',
      label: 'No sell route',
      detail: 'A sell could not be priced at all. This is what a honeypot looks like.',
      severity: 'critical',
    });
  } else if (roundTrip.lossPct > 35) {
    flags.push({
      code: 'round_trip_loss',
      label: `Round trip loses ${roundTrip.lossPct.toFixed(0)}%`,
      detail: 'Buying and immediately selling burns most of the position. Thin or taxed.',
      severity: 'high',
    });
  } else if (roundTrip.lossPct > 15) {
    flags.push({
      code: 'thin_liquidity',
      label: `Round trip loses ${roundTrip.lossPct.toFixed(0)}%`,
      detail: 'Liquidity is thin; size in accordingly.',
      severity: 'medium',
    });
  }

  const concentration = mintAccount
    ? await topHolderShare(mint, mintAccount.supply)
    : undefined;

  if (concentration !== undefined && concentration > 40) {
    flags.push({
      code: 'holder_concentration',
      label: `Top wallets hold ${concentration.toFixed(0)}%`,
      detail: 'A handful of wallets can exit into your bid.',
      severity: concentration > 60 ? 'high' : 'medium',
    });
  }

  const score = Math.min(
    flags.reduce((sum, flag) => sum + SEVERITY_WEIGHT[flag.severity], 0),
    100,
  );

  const report: SafetyReport = {
    mint,
    symbol: token.symbol,
    level: levelFor(score),
    score,
    flags,
    roundTripLossPct: roundTrip.sellable ? roundTrip.lossPct : undefined,
    topHolderPct: concentration,
    checkedAt: Date.now(),
  };

  cache.set(mint, report);
  return report;
};

/** Cheap synchronous read for screens that should not block on a probe. */
export const cachedReport = (mint: string): SafetyReport | undefined => {
  const report = cache.get(mint);
  return report && Date.now() - report.checkedAt < TTL_MS ? report : undefined;
};

export const clearSafetyCache = (): void => cache.clear();

export const isBlocking = (report: SafetyReport): boolean => report.level === 'critical';
