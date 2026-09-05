-- Recovery requests never grant account access. They record a new-phone OTP
-- proof for an audited human review, while avoiding public account enumeration.
CREATE TABLE IF NOT EXISTS blumi_account_recovery_requests (
  request_id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES blumi_accounts(account_id) ON DELETE SET NULL,
  new_phone_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'manual_review_required', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by_operator_id TEXT,
  resolved_by_token_id TEXT,
  CHECK ((status = 'pending' AND resolved_at IS NULL) OR (status <> 'pending' AND resolved_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS blumi_account_recovery_requests_status_created_idx
  ON blumi_account_recovery_requests(status, created_at DESC);
