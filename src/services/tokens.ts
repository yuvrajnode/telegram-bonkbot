import { PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import * as tokenRepo from '../db/repositories/tokens';
import { SOL_MINT } from '../lib/constants';
import { child } from '../lib/logger';
import { UserFacingError } from '../lib/errors';
import { shortenAddress } from '../lib/format';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getConnection, isValidMint } from './solana';
import { fetchJson } from './http';
import type { TokenInfo } from '../types';

const log = child('tokens');

const NATIVE_SOL: TokenInfo = {
  mint: SOL_MINT,
  symbol: 'SOL',
  name: 'Solana',
  decimals: 9,
  logo_uri: null,
};

interface JupTokenResponse {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

/**
 * Metadata comes from Jupiter's token registry when it knows the mint. Brand
 * new launches are not in it yet, so the mint account itself is the fallback:
 * decimals are all the trade path strictly needs.
 */
export const getTokenInfo = async (mint: string): Promise<TokenInfo> => {
  if (mint === SOL_MINT) return NATIVE_SOL;

  if (!isValidMint(mint)) {
    throw new UserFacingError('That is not a valid Solana mint address.');
  }

  const cached = tokenRepo.getFresh(mint);
  if (cached) return cached;

  try {
    const token = await fetchJson<JupTokenResponse>(`https://tokens.jup.ag/token/${mint}`, {
      timeoutMs: 6_000,
      retries: 1,
    });
    if (token?.address) {
      return tokenRepo.save({
        mint: token.address,
        symbol: token.symbol || shortenAddress(mint),
        name: token.name || 'Unknown token',
        decimals: token.decimals,
        logo_uri: token.logoURI ?? null,
      });
    }
  } catch (error) {
    log.debug({ err: error, mint }, 'registry miss, falling back to chain');
  }

  try {
    // Try the classic token program first, then Token-2022: a mint belongs to
    // exactly one of them and the wrong program id reads as "account missing".
    const mintAccount = await getMint(getConnection(), new PublicKey(mint), undefined, TOKEN_PROGRAM_ID).catch(
      () => getMint(getConnection(), new PublicKey(mint), undefined, TOKEN_2022_PROGRAM_ID),
    );
    return tokenRepo.save({
      mint,
      symbol: shortenAddress(mint),
      name: 'Unverified token',
      decimals: mintAccount.decimals,
      logo_uri: null,
    });
  } catch {
    // A stale cache entry beats failing the trade outright.
    const stale = tokenRepo.get(mint);
    if (stale) return stale;
    throw new UserFacingError(
      'Could not read that mint on-chain.',
      'Double check the address, or try again once the RPC catches up.',
    );
  }
};

export const getTokenInfos = async (mints: string[]): Promise<Map<string, TokenInfo>> => {
  const entries = await Promise.all(
    [...new Set(mints)].map(async (mint) => {
      try {
        return [mint, await getTokenInfo(mint)] as const;
      } catch {
        return undefined;
      }
    }),
  );
  return new Map(entries.filter((entry): entry is readonly [string, TokenInfo] => Boolean(entry)));
};
