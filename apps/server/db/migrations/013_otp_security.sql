-- Pending OTPs live for only five minutes. Invalidate any in-flight plaintext
-- challenge during this security migration instead of preserving recoverable codes.
DELETE FROM blumi_pending_otps;

ALTER TABLE blumi_pending_otps
  DROP COLUMN code,
  DROP COLUMN sent_at,
  DROP COLUMN send_count,
  ADD COLUMN otp_id TEXT NOT NULL,
  ADD COLUMN code_digest CHAR(64) NOT NULL,
  ADD CONSTRAINT blumi_pending_otps_digest_format
    CHECK (code_digest ~ '^[0-9a-f]{64}$');

CREATE TABLE IF NOT EXISTS blumi_otp_send_limits (
  phone_number TEXT PRIMARY KEY,
  active_request_id TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  last_requested_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 1 AND request_count <= 5)
);

CREATE INDEX IF NOT EXISTS blumi_otp_send_limits_window_idx
  ON blumi_otp_send_limits(window_started_at);
