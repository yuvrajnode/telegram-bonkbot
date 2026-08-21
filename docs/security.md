# Security notes

This bot holds private keys. That is the whole design, and it is the risk.

## Key handling

- Secret keys are sealed with AES-256-GCM under `WALLET_ENCRYPTION_KEY` and
  stored as `v1.<iv>.<tag>.<ciphertext>`. Each seal uses a fresh 12-byte IV.
- Keys are decrypted only in `services/wallets.getKeypair`, immediately before
  signing, and are never logged — the logger redacts `secretKey`,
  `privateKey` and `mnemonic` at every depth.
- `WALLET_ENCRYPTION_KEY` is not recoverable. Rotating it without re-encrypting
  first makes every stored wallet permanently unreadable. Back it up separately
  from the database; either one alone is useless.
- An imported key arrives as a Telegram message. The bot reads it and deletes
  that message immediately, but it existed on Telegram's servers in the
  meantime — importing a wallet you also use elsewhere is a bad trade.
- Exports self-destruct after 60 seconds. That is a convenience, not a
  guarantee: the recipient can screenshot it, and Telegram may have it cached.

## Deployment

- Run the database on a volume you back up. Losing it loses every wallet.
- Do not expose the API publicly without a reverse proxy in front of it. It is
  read-only, but it will happily enumerate user portfolios for anyone who can
  reach it. Restrict `API_CORS_ORIGINS` and put it behind auth if it is not
  on a private network.
- Use a paid RPC endpoint. Beyond throughput, a throttled endpoint during a
  volatile minute is its own kind of loss.

## Known limitations

- **Single-key encryption.** Every wallet is sealed under one process-wide
  key. A compromised host means compromised funds. Per-user keys derived from
  a KMS would be the next step; the `v1.` prefix on the keystore payload is
  there so that migration does not have to guess formats.
- **No withdrawal limits or 2FA.** Anyone with access to a user's Telegram
  account can trade and export from their wallet.
- **MEV protection is a toggle without an implementation.** The setting is
  stored but no Jito bundle path is wired up yet. It does nothing today, and
  the UI should not imply otherwise.
- **Referral accounting is off-chain bookkeeping.** Earnings are recorded in a
  table; nothing pays them out automatically.

## Reporting

Found something? Open an issue with enough detail to reproduce. Please do not
post a working exploit against a live deployment.
