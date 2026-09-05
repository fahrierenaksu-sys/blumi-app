CREATE TABLE IF NOT EXISTS blumi_accounts (
  account_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  age INTEGER CHECK (age IS NULL OR (age >= 18 AND age <= 99)),
  avatar_preset_id TEXT NOT NULL DEFAULT 'dusk',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS blumi_pending_otps (
  phone_number TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL,
  send_count INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS blumi_sessions (
  session_token_hash TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES blumi_accounts(account_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS blumi_sessions_account_id_idx
  ON blumi_sessions(account_id);

CREATE INDEX IF NOT EXISTS blumi_sessions_expires_at_idx
  ON blumi_sessions(expires_at);

CREATE INDEX IF NOT EXISTS blumi_pending_otps_expires_at_idx
  ON blumi_pending_otps(expires_at);
