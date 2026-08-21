-- Core identity: one row per Telegram account.
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id       INTEGER NOT NULL UNIQUE,
  username          TEXT,
  first_name        TEXT,
  referred_by       INTEGER REFERENCES users(id),
  referral_code     TEXT NOT NULL UNIQUE,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Secret keys are stored as AES-256-GCM blobs; see src/services/keystore.ts.
CREATE TABLE IF NOT EXISTS wallets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label             TEXT NOT NULL DEFAULT 'Main',
  public_key        TEXT NOT NULL UNIQUE,
  encrypted_key     TEXT NOT NULL,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

CREATE TABLE IF NOT EXISTS settings (
  user_id                 INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slippage_bps            INTEGER NOT NULL DEFAULT 150,
  priority_fee_lamports   INTEGER NOT NULL DEFAULT 200000,
  buy_presets_sol         TEXT NOT NULL DEFAULT '[0.1,0.25,0.5,1]',
  sell_presets_pct        TEXT NOT NULL DEFAULT '[25,50,75,100]',
  confirm_before_trade    INTEGER NOT NULL DEFAULT 1,
  mev_protection          INTEGER NOT NULL DEFAULT 0,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Token metadata cache. Saves an RPC round trip on every quote.
CREATE TABLE IF NOT EXISTS tokens (
  mint              TEXT PRIMARY KEY,
  symbol            TEXT NOT NULL,
  name              TEXT NOT NULL,
  decimals          INTEGER NOT NULL,
  logo_uri          TEXT,
  refreshed_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trades (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id         INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  side              TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  mint              TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  in_amount         TEXT NOT NULL,   -- base units, kept as TEXT to dodge JS float loss
  out_amount        TEXT NOT NULL,
  sol_amount        REAL NOT NULL,
  token_amount      REAL NOT NULL,
  price_sol         REAL NOT NULL,
  price_usd         REAL,
  slippage_bps      INTEGER NOT NULL,
  signature         TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'failed')),
  error             TEXT,
  source            TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'limit_order', 'stop_loss', 'take_profit')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trades_user_created ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_mint ON trades(user_id, mint);

-- Aggregated per (wallet, mint) book kept in sync by the position service.
CREATE TABLE IF NOT EXISTS positions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id         INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  mint              TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  decimals          INTEGER NOT NULL,
  token_amount      REAL NOT NULL DEFAULT 0,
  cost_basis_sol    REAL NOT NULL DEFAULT 0,
  realized_pnl_sol  REAL NOT NULL DEFAULT 0,
  opened_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (wallet_id, mint)
);
CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_id);

CREATE TABLE IF NOT EXISTS orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id         INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  mint              TEXT NOT NULL,
  symbol            TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('limit_buy', 'limit_sell', 'stop_loss', 'take_profit')),
  trigger_price_sol REAL NOT NULL,
  amount_sol        REAL,             -- for buys
  amount_pct        REAL,             -- for sells, percent of holdings
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'filled', 'cancelled', 'expired', 'failed')),
  trade_id          INTEGER REFERENCES trades(id),
  expires_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_open ON orders(status, mint);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, status);
