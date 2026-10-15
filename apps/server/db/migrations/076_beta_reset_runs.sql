-- Additive (2026-10-15, audit F2). One new table, no change to any existing
-- object. The owner-approved beta reset (apps/server/scripts/betaReset.ts) is
-- meant to run once per database. Each applied reset records one row here in
-- the same transaction as the reset itself, so a row exists exactly when a
-- reset committed. The script refuses a second apply while a row exists unless
-- the operator types a reason (--repeat-reason), which is recorded too.
--
-- No personal data: the commit the reset ran from, the dry-run plan hash, the
-- time, and the operator's typed reason (the script refuses phone-like digit
-- runs in it). The app never reads or writes this table, so any binary works
-- with or without it; /ready treats this file as optional. Without it the
-- reset script refuses every apply (dry runs still work).
CREATE TABLE IF NOT EXISTS blumi_beta_reset_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_commit TEXT NOT NULL CHECK (source_commit ~ '^[0-9a-f]{12,40}$'),
  plan_hash TEXT NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
  repeat_reason TEXT CHECK (repeat_reason IS NULL OR char_length(repeat_reason) BETWEEN 12 AND 200)
);

ALTER TABLE blumi_beta_reset_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE blumi_beta_reset_runs FROM PUBLIC, anon, authenticated;
