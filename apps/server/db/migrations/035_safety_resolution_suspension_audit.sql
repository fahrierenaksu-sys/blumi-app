-- Preserve the exact moderation suspension window on the report audit record.
ALTER TABLE blumi_safety_reports
  ADD COLUMN IF NOT EXISTS resolution_suspended_until TIMESTAMPTZ;
