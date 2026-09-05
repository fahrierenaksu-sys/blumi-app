-- Generation identifies one user request; worker leases never change it.
ALTER TABLE blumi_discovery_watches
  ADD COLUMN generation TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN completed_at TIMESTAMPTZ,
  ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE blumi_push_delivery_outbox ADD COLUMN discovery_watch_generation TEXT;
-- Legacy watch notifications lack authorization provenance and must not be dispatched.
DELETE FROM blumi_push_delivery_outbox WHERE data->>'type' = 'discovery.watch_match';
CREATE INDEX blumi_watch_pending_generation_idx
  ON blumi_push_delivery_outbox(user_id, discovery_watch_generation)
  WHERE discovery_watch_generation IS NOT NULL;
CREATE FUNCTION blumi_invalidate_discovery_watch_generation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.generation IS DISTINCT FROM NEW.generation THEN
    DELETE FROM blumi_push_delivery_outbox
      WHERE user_id = OLD.user_id AND discovery_watch_generation = OLD.generation;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER blumi_discovery_watch_generation_invalidation
  AFTER UPDATE OF generation OR DELETE ON blumi_discovery_watches
  FOR EACH ROW EXECUTE FUNCTION blumi_invalidate_discovery_watch_generation();
