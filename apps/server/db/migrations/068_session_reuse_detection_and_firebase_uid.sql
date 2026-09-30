-- Additive and backward compatible: every new column is nullable and the
-- previous binary ignores it. Apply before the binary that writes them.
--
-- Refresh-token reuse detection and an absolute session-family lifetime.
-- rotated_at / replaced_by_token_hash mark a token that refresh already
-- exchanged; presenting it again after the grace window revokes the family.
-- family_expires_at caps a family; NULL on rows created before this
-- migration, anchored by the family's next rotation.
ALTER TABLE blumi_sessions
  ADD COLUMN IF NOT EXISTS family_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replaced_by_token_hash TEXT;

-- Firebase uid binding. NULL means "not bound yet": legacy accounts bind on
-- their next verified sign-in and a phone change clears the binding. A uid
-- identifies at most one account.
ALTER TABLE blumi_accounts
  ADD COLUMN IF NOT EXISTS firebase_uid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS blumi_accounts_firebase_uid_key
  ON blumi_accounts(firebase_uid)
  WHERE firebase_uid IS NOT NULL;
