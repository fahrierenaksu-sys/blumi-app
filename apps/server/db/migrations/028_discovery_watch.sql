CREATE TABLE IF NOT EXISTS blumi_discovery_watches (
  user_id TEXT PRIMARY KEY REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active')),
  age_min INTEGER NOT NULL CHECK (age_min BETWEEN 18 AND 99),
  age_max INTEGER NOT NULL CHECK (age_max BETWEEN 18 AND 99 AND age_max >= age_min),
  genders TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  vibes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  radius_km INTEGER NOT NULL CHECK (radius_km IN (25, 50, 100)),
  updated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS blumi_discovery_watches_active_expiry_idx
  ON blumi_discovery_watches (expires_at)
  WHERE status = 'active';
