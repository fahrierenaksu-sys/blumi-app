-- Additive and backward compatible (2026-10-17). One new table for the
-- traveling room cat's personal switches; no existing object changes.
--
-- travel_enabled: "Kedim misafirliğe gitsin" (default on; the owner's cat
--   may visit any mutual match they chatted with).
-- host_enabled:   "Misafir kedi kabul et" (default on; nobody is told when
--   it is turned off).
-- push_enabled:   "Kedi haberleri" teaser pushes (default OFF: engagement
--   pushes are an explicit opt-in).
--
-- No row means the defaults. Rows go with the account through the foreign key.
-- /ready treats this file as optional: until its ledger row exists the server
-- reads the defaults (teasers stay off) and refuses to save a change.
CREATE TABLE IF NOT EXISTS blumi_cat_trip_prefs (
  user_id TEXT PRIMARY KEY REFERENCES blumi_accounts (user_id) ON DELETE CASCADE,
  travel_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  host_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE blumi_cat_trip_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE blumi_cat_trip_prefs FROM PUBLIC, anon, authenticated;
