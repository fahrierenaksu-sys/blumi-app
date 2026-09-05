CREATE TABLE IF NOT EXISTS blumi_economy_inventories (
  user_id TEXT PRIMARY KEY,
  coins INTEGER NOT NULL CHECK (coins >= 0),
  owned_avatar_item_ids TEXT[] NOT NULL DEFAULT '{}',
  owned_room_item_ids TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS blumi_economy_inventories_updated_at_idx
  ON blumi_economy_inventories(updated_at DESC);
