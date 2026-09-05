-- Account-owned push preferences are evaluated before the durable delivery
-- outbox. Defaults preserve the existing opt-in behavior for existing users.
CREATE TABLE IF NOT EXISTS blumi_notification_preferences (
  user_id TEXT PRIMARY KEY,
  likes_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  messages_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  matches_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  discovery_watch_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start SMALLINT,
  quiet_hours_end SMALLINT,
  quiet_hours_utc_offset_minutes SMALLINT NOT NULL DEFAULT 0,
  max_pushes_per_hour SMALLINT NOT NULL DEFAULT 6,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
    OR (
      quiet_hours_start BETWEEN 0 AND 1439
      AND quiet_hours_end BETWEEN 0 AND 1439
      AND quiet_hours_start <> quiet_hours_end
    )
  ),
  CHECK (quiet_hours_utc_offset_minutes BETWEEN -840 AND 840),
  CHECK (max_pushes_per_hour BETWEEN 1 AND 20)
);

-- A successful enqueue claims an opaque event key permanently. Notification
-- producers use stable event ids (message, match, profile) so retries and
-- duplicate domain events cannot create duplicate pushes.
CREATE TABLE IF NOT EXISTS blumi_notification_policy_events (
  event_id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL CHECK (
    notification_type IN ('like', 'message', 'match', 'discovery_watch')
  ),
  dedupe_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS blumi_notification_policy_events_frequency_idx
  ON blumi_notification_policy_events (user_id, created_at DESC);

-- Suppressed events are audited too, without putting a delivery in the outbox.
CREATE TABLE IF NOT EXISTS blumi_notification_policy_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL CHECK (
    notification_type IN ('like', 'message', 'match', 'discovery_watch')
  ),
  reason TEXT NOT NULL CHECK (
    reason IN ('queued', 'disabled', 'quiet_hours', 'frequency_cap', 'duplicate')
  ),
  dedupe_key TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blumi_notification_policy_audit_account_idx
  ON blumi_notification_policy_audit (user_id, audit_id);
