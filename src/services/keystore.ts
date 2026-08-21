import crypto from 'node:crypto';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { env } from '../config/env';
import { UserFacingError } from '../lib/errors';

/**
 * Wallet secrets never touch disk in the clear. Each key is sealed with
 * AES-256-GCM under WALLET_ENCRYPTION_KEY and stored as
 *
 *   v1.<iv-b64>.<tag-b64>.<ciphertext-b64>
 *
 * The version prefix is there so a future scheme (KMS, per-user keys) can be
 * introduced without a migration that has to guess the format.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const VERSION = 'v1';

export const encryptSecretKey = (secretKey: Uint8Array): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, env.wallet.encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(secretKey)), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(
    '.',
  );
};

export const decryptSecretKey = (payload: string): Uint8Array => {
  const [version, ivB64, tagB64, dataB64] = payload.split('.');

  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed keystore payload');
  }

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      env.wallet.encryptionKey,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return new Uint8Array(
      Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]),
    );
  } catch {
    // A GCM tag mismatch means either tampering or a rotated encryption key.
    throw new Error('Unable to decrypt wallet key: wrong WALLET_ENCRYPTION_KEY or corrupt record');
  }
};

export const generateKeypair = (): Keypair => Keypair.generate();

/** Accepts the two formats wallets actually export: base58 and a JSON array. */
export const keypairFromPrivateKey = (input: string): Keypair => {
  const trimmed = input.trim();

  try {
    if (trimmed.startsWith('[')) {
      const bytes = Uint8Array.from(JSON.parse(trimmed) as number[]);
      return Keypair.fromSecretKey(bytes);
    }
    return Keypair.fromSecretKey(bs58.decode(trimmed));
  } catch {
    throw new UserFacingError(
      'That does not look like a Solana private key.',
      'Paste the base58 string from Phantom, or the 64-number JSON array from solana-keygen.',
    );
  }
};

export const keypairFromEncrypted = (payload: string): Keypair =>
  Keypair.fromSecretKey(decryptSecretKey(payload));

export const exportPrivateKey = (payload: string): string =>
  bs58.encode(decryptSecretKey(payload));
