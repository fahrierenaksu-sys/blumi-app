-- Forward-only: existing push-device registrations remain untouched.  Outbox
-- rows are independently durable and can be retried by any server instance.
CREATE TABLE IF NOT EXISTS blumi_push_delivery_outbox (
  delivery_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  push_token TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL,
  lease_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blumi_push_delivery_outbox_due_idx
  ON blumi_push_delivery_outbox (available_at, created_at);

CREATE TABLE IF NOT EXISTS blumi_push_delivery_audit (
  audit_id BIGSERIAL PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('sent', 'retry_scheduled', 'failed_permanently')),
  error_code TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blumi_push_delivery_audit_delivery_idx
  ON blumi_push_delivery_audit (delivery_id, audit_id);

-- The ticket contains only an opaque digest on the wire. Expired rows are
-- harmless and are deleted opportunistically by normal consume operations.
CREATE TABLE IF NOT EXISTS blumi_realtime_tickets (
  ticket_digest TEXT PRIMARY KEY,
  session_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS blumi_realtime_tickets_expires_idx
  ON blumi_realtime_tickets (expires_at);
