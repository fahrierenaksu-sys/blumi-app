-- Render-independent durable handoff: message, preview and this job commit together.
ALTER TABLE blumi_chat_threads ADD COLUMN last_message_sent_at TIMESTAMPTZ;
UPDATE blumi_chat_threads AS thread SET last_message_sent_at = message.sent_at
  FROM blumi_chat_messages AS message WHERE message.message_id = thread.last_message_id;

CREATE TABLE blumi_chat_delivery_outbox (
  message_id TEXT PRIMARY KEY REFERENCES blumi_chat_messages(message_id) ON DELETE CASCADE,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  completed_at TIMESTAMPTZ
);
CREATE INDEX blumi_chat_delivery_due_idx ON blumi_chat_delivery_outbox(available_at, message_id)
  WHERE completed_at IS NULL;
