CREATE TABLE IF NOT EXISTS blumi_chat_threads (
  thread_id TEXT PRIMARY KEY,
  mini_room_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_message_id TEXT
);

CREATE TABLE IF NOT EXISTS blumi_chat_thread_participants (
  thread_id TEXT NOT NULL REFERENCES blumi_chat_threads(thread_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  display_name TEXT,
  participant_order INTEGER NOT NULL,
  PRIMARY KEY (thread_id, user_id),
  UNIQUE (thread_id, participant_order)
);

CREATE INDEX IF NOT EXISTS blumi_chat_thread_participants_user_idx
  ON blumi_chat_thread_participants(user_id);

CREATE TABLE IF NOT EXISTS blumi_chat_messages (
  message_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES blumi_chat_threads(thread_id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS blumi_chat_messages_thread_sent_at_idx
  ON blumi_chat_messages(thread_id, sent_at ASC);

CREATE INDEX IF NOT EXISTS blumi_chat_threads_last_message_idx
  ON blumi_chat_threads(last_message_id);
