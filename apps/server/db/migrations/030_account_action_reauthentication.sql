-- Purpose-isolated reauthentication for account data export and phone changes.
-- Grants are short-lived, HMAC-digested, one-time, and never interchangeable
-- with login or account-deletion OTPs.
CREATE TABLE IF NOT EXISTS blumi_account_action_challenges (
  account_id TEXT NOT NULL REFERENCES blumi_accounts(account_id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('account_data_export', 'phone_change_current', 'phone_change_new')),
  target_phone_number TEXT NOT NULL,
  otp_id TEXT NOT NULL,
  code_digest CHAR(64) NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 5),
  PRIMARY KEY (account_id, purpose)
);

CREATE INDEX IF NOT EXISTS blumi_account_action_challenges_expires_at_idx
  ON blumi_account_action_challenges(expires_at);

CREATE TABLE IF NOT EXISTS blumi_account_action_otp_send_limits (
  account_id TEXT NOT NULL REFERENCES blumi_accounts(account_id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('account_data_export', 'phone_change_current', 'phone_change_new')),
  active_request_id TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  last_requested_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1 AND request_count <= 5),
  PRIMARY KEY (account_id, purpose)
);

CREATE INDEX IF NOT EXISTS blumi_account_action_otp_send_limits_window_idx
  ON blumi_account_action_otp_send_limits(window_started_at);

CREATE TABLE IF NOT EXISTS blumi_account_action_confirmations (
  account_id TEXT NOT NULL REFERENCES blumi_accounts(account_id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('account_data_export', 'phone_change_current', 'phone_change_new')),
  target_phone_number TEXT NOT NULL,
  token_digest CHAR(64) NOT NULL CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, purpose)
);

CREATE INDEX IF NOT EXISTS blumi_account_action_confirmations_expires_at_idx
  ON blumi_account_action_confirmations(expires_at);
