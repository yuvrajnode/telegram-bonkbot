import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { SOL_RESERVE_LAMPORTS } from '../lib/constants';
import { InsufficientBalanceError, UserFacingError } from '../lib/errors';
import { lamportsToSol, solToLamports, toBaseUnits } from '../lib/format';
import { child } from '../lib/logger';
import {
  TOKEN_PROGRAM_ID,
  getSolBalance,
  getTokenBalance,
  isValidAddress,
  sendAndConfirm,
  withFailover,
} from './solana';
import { getTokenInfo } from './tokens';
import { getKeypair } from './wallets';
import type { Wallet } from '../types';

const log = child('transfers');

export interface WithdrawResult {
  signature: string;
  amount: number;
  symbol: string;
  destination: string;
}

/**
 * A withdrawal is the one irreversible action in the bot, so the destination
 * is checked properly rather than just parsed. An address that is already a
 * token account, or that is off-curve, will accept the transfer and strand
 * the funds - there is no undo and no support desk.
 */
const assertUsableDestination = (destination: string, self: string): PublicKey => {
  if (!isValidAddress(destination)) {
    throw new UserFacingError('That is not a valid Solana address.');
  }

  if (destination === self) {
    throw new UserFacingError('That is this wallet. Pick a different destination.');
  }

  const key = new PublicKey(destination);

  if (!PublicKey.isOnCurve(key.toBytes())) {
    throw new UserFacingError(
      'That address is not a normal wallet.',
      'It looks like a program or token account. Sending there would burn the funds.',
    );
  }

  return key;
};

const submit = async (
  wallet: Wallet,
  instructions: Array<ReturnType<typeof SystemProgram.transfer>>,
  priorityFeeLamports: number,
): Promise<string> => {
  const payer = getKeypair(wallet);

  const blockhash = await withFailover(async (connection) =>
    connection.getLatestBlockhash('confirmed'),
  );

  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeLamports }),
      ...instructions,
    ],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  transaction.sign([payer]);

  return sendAndConfirm(transaction);
};

export interface WithdrawSolParams {
  wallet: Wallet;
  destination: string;
  /** Omit to sweep everything except the fee reserve. */
  amountSol?: number;
  priorityFeeLamports: number;
}

export const withdrawSol = async (params: WithdrawSolParams): Promise<WithdrawResult> => {
  const destination = assertUsableDestination(params.destination, params.wallet.public_key);
  const balance = await getSolBalance(params.wallet.public_key);

  const reserve = lamportsToSol(SOL_RESERVE_LAMPORTS);
  const sweepable = Math.max(balance - reserve, 0);
  const amount = params.amountSol ?? sweepable;

  if (amount <= 0) {
    throw new UserFacingError(
      'There is nothing to withdraw once the fee reserve is kept back.',
      `The wallet holds ${balance.toFixed(4)} SOL and ${reserve.toFixed(4)} stays for fees.`,
    );
  }

  if (amount > sweepable) {
    throw new InsufficientBalanceError(
      `${(amount + reserve).toFixed(4)} SOL`,
      `${balance.toFixed(4)} SOL`,
    );
  }

  const signature = await submit(
    params.wallet,
    [
      SystemProgram.transfer({
        fromPubkey: new PublicKey(params.wallet.public_key),
        toPubkey: destination,
        lamports: solToLamports(amount),
      }),
    ],
    params.priorityFeeLamports,
  );

  log.info({ wallet: params.wallet.public_key, amount, signature }, 'sol withdrawn');
  return { signature, amount, symbol: 'SOL', destination: params.destination };
};

export interface WithdrawTokenParams {
  wallet: Wallet;
  destination: string;
  mint: string;
  /** Percentage of the holding, 0 < pct <= 100. */
  percent: number;
  priorityFeeLamports: number;
}

export const withdrawToken = async (params: WithdrawTokenParams): Promise<WithdrawResult> => {
  const destination = assertUsableDestination(params.destination, params.wallet.public_key);
  const token = await getTokenInfo(params.mint);
  const balance = await getTokenBalance(params.wallet.public_key, params.mint);

  if (!balance || balance.amount <= 0) {
    throw new UserFacingError(`You do not hold any ${token.symbol}.`);
  }

  const rawTotal = BigInt(balance.rawAmount);
  const rawAmount =
    params.percent >= 100
      ? rawTotal
      : (rawTotal * BigInt(Math.round(params.percent * 100))) / BigInt(10_000);

  if (rawAmount <= 0n) {
    throw new UserFacingError('That percentage rounds down to zero tokens.');
  }

  const owner = new PublicKey(params.wallet.public_key);
  const mint = new PublicKey(params.mint);
  const source = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
  const target = getAssociatedTokenAddressSync(mint, destination, false, TOKEN_PROGRAM_ID);

  const instructions = [];

  // The recipient may never have held this mint. Creating their account costs
  // the sender rent, which is the normal cost of sending a token on Solana.
  const targetExists = await withFailover((connection) => connection.getAccountInfo(target));
  if (!targetExists) {
    instructions.push(
      createAssociatedTokenAccountInstruction(owner, target, destination, mint, TOKEN_PROGRAM_ID),
    );
  }

  instructions.push(
    createTransferCheckedInstruction(
      source,
      mint,
      target,
      owner,
      rawAmount,
      token.decimals,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  const signature = await submit(params.wallet, instructions, params.priorityFeeLamports);
  const amount = Number(rawAmount) / 10 ** token.decimals;

  log.info({ mint: params.mint, amount, signature }, 'token withdrawn');
  return { signature, amount, symbol: token.symbol, destination: params.destination };
};

/** Exposed so the confirm screen can show exactly what will leave the wallet. */
export const sweepableSol = async (wallet: Wallet): Promise<number> => {
  const balance = await getSolBalance(wallet.public_key);
  return Math.max(balance - lamportsToSol(SOL_RESERVE_LAMPORTS), 0);
};

export const parseAmount = (raw: string, max: number): number => {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'all' || trimmed === 'max') return max;

  const value = Number(trimmed.replace(/[, ]/g, ''));
  if (!Number.isFinite(value) || value <= 0) {
    throw new UserFacingError('Send an amount, or "all".');
  }
  return value;
};

export const baseUnitsFor = (amount: number, decimals: number): bigint =>
  toBaseUnits(amount, decimals);
