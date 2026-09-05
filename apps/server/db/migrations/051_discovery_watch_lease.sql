ALTER TABLE blumi_discovery_watches ADD COLUMN IF NOT EXISTS claim_token TEXT;
ALTER TABLE blumi_discovery_watches ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS blumi_discovery_watch_claim_idx
  ON blumi_discovery_watches (updated_at, lease_until) WHERE status = 'active';
