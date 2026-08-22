-- Wallets a user mirrors. One row per (user, target) pair; the size is fixed
-- per follow rather than proportional, because copying a whale proportionally
-- is a good way to spend a balance you do not have.
CREATE TABLE IF NOT EXISTS copy_targets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id         INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  target_address    TEXT NOT NULL,
  label             TEXT,
  size_sol          REAL NOT NULL,
  mirror_sells      INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'paused')),
  -- Where the scanner got to. NULL means "start from now", never "replay
  -- everything this wallet has ever done".
  last_signature    TEXT,
  copied_count      INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, target_address)
);
CREATE INDEX IF NOT EXISTS idx_copy_targets_active ON copy_targets(status);

-- Every mirrored action, so a signature is never copied twice even if the
-- scanner sees it again after a restart.
CREATE TABLE IF NOT EXISTS copy_fills (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id         INTEGER NOT NULL REFERENCES copy_targets(id) ON DELETE CASCADE,
  source_signature  TEXT NOT NULL,
  side              TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  mint              TEXT NOT NULL,
  trade_id          INTEGER REFERENCES trades(id),
  skipped_reason    TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (target_id, source_signature, mint)
);
