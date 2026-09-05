CREATE TABLE IF NOT EXISTS blumi_room_layouts (
  room_id TEXT PRIMARY KEY,
  spots JSONB NOT NULL,
  proximity_radius NUMERIC NOT NULL DEFAULT 180,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blumi_room_presence (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_preset_id TEXT NOT NULL DEFAULT 'dusk',
  spot_id TEXT NOT NULL,
  in_mini_room BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS blumi_room_presence_user_idx
  ON blumi_room_presence(user_id);

CREATE INDEX IF NOT EXISTS blumi_room_presence_expires_at_idx
  ON blumi_room_presence(expires_at);
