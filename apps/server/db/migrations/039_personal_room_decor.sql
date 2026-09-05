-- Account-owned Room layouts are server authoritative. The revision supports
-- optimistic concurrency across devices; the JSON payload is validated by the
-- application before every write.
CREATE TABLE IF NOT EXISTS blumi_personal_room_decor (
  user_id TEXT PRIMARY KEY
    REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  decor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS blumi_personal_room_decor_updated_idx
  ON blumi_personal_room_decor(updated_at DESC);
