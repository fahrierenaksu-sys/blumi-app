-- Additive and backward compatible (2026-10-01). Written for owner review:
-- apply only after a restore-tested backup (docs/release/MIGRATION_070_RUNBOOK.md).
-- The binary that uses these objects also runs before this migration: /ready
-- treats this file as optional, and the server probes the migration ledger
-- and keeps delivery and read receipts off until the row exists. The
-- previous binary never reads these objects.
--
-- Per-participant receipt cursors in the server's message order
-- (sent_at, message_id). NULL means nothing was acknowledged yet; there is
-- no backfill. last_read_at keeps its meaning (the unread cursor);
-- last_read_message_id narrows it to a message when the client names one.
ALTER TABLE blumi_chat_thread_participants
  ADD COLUMN IF NOT EXISTS last_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_delivered_message_id TEXT,
  ADD COLUMN IF NOT EXISTS last_read_message_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'blumi_chat_participants_delivered_cursor_check'
       AND conrelid = 'blumi_chat_thread_participants'::regclass
  ) THEN
    ALTER TABLE blumi_chat_thread_participants
      ADD CONSTRAINT blumi_chat_participants_delivered_cursor_check
      CHECK ((last_delivered_at IS NULL) = (last_delivered_message_id IS NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'blumi_chat_participants_read_cursor_check'
       AND conrelid = 'blumi_chat_thread_participants'::regclass
  ) THEN
    ALTER TABLE blumi_chat_thread_participants
      ADD CONSTRAINT blumi_chat_participants_read_cursor_check
      CHECK (last_read_message_id IS NULL OR last_read_at IS NOT NULL);
  END IF;
END
$$;

-- Per-account chat privacy. A missing row means the default: read receipts
-- off. Read receipts are mutual: a person sees the partner's read state only
-- while both turned them on. Deleting the account removes the row.
CREATE TABLE IF NOT EXISTS blumi_chat_privacy_preferences (
  user_id TEXT PRIMARY KEY REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  read_receipts_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE blumi_chat_privacy_preferences ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE blumi_chat_privacy_preferences
  FROM PUBLIC, anon, authenticated;
