-- Purpose-specific account-deletion reauthentication. Login OTPs remain isolated
-- in blumi_pending_otps and cannot authorize deletion.
-- Release evidence: apply this additive migration before serving the new
-- /v1/account/deletion/* routes or shipping the mobile deletion flow.
-- Rollback: roll back application traffic first; leave these isolated tables in
-- place (no down migration) because older binaries neither read nor write them.
CREATE TABLE IF NOT EXISTS blumi_account_deletion_challenges (
  account_id TEXT PRIMARY KEY REFERENCES blumi_accounts(account_id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  otp_id TEXT NOT NULL,
  code_digest CHAR(64) NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 5)
);

CREATE INDEX IF NOT EXISTS blumi_account_deletion_challenges_expires_at_idx
  ON blumi_account_deletion_challenges(expires_at);

CREATE TABLE IF NOT EXISTS blumi_account_deletion_otp_send_limits (
  account_id TEXT PRIMARY KEY REFERENCES blumi_accounts(account_id) ON DELETE CASCADE,
  active_request_id TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  last_requested_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1 AND request_count <= 5)
);

CREATE INDEX IF NOT EXISTS blumi_account_deletion_otp_send_limits_window_idx
  ON blumi_account_deletion_otp_send_limits(window_started_at);

CREATE TABLE IF NOT EXISTS blumi_account_deletion_confirmations (
  account_id TEXT PRIMARY KEY REFERENCES blumi_accounts(account_id) ON DELETE CASCADE,
  token_digest CHAR(64) NOT NULL CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS blumi_account_deletion_confirmations_expires_at_idx
  ON blumi_account_deletion_confirmations(expires_at);
