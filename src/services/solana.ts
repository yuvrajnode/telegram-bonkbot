import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  type Commitment,
  type VersionedTransaction,
} from '@solana/web3.js';
import { env } from '../config/env';
import { child } from '../lib/logger';
import { TransactionFailedError } from '../lib/errors';

const log = child('solana');

let connection: Connection | null = null;

export const getConnection = (): Connection => {
  if (connection) return connection;
  connection = new Connection(env.solana.rpcUrl, {
    commitment: 'confirmed',
    ...(env.solana.wsUrl ? { wsEndpoint: env.solana.wsUrl } : {}),
  });
  return connection;
};

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

export const isValidAddress = (value: string): boolean => {
  try {
    // Off-curve keys are valid mints, so only the decode itself matters here.
    new PublicKey(value);
    return value.length >= 32 && value.length <= 44;
  } catch {
    return false;
  }
};

/** Kept as a separate name because a mint is an address with extra meaning. */
export const isValidMint = isValidAddress;

export const getSolBalance = async (publicKey: string): Promise<number> => {
  const lamports = await getConnection().getBalance(new PublicKey(publicKey), 'confirmed');
  return lamports / LAMPORTS_PER_SOL;
};

export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  rawAmount: string;
}

/**
 * Every token account the wallet owns, dust filtered out. Both token programs
 * are queried: Token-2022 mints are a growing share of new launches and an
 * owner's accounts are split across the two programs, never merged.
 */
export const getTokenBalances = async (publicKey: string): Promise<TokenBalance[]> => {
  const owner = new PublicKey(publicKey);
  const connection = getConnection();

  const responses = await Promise.all(
    [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((programId) =>
      connection.getParsedTokenAccountsByOwner(owner, { programId }).catch(() => ({ value: [] })),
    ),
  );

  return responses
    .flatMap((response) => response.value)
    .map((account) => {
      const info = account.account.data.parsed.info as {
        mint: string;
        tokenAmount: { uiAmount: number | null; decimals: number; amount: string };
      };
      return {
        mint: info.mint,
        amount: info.tokenAmount.uiAmount ?? 0,
        decimals: info.tokenAmount.decimals,
        rawAmount: info.tokenAmount.amount,
      };
    })
    .filter((balance) => balance.amount > 0);
};

export const getTokenBalance = async (
  publicKey: string,
  mint: string,
): Promise<TokenBalance | undefined> => {
  const balances = await getTokenBalances(publicKey);
  return balances.find((balance) => balance.mint === mint);
};

/**
 * Send and confirm, but do not trust `confirmTransaction` alone: it resolves
 * on a landed signature even when the instruction itself reverted, so the
 * meta.err is checked explicitly.
 */
export const sendAndConfirm = async (
  transaction: VersionedTransaction,
  commitment: Commitment = 'confirmed',
): Promise<string> => {
  const conn = getConnection();

  const signature = await conn.sendTransaction(transaction, {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: commitment,
  });

  log.debug({ signature }, 'transaction submitted');

  // Confirm against the blockhash the transaction was actually built on. A
  // freshly fetched one has a later expiry and would keep polling a
  // transaction that can no longer land.
  const blockhash = transaction.message.recentBlockhash;
  const lastValidBlockHeight = (await conn.getBlockHeight(commitment)) + 150;

  const result = await conn.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    commitment,
  );

  if (result.value.err) {
    throw new TransactionFailedError(
      `Transaction reverted on-chain: ${JSON.stringify(result.value.err)}`,
      signature,
    );
  }

  return signature;
};

export const explorerTx = (signature: string): string => `https://solscan.io/tx/${signature}`;
export const explorerAccount = (address: string): string =>
  `https://solscan.io/account/${address}`;
