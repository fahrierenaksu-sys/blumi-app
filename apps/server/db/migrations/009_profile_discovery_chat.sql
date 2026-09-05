ALTER TABLE blumi_accounts
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS interests TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS location_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS location_lng NUMERIC;

ALTER TABLE blumi_chat_thread_participants
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS blumi_accounts_discoverable_idx
  ON blumi_accounts(user_id)
  WHERE display_name <> '' AND age IS NOT NULL;
