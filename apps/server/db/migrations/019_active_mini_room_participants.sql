WITH overlapping_rooms AS (
  SELECT older.mini_room_id
    FROM blumi_mini_rooms AS older
    JOIN blumi_mini_rooms AS newer
      ON older.mini_room_id <> newer.mini_room_id
     AND older.ended_at IS NULL
     AND newer.ended_at IS NULL
     AND (
       older.participant_a_user_id IN (
         newer.participant_a_user_id,
         newer.participant_b_user_id
       )
       OR older.participant_b_user_id IN (
         newer.participant_a_user_id,
         newer.participant_b_user_id
       )
     )
     AND (
       newer.started_at > older.started_at
       OR (
         newer.started_at = older.started_at
         AND newer.mini_room_id > older.mini_room_id
       )
     )
)
UPDATE blumi_mini_rooms
   SET ended_at = COALESCE(ended_at, now())
 WHERE mini_room_id IN (SELECT mini_room_id FROM overlapping_rooms);

CREATE TABLE IF NOT EXISTS blumi_active_mini_room_participants (
  user_id TEXT PRIMARY KEY,
  mini_room_id TEXT NOT NULL
    REFERENCES blumi_mini_rooms(mini_room_id) ON DELETE CASCADE
);

INSERT INTO blumi_active_mini_room_participants (user_id, mini_room_id)
SELECT participant_a_user_id, mini_room_id
  FROM blumi_mini_rooms
 WHERE ended_at IS NULL
UNION ALL
SELECT participant_b_user_id, mini_room_id
  FROM blumi_mini_rooms
 WHERE ended_at IS NULL
ON CONFLICT (user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS blumi_active_mini_room_id_idx
  ON blumi_active_mini_room_participants(mini_room_id);
