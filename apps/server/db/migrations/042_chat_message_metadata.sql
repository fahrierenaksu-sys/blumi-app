-- Forward-only expand step for message-level delivery/read/edit metadata.
-- All new columns are nullable, so legacy writers and rows remain valid.

ALTER TABLE blumi_chat_messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'blumi_chat_messages_delivered_at_order_check'
       AND conrelid = 'blumi_chat_messages'::regclass
  ) THEN
    ALTER TABLE blumi_chat_messages
      ADD CONSTRAINT blumi_chat_messages_delivered_at_order_check
      CHECK (delivered_at IS NULL OR delivered_at >= sent_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'blumi_chat_messages_read_at_order_check'
       AND conrelid = 'blumi_chat_messages'::regclass
  ) THEN
    ALTER TABLE blumi_chat_messages
      ADD CONSTRAINT blumi_chat_messages_read_at_order_check
      CHECK (
        read_at IS NULL
        OR read_at >= COALESCE(delivered_at, sent_at)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'blumi_chat_messages_edited_at_window_check'
       AND conrelid = 'blumi_chat_messages'::regclass
  ) THEN
    ALTER TABLE blumi_chat_messages
      ADD CONSTRAINT blumi_chat_messages_edited_at_window_check
      CHECK (
        edited_at IS NULL
        OR (
          edited_at >= sent_at
          AND edited_at < sent_at + INTERVAL '5 minutes'
        )
      );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS blumi_chat_message_edit_audit (
  message_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  editor_user_id TEXT NOT NULL,
  body_before TEXT NOT NULL CHECK (char_length(body_before) BETWEEN 1 AND 500),
  body_after TEXT NOT NULL CHECK (char_length(body_after) BETWEEN 1 AND 500),
  edited_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (message_id, revision)
);

CREATE INDEX IF NOT EXISTS blumi_chat_message_edit_audit_edited_at_idx
  ON blumi_chat_message_edit_audit (thread_id, message_id, edited_at ASC);

-- This audit is deliberately self-contained and has no cascading source-row
-- foreign key, so authorized audit evidence survives source message deletion.
-- The future edit transaction must lock the source message and insert the next
-- contiguous revision atomically; this expand migration does not enable writes.

-- Compatibility: old binaries ignore these nullable columns and keep writing
-- the original five-field message shape. New readers omit null metadata when
-- projecting legacy rows. The migration performs no backfill or destructive
-- rewrite.
-- Restore policy: keep the expanded schema if the feature is disabled. Roll
-- back the read/write capabilities; do not drop audit history or columns.
