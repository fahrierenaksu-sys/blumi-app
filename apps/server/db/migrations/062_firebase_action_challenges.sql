-- A Firebase ID token is accepted for a sensitive account action only when
-- the phone sign-in occurred after a fresh, session-bound server challenge.
CREATE TABLE IF NOT EXISTS blumi_firebase_action_challenges (
  account_id TEXT NOT NULL REFERENCES blumi_accounts(account_id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'account_deletion', 'account_data_export',
    'phone_change_current', 'phone_change_new'
  )),
  challenge_id TEXT NOT NULL,
  session_token_hash CHAR(64) NOT NULL,
  target_phone_number TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (account_id, purpose)
);

CREATE INDEX IF NOT EXISTS blumi_firebase_action_challenges_expiry_idx
  ON blumi_firebase_action_challenges(expires_at);

ALTER TABLE blumi_firebase_action_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE blumi_firebase_action_challenges FROM anon, authenticated;
