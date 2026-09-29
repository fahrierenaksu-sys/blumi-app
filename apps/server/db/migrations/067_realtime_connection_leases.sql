CREATE TABLE IF NOT EXISTS blumi_realtime_connection_leases (
  connection_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL
    REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS blumi_realtime_connection_leases_user_expiry_idx
  ON blumi_realtime_connection_leases(user_id, expires_at);

REVOKE ALL ON TABLE blumi_realtime_connection_leases
  FROM PUBLIC, anon, authenticated;
