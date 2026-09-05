-- Durable mutual-match chat room invites. This is additive: legacy lobby
-- invites retain their room/spot columns and old binaries ignore the new data.
ALTER TABLE blumi_mini_room_invites
  ADD COLUMN IF NOT EXISTS source_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE blumi_mini_room_invites
  ALTER COLUMN room_id DROP NOT NULL,
  ALTER COLUMN sender_spot_id DROP NOT NULL;

ALTER TABLE blumi_mini_room_invites
  DROP CONSTRAINT IF EXISTS blumi_mini_room_invites_status_check;

ALTER TABLE blumi_mini_room_invites
  ADD CONSTRAINT blumi_mini_room_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled'));

CREATE INDEX IF NOT EXISTS blumi_mini_room_invites_thread_idx
  ON blumi_mini_room_invites(source_thread_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS blumi_mini_room_invites_one_pending_thread_uidx
  ON blumi_mini_room_invites(source_thread_id)
  WHERE source_thread_id IS NOT NULL AND status = 'pending';

ALTER TABLE blumi_mini_rooms
  ADD COLUMN IF NOT EXISTS source_thread_id TEXT;

CREATE INDEX IF NOT EXISTS blumi_mini_rooms_source_thread_idx
  ON blumi_mini_rooms(source_thread_id)
  WHERE source_thread_id IS NOT NULL;
