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

export const isValidMint = (value: string): boolean => {
  try {
    // Off-curve keys are valid mints, so only the decode itself matters here.
    new PublicKey(value);
    return value.length >= 32 && value.length <= 44;
  } catch {
    return false;
  }
};

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

/** Every SPL token account the wallet owns, dust filtered out. */
export const getTokenBalances = async (publicKey: string): Promise<TokenBalance[]> => {
  const response = await getConnection().getParsedTokenAccountsByOwner(new PublicKey(publicKey), {
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  });

  return response.value
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

  const latest = await conn.getLatestBlockhash(commitment);
  const result = await conn.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
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
