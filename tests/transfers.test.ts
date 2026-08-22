import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';

vi.mock('../src/services/solana', async () => {
  const actual = await vi.importActual<typeof import('../src/services/solana')>(
    '../src/services/solana',
  );
  return {
    ...actual,
    getSolBalance: vi.fn(),
    getTokenBalance: vi.fn(),
    sendAndConfirm: vi.fn(async () => 'sig123'),
    withFailover: vi.fn(async () => ({ blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 })),
  };
});
vi.mock('../src/services/wallets', () => ({ getKeypair: vi.fn(() => Keypair.generate()) }));
vi.mock('../src/services/tokens', () => ({
  getTokenInfo: vi.fn(async () => ({
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
    logo_uri: null,
  })),
}));

import { getSolBalance } from '../src/services/solana';
import { parseAmount, sweepableSol, withdrawSol } from '../src/services/transfers';
import type { Wallet } from '../src/types';

const mockedBalance = vi.mocked(getSolBalance);

const wallet: Wallet = {
  id: 1,
  user_id: 1,
  label: 'Main',
  public_key: Keypair.generate().publicKey.toBase58(),
  encrypted_key: 'v1.a.b.c',
  is_active: 1,
  created_at: '2026-01-01 00:00:00',
};

const recipient = Keypair.generate().publicKey.toBase58();

beforeEach(() => vi.clearAllMocks());

describe('withdrawal guards', () => {
  it('refuses an address that is not valid base58', async () => {
    mockedBalance.mockResolvedValue(1);
    await expect(
      withdrawSol({ wallet, destination: 'not-an-address', amountSol: 0.1, priorityFeeLamports: 0 }),
    ).rejects.toThrow(/not a valid Solana address/);
  });

  it('refuses sending to the wallet itself', async () => {
    mockedBalance.mockResolvedValue(1);
    await expect(
      withdrawSol({ wallet, destination: wallet.public_key, amountSol: 0.1, priorityFeeLamports: 0 }),
    ).rejects.toThrow(/this wallet/i);
  });

  it('refuses an off-curve address, which would strand the funds', async () => {
    mockedBalance.mockResolvedValue(1);
    // A PDA has no private key; a transfer there is unrecoverable.
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow')],
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    );

    await expect(
      withdrawSol({
        wallet,
        destination: pda.toBase58(),
        amountSol: 0.1,
        priorityFeeLamports: 0,
      }),
    ).rejects.toThrow(/not a normal wallet/);
  });

  it('will not spend the fee reserve', async () => {
    mockedBalance.mockResolvedValue(0.005); // below the ~0.007 reserve
    await expect(
      withdrawSol({ wallet, destination: recipient, priorityFeeLamports: 0 }),
    ).rejects.toThrow(/nothing to withdraw/i);
  });

  it('rejects an amount that would eat into the reserve', async () => {
    mockedBalance.mockResolvedValue(1);
    await expect(
      withdrawSol({ wallet, destination: recipient, amountSol: 0.999, priorityFeeLamports: 0 }),
    ).rejects.toThrow(/Not enough SOL/);
  });

  it('sweeps everything above the reserve when no amount is given', async () => {
    mockedBalance.mockResolvedValue(2);
    const result = await withdrawSol({ wallet, destination: recipient, priorityFeeLamports: 1000 });

    expect(result.signature).toBe('sig123');
    expect(result.amount).toBeCloseTo(2 - 0.007, 6);
  });
});

describe('amount parsing', () => {
  it('treats "all" and "max" as the full sweepable balance', () => {
    expect(parseAmount('all', 1.5)).toBe(1.5);
    expect(parseAmount(' MAX ', 1.5)).toBe(1.5);
  });

  it('accepts a formatted number', () => {
    expect(parseAmount('1,250.5', 9999)).toBe(1250.5);
  });

  it('rejects zero, negatives and junk', () => {
    expect(() => parseAmount('0', 1)).toThrow();
    expect(() => parseAmount('-1', 1)).toThrow();
    expect(() => parseAmount('soon', 1)).toThrow();
  });
});

describe('sweepable balance', () => {
  it('never reports a negative amount', async () => {
    mockedBalance.mockResolvedValue(0.001);
    expect(await sweepableSol(wallet)).toBe(0);
  });
});
