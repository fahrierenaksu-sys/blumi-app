-- Additive and backward compatible (2026-10-17). One new table for the room
-- pet (P1); no existing object changes.
--
-- The server alone records which pet a member has (a species from a fixed
-- server-side list), its name and its minimal room state. P1 allows one pet
-- per member (UNIQUE user_id). The row lives as long as the account, like
-- inventory: it is owned state, so there is no time-based purge, and it is
-- erased with the account through the foreign key.
--
-- Number 078 because 077 belongs to the traveling cat (cat trips).
--
-- /ready treats this file as optional: the server probes the ledger and the
-- pet routes answer 409 ROOM_PET_UNAVAILABLE until this row exists with the
-- packaged checksum. Older binaries never touch this table.
CREATE TABLE IF NOT EXISTS blumi_room_pets (
  pet_id TEXT PRIMARY KEY CHECK (char_length(pet_id) BETWEEN 1 AND 80),
  user_id TEXT NOT NULL UNIQUE REFERENCES blumi_accounts (user_id) ON DELETE CASCADE,
  species_item_id TEXT NOT NULL CHECK (species_item_id ~ '^pet_[a-z0-9_]{1,60}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 16),
  name_status TEXT NOT NULL DEFAULT 'active' CHECK (name_status IN ('active', 'reset')),
  room_state TEXT NOT NULL DEFAULT 'home' CHECK (room_state IN ('home', 'hidden')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE blumi_room_pets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE blumi_room_pets FROM PUBLIC, anon, authenticated;
