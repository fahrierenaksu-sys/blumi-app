CREATE TABLE IF NOT EXISTS blumi_discover_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 18 AND age <= 99),
  distance_label TEXT NOT NULL,
  vibe_tags TEXT[] NOT NULL DEFAULT '{}',
  avatar_preset_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blumi_discovery_decisions (
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('like', 'pass')),
  decided_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS blumi_discovery_decisions_to_from_idx
  ON blumi_discovery_decisions(to_user_id, from_user_id);

CREATE TABLE IF NOT EXISTS blumi_matches (
  match_id TEXT PRIMARY KEY,
  participant_a_user_id TEXT NOT NULL,
  participant_b_user_id TEXT NOT NULL,
  matched_at TIMESTAMPTZ NOT NULL,
  participant_key TEXT GENERATED ALWAYS AS (
    CASE
      WHEN participant_a_user_id < participant_b_user_id
      THEN participant_a_user_id || ':' || participant_b_user_id
      ELSE participant_b_user_id || ':' || participant_a_user_id
    END
  ) STORED,
  UNIQUE (participant_key)
);

CREATE INDEX IF NOT EXISTS blumi_matches_participant_a_idx
  ON blumi_matches(participant_a_user_id);

CREATE INDEX IF NOT EXISTS blumi_matches_participant_b_idx
  ON blumi_matches(participant_b_user_id);
