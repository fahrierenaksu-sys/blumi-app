-- Additive and backward compatible (2026-10-17). Sokağım, the Chats tab street.
-- Written for owner review: apply only after a restore-tested PostgreSQL 17
-- backup (docs/release/DATABASE_RELEASE_RUNBOOK.md). The binary that reads it
-- also runs before it: /ready treats this file as optional, and the street
-- probes the migration ledger and stays off (capability `chat_street`) until
-- the row exists. Older binaries never read this table.
--
-- One row per account, written only when the account saves a changed
-- loadout or room, or closes its window. A missing row means the defaults:
-- the window is open to mutual matches (owner decision 2026-10-17) and
-- nothing changed. No history is kept: only the last change of each kind.
-- Nobody's views are recorded. Deleting the account removes the row.
CREATE TABLE IF NOT EXISTS blumi_street_digests (
  user_id TEXT PRIMARY KEY REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  window_closed BOOLEAN NOT NULL DEFAULT false,
  look_kind TEXT,
  look_changed_at TIMESTAMPTZ,
  room_kind TEXT,
  room_changed_at TIMESTAMPTZ,
  room_revision INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT blumi_street_digests_look_check
    CHECK ((look_kind IS NULL) = (look_changed_at IS NULL)),
  CONSTRAINT blumi_street_digests_room_check
    CHECK ((room_kind IS NULL) = (room_changed_at IS NULL)),
  CONSTRAINT blumi_street_digests_look_kind_check
    CHECK (look_kind IS NULL OR look_kind IN ('dress', 'outfit', 'hair', 'shoes', 'accessory')),
  CONSTRAINT blumi_street_digests_room_kind_check
    CHECK (room_kind IS NULL OR room_kind IN ('rug', 'bed', 'seat', 'wall', 'shelf', 'item', 'layout'))
);

ALTER TABLE blumi_street_digests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE blumi_street_digests
  FROM PUBLIC, anon, authenticated;
