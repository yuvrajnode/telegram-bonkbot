# Architecture

## Processes

`src/main.ts` starts three things in one process:

1. **The Telegram bot** (`src/bot`) — long polling via Telegraf.
2. **The watchers** (`src/services/watcher.ts`) — a 10 second interval that
   prices every open order and fills the ones that have triggered, and a 20
   second interval that scans followed wallets and mirrors their swaps. The
   copy scan is slower on purpose: it parses transactions, and a followed
   wallet is not trading every ten seconds.
3. **The dashboard API** (`src/api`) — Express, read-only.

They share nothing in memory. All coordination happens through SQLite, which
is what lets the watcher act for a user who is not currently in a
conversation, and lets a single-file backup capture the whole system state.

Splitting them into separate processes is a config change away — the watcher
and API both have their own entrypoints — but at this size one process is
simpler to operate and the SQLite writer stays single.

## Data flow of a buy

```
user taps "0.5 SOL"
  → screens.showToken already fetched token metadata + price
  → trading.previewBuy   quote from Jupiter, shown with impact and route
  → intent parked in memory, button carries an 8-char handle
  → user confirms
  → trading.buy
      ├─ assert SOL headroom (amount + fee reserve)
      ├─ insert trade row as `pending`
      ├─ FRESH quote  ← not the preview's
      ├─ build swap tx, sign with the decrypted keypair
      ├─ send, confirm, and check meta.err explicitly
      ├─ mark confirmed, write back the real out-amount
      └─ positions.applyBuy  (weighted average basis)
  → fill message + updated position screen
```

The trade row exists before the transaction is sent, so a crash mid-swap
leaves an auditable `pending` row rather than nothing.

## Why `confirmTransaction` is not trusted alone

It resolves on a landed signature. A swap that reverted on-chain still lands.
`sendAndConfirm` in `src/services/solana.ts` checks `result.value.err` and
raises `TransactionFailedError` with the signature attached, so a reverted
swap is never booked as a fill.

## Detecting someone else's trade

Copy trading never decodes instructions. Every AMM, aggregator and launchpad
encodes a swap differently and new ones ship weekly, so instruction parsing is
a permanent maintenance tax that fails silently on anything new.

Instead `copytrade.detectSwap` reads the transaction's balance deltas for the
followed wallet only: a token balance going up while SOL goes down is a buy,
the reverse is a sell, and the largest leg wins when a route touches several
mints. That gets three things for free — a plain token transfer moves no SOL
and is ignored, a wSOL wrap leg is skipped, and the pool's and counterparty's
balances in the same transaction belong to other owners and never match.

Each mirrored signature is claimed in `copy_fills` (unique on target,
signature and mint) *before* the swap is placed, so a restart mid-sweep cannot
buy the same trade twice.

## Submission paths

A swap leaves the process one of two ways:

- **Public RPC.** `sendAndConfirm`, retried up to three times with the fee
  doubling per attempt. The fee is baked into the transaction, so each attempt
  re-quotes and rebuilds — there is no way to bump the priority of something
  already signed.
- **Jito bundle.** Used when the user enables MEV protection. The transaction
  carries a tip instead of a priority fee (paying both just burns SOL twice)
  and goes straight to a block builder, so it is never gossiped where a
  sandwich bot could see it. Bundles are all-or-nothing with no queue: if it is
  not picked up in a few slots it never will be, so the wait is short and a
  miss escalates the tip rather than hanging.

## Storage

SQLite in WAL mode. WAL matters here: the watcher writes while the bot reads,
and without it a fill would block a menu render.

Schema notes:

- `trades.in_amount` / `out_amount` are `TEXT`. They hold u64 base units,
  which a JS `number` cannot represent past 2^53.
- `positions` is unique on `(wallet_id, mint)` — the ledger is per wallet, not
  per user, because switching wallets should not merge two books.
- `notifications` is an outbox. The watcher writes; the bot drains it every
  three seconds and marks rows delivered. A failed send is retried on the next
  pass; a user who blocked the bot is marked delivered so the queue drains.

Migrations are plain `.sql` files applied in filename order and recorded in
`schema_migrations`. No ORM, no migration DSL.

## Error handling

`UserFacingError` carries a message written for a human plus an optional hint.
The bot's error boundary shows those verbatim and replaces everything else
with a generic line, so an RPC stack trace can never reach a chat. Subclasses
(`InsufficientBalanceError`, `RouteNotFoundError`, `TransactionFailedError`)
exist so call sites do not build strings.

## Rate limits and caching

- Prices are cached in-process for 5 seconds. A watcher tick, a position
  render and a quote all want the same mints inside that window.
- Token metadata is cached in SQLite for 24 hours; symbols and decimals do not
  change.
- `fetchJson` retries 429s and 5xxs twice with exponential backoff. Public
  Solana infrastructure throttles hard, and one retry is often the difference
  between a fill and a stale quote.

## What is deliberately absent

- No launch sniping. Being first into a new pool is a latency game that a
  polling architecture cannot win, and pretending otherwise would be worse
  than not shipping it.
- No Redis, no queue broker. The scale this targets does not need one, and
  every added moving part is another thing to lose keys behind.
- No ORM. Seven tables and hand-written SQL is less code than the schema DSL
  would be.
- No write endpoints on the API. Signing lives behind Telegram auth, and the
  dashboard being read-only means it can be deployed publicly without becoming
  an attack surface on user funds.
