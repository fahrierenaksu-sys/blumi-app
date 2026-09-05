CREATE TABLE IF NOT EXISTS blumi_safety_blocks (
  actor_user_id TEXT NOT NULL,
  blocked_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (actor_user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS blumi_safety_blocks_actor_created_at_idx
  ON blumi_safety_blocks(actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS blumi_safety_reports (
  report_id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  reported_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS blumi_safety_reports_actor_created_at_idx
  ON blumi_safety_reports(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS blumi_safety_reports_reported_user_idx
  ON blumi_safety_reports(reported_user_id);
