CREATE TABLE IF NOT EXISTS blumi_mini_room_invites (
  invite_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  sender_spot_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS blumi_mini_room_invites_recipient_idx
  ON blumi_mini_room_invites(recipient_user_id, status);

CREATE INDEX IF NOT EXISTS blumi_mini_room_invites_sender_idx
  ON blumi_mini_room_invites(sender_user_id, status);

CREATE TABLE IF NOT EXISTS blumi_mini_rooms (
  mini_room_id TEXT PRIMARY KEY,
  lobby_room_id TEXT NOT NULL,
  participant_a_user_id TEXT NOT NULL,
  participant_b_user_id TEXT NOT NULL,
  livekit_room_name TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  ended_by_user_id TEXT
);

CREATE INDEX IF NOT EXISTS blumi_mini_rooms_participant_a_idx
  ON blumi_mini_rooms(participant_a_user_id, ended_at);

CREATE INDEX IF NOT EXISTS blumi_mini_rooms_participant_b_idx
  ON blumi_mini_rooms(participant_b_user_id, ended_at);
