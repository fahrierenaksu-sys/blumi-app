-- Legacy pending rows deliberately have no registration identity and fail closed.
ALTER TABLE blumi_push_devices ADD COLUMN registration_id TEXT;
UPDATE blumi_push_devices SET registration_id = md5(random()::text || clock_timestamp()::text || push_token);
ALTER TABLE blumi_push_devices ALTER COLUMN registration_id SET NOT NULL;
ALTER TABLE blumi_push_devices ALTER COLUMN registration_id SET DEFAULT md5(random()::text || clock_timestamp()::text);
ALTER TABLE blumi_push_delivery_outbox ADD COLUMN registration_id TEXT;

-- Older writers omit this field on insert and retain it in ON CONFLICT updates.
-- Rotate on their updates too, so A -> B -> A cannot revive an old generation.
CREATE FUNCTION blumi_rotate_push_registration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id = OLD.user_id THEN
    NEW.registration_id := OLD.registration_id;
  ELSIF NEW.registration_id IS NOT DISTINCT FROM OLD.registration_id THEN
    NEW.registration_id := md5(random()::text || clock_timestamp()::text || NEW.push_token);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER blumi_push_registration_rotation
  BEFORE UPDATE ON blumi_push_devices
  FOR EACH ROW EXECUTE FUNCTION blumi_rotate_push_registration();

CREATE FUNCTION blumi_invalidate_push_registration() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM blumi_push_delivery_outbox
    WHERE push_token = OLD.push_token
      AND registration_id IS DISTINCT FROM NEW.registration_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER blumi_push_registration_invalidation
  AFTER UPDATE ON blumi_push_devices
  FOR EACH ROW EXECUTE FUNCTION blumi_invalidate_push_registration();
