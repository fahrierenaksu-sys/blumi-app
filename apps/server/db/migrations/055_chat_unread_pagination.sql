CREATE INDEX IF NOT EXISTS blumi_chat_threads_stable_page_idx
  ON blumi_chat_threads(created_at DESC, thread_id DESC);
CREATE INDEX IF NOT EXISTS blumi_chat_participants_user_thread_idx
  ON blumi_chat_thread_participants(user_id, thread_id);
