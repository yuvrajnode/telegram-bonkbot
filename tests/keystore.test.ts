import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  decryptSecretKey,
  encryptSecretKey,
  exportPrivateKey,
  keypairFromPrivateKey,
} from '../src/services/keystore';

describe('keystore', () => {
  it('round-trips a secret key', () => {
    const keypair = Keypair.generate();
    const sealed = encryptSecretKey(keypair.secretKey);

    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain(bs58.encode(keypair.secretKey));
    expect(decryptSecretKey(sealed)).toEqual(keypair.secretKey);
  });

  it('uses a fresh IV so the same key never seals to the same blob', () => {
    const keypair = Keypair.generate();
    expect(encryptSecretKey(keypair.secretKey)).not.toBe(encryptSecretKey(keypair.secretKey));
  });

  it('refuses a tampered payload', () => {
    const sealed = encryptSecretKey(Keypair.generate().secretKey);
    const [version, iv, tag, data] = sealed.split('.');
    const flipped = `${data!.slice(0, -2)}${data!.slice(-2) === 'AA' ? 'BB' : 'AA'}`;

    expect(() => decryptSecretKey([version, iv, tag, flipped].join('.'))).toThrow(
      /Unable to decrypt/,
    );
  });

  it('rejects a malformed payload before touching the cipher', () => {
    expect(() => decryptSecretKey('not-a-keystore')).toThrow(/Malformed/);
  });

  it('imports both base58 and JSON array private keys', () => {
    const keypair = Keypair.generate();

    const fromBase58 = keypairFromPrivateKey(bs58.encode(keypair.secretKey));
    const fromJson = keypairFromPrivateKey(JSON.stringify(Array.from(keypair.secretKey)));

    expect(fromBase58.publicKey.toBase58()).toBe(keypair.publicKey.toBase58());
    expect(fromJson.publicKey.toBase58()).toBe(keypair.publicKey.toBase58());
  });

  it('gives a readable error for junk input', () => {
    expect(() => keypairFromPrivateKey('hunter2')).toThrow(/does not look like a Solana private key/);
  });

  it('exports back to the base58 form wallets expect', () => {
    const keypair = Keypair.generate();
    const sealed = encryptSecretKey(keypair.secretKey);
    expect(exportPrivateKey(sealed)).toBe(bs58.encode(keypair.secretKey));
  });
});
