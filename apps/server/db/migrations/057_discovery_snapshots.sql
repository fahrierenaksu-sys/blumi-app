CREATE TABLE IF NOT EXISTS blumi_discovery_snapshots (
  snapshot_id UUID PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  filter_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0)
);
CREATE INDEX IF NOT EXISTS blumi_discovery_snapshots_expiry_idx ON blumi_discovery_snapshots(expires_at);
CREATE INDEX IF NOT EXISTS blumi_discovery_snapshots_owner_recent_idx
  ON blumi_discovery_snapshots(user_id,created_at DESC,snapshot_id DESC);
CREATE TABLE IF NOT EXISTS blumi_discovery_snapshot_candidates (
  snapshot_id UUID NOT NULL REFERENCES blumi_discovery_snapshots(snapshot_id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  user_id TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, position),
  UNIQUE (snapshot_id, user_id)
);
