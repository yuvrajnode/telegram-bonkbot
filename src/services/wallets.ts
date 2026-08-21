import { Keypair } from '@solana/web3.js';
import * as walletRepo from '../db/repositories/wallets';
import { UserFacingError } from '../lib/errors';
import { child } from '../lib/logger';
import {
  encryptSecretKey,
  exportPrivateKey,
  generateKeypair,
  keypairFromEncrypted,
  keypairFromPrivateKey,
} from './keystore';
import { getSolBalance } from './solana';
import type { Wallet } from '../types';

const log = child('wallets');

/** Keeping the roster small keeps the wallet keyboard on one screen. */
const MAX_WALLETS_PER_USER = 5;

const nextLabel = (userId: number): string => {
  const count = walletRepo.listByUser(userId).length;
  return count === 0 ? 'Main' : `Wallet ${count + 1}`;
};

const assertHeadroom = (userId: number): void => {
  if (walletRepo.listByUser(userId).length >= MAX_WALLETS_PER_USER) {
    throw new UserFacingError(
      `You already have ${MAX_WALLETS_PER_USER} wallets.`,
      'Remove one before adding another.',
    );
  }
};

export const createWallet = (userId: number, label?: string): Wallet => {
  assertHeadroom(userId);
  const keypair = generateKeypair();

  const wallet = walletRepo.create({
    userId,
    label: label ?? nextLabel(userId),
    publicKey: keypair.publicKey.toBase58(),
    encryptedKey: encryptSecretKey(keypair.secretKey),
  });

  log.info({ userId, wallet: wallet.public_key }, 'wallet generated');
  return wallet;
};

export const importWallet = (userId: number, privateKey: string, label?: string): Wallet => {
  assertHeadroom(userId);
  const keypair = keypairFromPrivateKey(privateKey);
  const publicKey = keypair.publicKey.toBase58();

  const existing = walletRepo.findByPublicKey(publicKey);
  if (existing) {
    if (existing.user_id !== userId) {
      throw new UserFacingError('That wallet is already registered to another account.');
    }
    throw new UserFacingError('You have already imported that wallet.');
  }

  const wallet = walletRepo.create({
    userId,
    label: label ?? nextLabel(userId),
    publicKey,
    encryptedKey: encryptSecretKey(keypair.secretKey),
  });

  log.info({ userId, wallet: publicKey }, 'wallet imported');
  return wallet;
};

/** Every user has exactly one active wallet; create it lazily on first use. */
export const getOrCreateActiveWallet = (userId: number): Wallet =>
  walletRepo.getActive(userId) ?? createWallet(userId);

export const listWallets = (userId: number): Wallet[] => walletRepo.listByUser(userId);

export const switchWallet = (userId: number, walletId: number): Wallet => {
  const wallet = walletRepo.findById(walletId);
  if (!wallet || wallet.user_id !== userId) {
    throw new UserFacingError('That wallet does not belong to you.');
  }
  walletRepo.setActive(userId, walletId);
  return walletRepo.findById(walletId)!;
};

export const renameWallet = (userId: number, walletId: number, label: string): void => {
  const wallet = walletRepo.findById(walletId);
  if (!wallet || wallet.user_id !== userId) {
    throw new UserFacingError('That wallet does not belong to you.');
  }
  walletRepo.rename(walletId, label.slice(0, 24));
};

export const removeWallet = (userId: number, walletId: number): void => {
  const wallets = walletRepo.listByUser(userId);
  if (wallets.length <= 1) {
    throw new UserFacingError('You cannot remove your only wallet.');
  }
  walletRepo.remove(userId, walletId);
};

export const getKeypair = (wallet: Wallet): Keypair => keypairFromEncrypted(wallet.encrypted_key);

/**
 * Revealing a key is deliberately a separate call from everything else so it
 * is easy to audit: this is the only path that returns plaintext secrets.
 */
export const revealPrivateKey = (userId: number, walletId: number): string => {
  const wallet = walletRepo.findById(walletId);
  if (!wallet || wallet.user_id !== userId) {
    throw new UserFacingError('That wallet does not belong to you.');
  }
  log.warn({ userId, wallet: wallet.public_key }, 'private key exported');
  return exportPrivateKey(wallet.encrypted_key);
};

export interface WalletOverview {
  wallet: Wallet;
  solBalance: number;
}

export const overview = async (userId: number): Promise<WalletOverview[]> => {
  const wallets = walletRepo.listByUser(userId);
  return Promise.all(
    wallets.map(async (wallet) => ({
      wallet,
      solBalance: await getSolBalance(wallet.public_key).catch(() => 0),
    })),
  );
};
