-- Test-only automated profiles are identified server-side, never by a UI label.
CREATE TABLE IF NOT EXISTS blumi_test_personas (
  user_id TEXT PRIMARY KEY REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  greeting TEXT NOT NULL CHECK (char_length(greeting) BETWEEN 1 AND 500),
  replies TEXT[] NOT NULL CHECK (cardinality(replies) BETWEEN 1 AND 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE blumi_test_personas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON blumi_test_personas FROM anon, authenticated;
