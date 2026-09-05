CREATE INDEX IF NOT EXISTS blumi_account_recovery_status_cursor_idx
  ON blumi_account_recovery_requests (status, created_at DESC, request_id DESC);
CREATE INDEX IF NOT EXISTS blumi_account_recovery_cursor_idx
  ON blumi_account_recovery_requests (created_at DESC, request_id DESC);
