-- Forward-only. Referral codes are opaque attribution handles, never public profiles.
CREATE TABLE IF NOT EXISTS blumi_referral_invites (
  code TEXT PRIMARY KEY CHECK (code ~ '^r_[A-Za-z0-9_-]{32,96}$'),
  inviter_user_id TEXT NOT NULL UNIQUE
    REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  claimed_by_user_id TEXT UNIQUE
    REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS blumi_referral_invites_claimed_at_idx
  ON blumi_referral_invites(claimed_at DESC)
  WHERE claimed_at IS NOT NULL;
