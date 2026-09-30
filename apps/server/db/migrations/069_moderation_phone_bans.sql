-- Additive: one new table that the previous binary never reads. Apply before
-- the binary that writes it; that binary's /ready refuses a database without
-- this migration.
--
-- Ban records that outlive a banned account. When a banned account is deleted
-- or moves to another phone number, the freed number's keyed hash is kept
-- here, and a new account created for that number starts banned.
-- phone_hash is HMAC-SHA256 under BLUMI_OTP_HMAC_SECRET with a domain prefix
-- (apps/server/src/auth/moderationPhoneBan.ts), lowercase hex; the plain
-- number is never stored. Rows stay until an administrator removes them.
-- Suspensions are time-limited and are never recorded here.
CREATE TABLE IF NOT EXISTS blumi_moderation_phone_bans (
  phone_hash TEXT PRIMARY KEY
    CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  source TEXT NOT NULL
    CHECK (source IN ('account_deletion', 'phone_change')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE blumi_moderation_phone_bans ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE blumi_moderation_phone_bans
  FROM PUBLIC, anon, authenticated;
