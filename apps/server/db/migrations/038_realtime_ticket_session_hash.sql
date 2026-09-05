-- Realtime upgrade tickets live for at most 60 seconds. Replace the stored raw
-- session bearer with its one-way SHA-256 reference before accepting new
-- tickets. Deploy this migration with the binary that writes
-- session_token_hash; any in-flight upgrade ticket may be requested again.
ALTER TABLE blumi_realtime_tickets
  ADD COLUMN IF NOT EXISTS session_token_hash CHAR(64);

UPDATE blumi_realtime_tickets
   SET session_token_hash = encode(
     sha256(convert_to(session_token, 'UTF8')),
     'hex'
   )
 WHERE session_token_hash IS NULL;

ALTER TABLE blumi_realtime_tickets
  ALTER COLUMN session_token_hash SET NOT NULL;

ALTER TABLE blumi_realtime_tickets
  DROP COLUMN session_token;
