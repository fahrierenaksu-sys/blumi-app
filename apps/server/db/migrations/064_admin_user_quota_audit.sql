CREATE TABLE IF NOT EXISTS blumi_admin_user_audit (
  audit_id UUID PRIMARY KEY,
  sequence_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  target_user_id TEXT NOT NULL REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('quota_reset', 'quota_grant')),
  amount INTEGER,
  CHECK (
    (action = 'quota_reset' AND amount IS NULL)
    OR (action = 'quota_grant' AND amount BETWEEN 1 AND 50)
  ),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
  operator_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  previous_quota JSONB NOT NULL,
  current_quota JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS blumi_admin_user_audit_target_sequence_idx
  ON blumi_admin_user_audit (target_user_id, sequence_id DESC);

ALTER TABLE blumi_admin_user_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE blumi_admin_user_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE blumi_admin_user_audit_sequence_id_seq FROM PUBLIC, anon, authenticated;
