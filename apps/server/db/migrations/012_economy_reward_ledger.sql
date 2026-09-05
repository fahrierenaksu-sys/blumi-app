CREATE TABLE IF NOT EXISTS blumi_economy_reward_ledger (
  user_id TEXT NOT NULL,
  reward_type TEXT NOT NULL CHECK (
    reward_type IN ('daily_login', 'room_complete', 'mutual_match')
  ),
  idempotency_key TEXT NOT NULL,
  coins INTEGER NOT NULL CHECK (coins > 0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, reward_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS blumi_economy_reward_ledger_created_at_idx
  ON blumi_economy_reward_ledger(created_at DESC);
