-- Refresh rotation keeps a short-lived tombstone for the previous token so a
-- concurrent logout can still resolve and revoke the complete session family.
ALTER TABLE blumi_sessions
  DROP CONSTRAINT IF EXISTS blumi_sessions_session_id_key;

CREATE INDEX IF NOT EXISTS blumi_sessions_session_id_idx
  ON blumi_sessions(session_id);
