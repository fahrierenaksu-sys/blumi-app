-- Recovery verification is public and must never replace, rate-limit, or
-- consume a sign-in OTP for the same phone number.
CREATE TABLE IF NOT EXISTS blumi_recovery_phone_challenges (
  phone_number TEXT PRIMARY KEY,
  otp_id TEXT NOT NULL,
  code_digest CHAR(64) NOT NULL CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 5)
);

CREATE INDEX IF NOT EXISTS blumi_recovery_phone_challenges_expires_at_idx
  ON blumi_recovery_phone_challenges(expires_at);

CREATE TABLE IF NOT EXISTS blumi_recovery_otp_send_limits (
  phone_number TEXT PRIMARY KEY,
  active_request_id TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  last_requested_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1 AND request_count <= 5)
);

CREATE INDEX IF NOT EXISTS blumi_recovery_otp_send_limits_window_idx
  ON blumi_recovery_otp_send_limits(window_started_at);
