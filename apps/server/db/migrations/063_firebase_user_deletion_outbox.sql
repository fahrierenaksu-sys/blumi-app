-- Preserve external Firebase deletion work after the Blumi account row is gone.
ALTER TABLE blumi_account_deletion_confirmations
  ADD COLUMN IF NOT EXISTS firebase_uid TEXT;

CREATE TABLE IF NOT EXISTS blumi_firebase_user_deletion_outbox (
  firebase_uid TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS blumi_firebase_user_deletion_outbox_due_idx
  ON blumi_firebase_user_deletion_outbox(next_attempt_at);

ALTER TABLE blumi_firebase_user_deletion_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE blumi_firebase_user_deletion_outbox FROM anon, authenticated;
