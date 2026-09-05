ALTER TABLE blumi_safety_reports
  ADD COLUMN IF NOT EXISTS resolved_by_admin_id TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by_token_id TEXT;
