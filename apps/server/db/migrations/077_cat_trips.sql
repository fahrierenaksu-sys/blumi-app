-- Additive and backward compatible (2026-10-16). Three new tables for the
-- traveling room cat ("Gezgin kedi"); no existing object changes.
--
-- The server plans each owner's day once (blumi_cat_trip_days), writes up to
-- two trips for it (blumi_cat_trips) and one souvenir per finished trip
-- (blumi_cat_souvenirs). Destinations, times and souvenirs are decided here,
-- never by the client. No message text, name or phone number is stored: only
-- user ids (all cascade with the account), times, a keyed seed digest and counts.
--
-- /ready treats this file as optional: the server probes the ledger and keeps
-- the whole feature off (routes answer enabled:false) until this row exists
-- with the packaged checksum. Older binaries never touch these tables.
CREATE TABLE IF NOT EXISTS blumi_cat_trip_days (
  owner_user_id TEXT NOT NULL REFERENCES blumi_accounts (user_id) ON DELETE CASCADE,
  day_key DATE NOT NULL,
  seed_digest TEXT NOT NULL CHECK (seed_digest ~ '^[0-9a-f]{16}$'),
  planned_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (owner_user_id, day_key)
);

CREATE TABLE IF NOT EXISTS blumi_cat_trips (
  trip_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES blumi_accounts (user_id) ON DELETE CASCADE,
  host_user_id TEXT NOT NULL REFERENCES blumi_accounts (user_id) ON DELETE CASCADE,
  day_key DATE NOT NULL,
  slot SMALLINT NOT NULL CHECK (slot IN (0, 1)),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('visit', 'sleepover')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  ended_at TIMESTAMPTZ,
  end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN ('unmatch', 'block', 'account', 'ineligible')),
  return_state TEXT CHECK (return_state IS NULL OR return_state IN ('sleepy', 'petals')),
  seed_digest TEXT NOT NULL CHECK (seed_digest ~ '^[0-9a-f]{16}$'),
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 1),
  plan_version SMALLINT NOT NULL,
  owner_revealed_at TIMESTAMPTZ,
  host_revealed_at TIMESTAMPTZ,
  owner_push_at TIMESTAMPTZ,
  host_push_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT blumi_cat_trips_owner_day_slot_uq UNIQUE (owner_user_id, day_key, slot),
  CONSTRAINT blumi_cat_trips_distinct_users CHECK (owner_user_id <> host_user_id),
  CONSTRAINT blumi_cat_trips_window_order CHECK (ends_at > starts_at),
  CONSTRAINT blumi_cat_trips_cancel_pair CHECK ((status = 'cancelled') = (ended_at IS NOT NULL AND end_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS blumi_cat_trips_owner_ends_idx ON blumi_cat_trips (owner_user_id, ends_at);
CREATE INDEX IF NOT EXISTS blumi_cat_trips_host_ends_idx ON blumi_cat_trips (host_user_id, ends_at);
CREATE INDEX IF NOT EXISTS blumi_cat_trips_created_idx ON blumi_cat_trips (created_at);

CREATE TABLE IF NOT EXISTS blumi_cat_souvenirs (
  souvenir_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES blumi_accounts (user_id) ON DELETE CASCADE,
  trip_id TEXT NOT NULL REFERENCES blumi_cat_trips (trip_id) ON DELETE CASCADE,
  souvenir_key TEXT NOT NULL CHECK (char_length(souvenir_key) BETWEEN 1 AND 40),
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare')),
  acquired_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT blumi_cat_souvenirs_trip_uq UNIQUE (trip_id)
);

CREATE INDEX IF NOT EXISTS blumi_cat_souvenirs_owner_idx ON blumi_cat_souvenirs (owner_user_id, acquired_at DESC);

ALTER TABLE blumi_cat_trip_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE blumi_cat_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE blumi_cat_souvenirs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE blumi_cat_trip_days FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE blumi_cat_trips FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE blumi_cat_souvenirs FROM PUBLIC, anon, authenticated;
