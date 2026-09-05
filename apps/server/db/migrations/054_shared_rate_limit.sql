CREATE TABLE IF NOT EXISTS blumi_shared_rate_budgets (
  budget_key CHAR(64) PRIMARY KEY,
  window_started_ms BIGINT NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0)
);
CREATE INDEX IF NOT EXISTS blumi_shared_rate_budgets_expiry_idx
  ON blumi_shared_rate_budgets(window_started_ms);
