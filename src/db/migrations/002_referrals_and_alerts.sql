CREATE TABLE IF NOT EXISTS referral_earnings (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id          INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  amount_sol        REAL NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer
  ON referral_earnings(referrer_id, created_at DESC);

-- Outbound notification queue. The bot drains it so price watchers never
-- have to hold a Telegram context.
CREATE TABLE IF NOT EXISTS notifications (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL,
  payload           TEXT NOT NULL,
  delivered_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_pending
  ON notifications(delivered_at, created_at);
