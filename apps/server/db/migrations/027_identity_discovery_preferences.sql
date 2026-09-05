ALTER TABLE blumi_accounts
  ADD COLUMN IF NOT EXISTS identity_gender TEXT,
  ADD COLUMN IF NOT EXISTS discovery_genders TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS discovery_age_min INTEGER NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS discovery_age_max INTEGER NOT NULL DEFAULT 99,
  ADD COLUMN IF NOT EXISTS discovery_vibes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS discovery_radius_km INTEGER NOT NULL DEFAULT 25;

UPDATE blumi_accounts
   SET identity_gender = gender
 WHERE identity_gender IS NULL
   AND gender IN ('woman', 'man');

ALTER TABLE blumi_accounts
  DROP CONSTRAINT IF EXISTS blumi_accounts_identity_gender_check,
  ADD CONSTRAINT blumi_accounts_identity_gender_check
    CHECK (identity_gender IS NULL OR identity_gender IN ('woman', 'man')),
  DROP CONSTRAINT IF EXISTS blumi_accounts_discovery_age_check,
  ADD CONSTRAINT blumi_accounts_discovery_age_check
    CHECK (
      discovery_age_min BETWEEN 18 AND 99
      AND discovery_age_max BETWEEN 18 AND 99
      AND discovery_age_min <= discovery_age_max
    ),
  DROP CONSTRAINT IF EXISTS blumi_accounts_discovery_genders_check,
  ADD CONSTRAINT blumi_accounts_discovery_genders_check
    CHECK (discovery_genders <@ ARRAY['woman', 'man']::TEXT[]),
  DROP CONSTRAINT IF EXISTS blumi_accounts_discovery_radius_check,
  ADD CONSTRAINT blumi_accounts_discovery_radius_check
    CHECK (discovery_radius_km IN (25, 50, 100));
