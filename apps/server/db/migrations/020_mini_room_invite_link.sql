ALTER TABLE blumi_mini_rooms
  ADD COLUMN IF NOT EXISTS invite_id TEXT
    REFERENCES blumi_mini_room_invites(invite_id);

CREATE UNIQUE INDEX IF NOT EXISTS blumi_mini_rooms_invite_uidx
  ON blumi_mini_rooms(invite_id)
  WHERE invite_id IS NOT NULL;
