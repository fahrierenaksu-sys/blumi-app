-- Forward-only and additive. Old binaries ignore the new account/report fields.
ALTER TABLE blumi_safety_reports
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS blumi_safety_reports_actor_idempotency_key_uq
  ON blumi_safety_reports (actor_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE blumi_accounts
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'warned', 'suspended', 'banned')),
  ADD COLUMN IF NOT EXISTS moderation_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS blumi_accounts_moderation_status_idx
  ON blumi_accounts (moderation_status)
  WHERE moderation_status <> 'active';
