-- Retry-safe client delivery. One sender can acknowledge a client-authored
-- message ID once per thread; existing messages and old clients remain valid.
ALTER TABLE blumi_chat_messages
  ADD COLUMN IF NOT EXISTS client_message_id TEXT;

ALTER TABLE blumi_chat_messages
  ADD CONSTRAINT blumi_chat_messages_client_message_id_valid
  CHECK (
    client_message_id IS NULL
    OR client_message_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS blumi_chat_messages_sender_client_message_uq
  ON blumi_chat_messages (thread_id, sender_user_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
