CREATE TABLE IF NOT EXISTS blumi_connection_decisions (
  mini_room_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  partner_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('saved', 'passed')),
  decided_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (mini_room_id, actor_user_id)
);

CREATE INDEX IF NOT EXISTS blumi_connection_decisions_partner_idx
  ON blumi_connection_decisions(mini_room_id, partner_user_id);

CREATE TABLE IF NOT EXISTS blumi_connection_matches (
  mini_room_id TEXT PRIMARY KEY,
  participant_a_user_id TEXT NOT NULL,
  participant_b_user_id TEXT NOT NULL,
  matched_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS blumi_connection_matches_participant_a_idx
  ON blumi_connection_matches(participant_a_user_id, matched_at DESC);

CREATE INDEX IF NOT EXISTS blumi_connection_matches_participant_b_idx
  ON blumi_connection_matches(participant_b_user_id, matched_at DESC);

CREATE TABLE IF NOT EXISTS blumi_reactions (
  reaction_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  target_user_id TEXT,
  reaction TEXT NOT NULL CHECK (reaction IN ('wave', 'heart', 'laugh', 'fire')),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS blumi_reactions_room_idx
  ON blumi_reactions(room_id, created_at DESC);
