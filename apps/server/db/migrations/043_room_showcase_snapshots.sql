CREATE TABLE IF NOT EXISTS blumi_room_showcase_snapshots (
  user_id TEXT PRIMARY KEY REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  room_revision INTEGER NOT NULL CHECK (room_revision > 0),
  asset_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/webp'),
  renderer_version TEXT NOT NULL,
  body BYTEA NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  headline TEXT NULL CHECK (char_length(headline) <= 30),
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blumi_room_showcase_snapshots_public_idx
  ON blumi_room_showcase_snapshots (is_public, updated_at DESC);
