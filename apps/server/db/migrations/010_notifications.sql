CREATE TABLE IF NOT EXISTS blumi_push_devices (
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  push_token TEXT NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, push_token)
);

CREATE INDEX IF NOT EXISTS blumi_push_devices_user_idx
  ON blumi_push_devices(user_id);
