CREATE TABLE blumi_media_revocations (
  room_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  PRIMARY KEY(room_name, user_id)
);
CREATE INDEX blumi_media_revocations_due ON blumi_media_revocations(available_at) WHERE completed_at IS NULL;
CREATE INDEX blumi_media_revocations_completed ON blumi_media_revocations(completed_at) WHERE completed_at IS NOT NULL;

CREATE FUNCTION blumi_enqueue_room_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_room blumi_mini_rooms%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN selected_room := OLD;
  ELSE
    IF NEW.ended_at IS NULL OR OLD.ended_at IS NOT NULL THEN RETURN NEW; END IF;
    selected_room := NEW;
  END IF;
  INSERT INTO blumi_media_revocations(room_name, user_id)
    VALUES(selected_room.livekit_room_name, selected_room.participant_a_user_id),
          (selected_room.livekit_room_name, selected_room.participant_b_user_id)
    ON CONFLICT(room_name, user_id) DO UPDATE SET completed_at = NULL, available_at = NOW(), lease_token = NULL;
  RETURN selected_room;
END;
$$;
CREATE TRIGGER blumi_room_revocation AFTER UPDATE OR DELETE ON blumi_mini_rooms
  FOR EACH ROW EXECUTE FUNCTION blumi_enqueue_room_revocation();

CREATE FUNCTION blumi_enqueue_block_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO blumi_media_revocations(room_name, user_id)
    SELECT room.livekit_room_name, participant.user_id FROM blumi_mini_rooms room
      CROSS JOIN LATERAL (VALUES(room.participant_a_user_id),(room.participant_b_user_id)) participant(user_id)
    WHERE room.ended_at IS NULL AND
      ((room.participant_a_user_id = NEW.actor_user_id AND room.participant_b_user_id = NEW.blocked_user_id) OR
       (room.participant_b_user_id = NEW.actor_user_id AND room.participant_a_user_id = NEW.blocked_user_id))
    ON CONFLICT(room_name, user_id) DO UPDATE SET completed_at = NULL, available_at = NOW(), lease_token = NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER blumi_block_media_revocation AFTER INSERT ON blumi_safety_blocks
  FOR EACH ROW EXECUTE FUNCTION blumi_enqueue_block_revocation();

CREATE FUNCTION blumi_enqueue_moderation_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.moderation_status NOT IN ('suspended','banned') OR NEW.moderation_status IS NOT DISTINCT FROM OLD.moderation_status THEN RETURN NEW; END IF;
  INSERT INTO blumi_media_revocations(room_name, user_id)
    SELECT room.livekit_room_name, participant.user_id FROM blumi_mini_rooms room
      CROSS JOIN LATERAL (VALUES(room.participant_a_user_id),(room.participant_b_user_id)) participant(user_id)
    WHERE room.ended_at IS NULL AND NEW.user_id IN (room.participant_a_user_id, room.participant_b_user_id)
    ON CONFLICT(room_name, user_id) DO UPDATE SET completed_at = NULL, available_at = NOW(), lease_token = NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER blumi_moderation_media_revocation AFTER UPDATE OF moderation_status ON blumi_accounts
  FOR EACH ROW EXECUTE FUNCTION blumi_enqueue_moderation_revocation();
