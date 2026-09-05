CREATE TABLE blumi_realtime_payload_refs (
  payload_id UUID PRIMARY KEY,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
  CHECK (octet_length(payload::text) <= 2200000)
);
CREATE INDEX blumi_realtime_payload_refs_expiry ON blumi_realtime_payload_refs(expires_at);

-- Atomic aggregate budget bounds payload storage even during a traffic burst.
CREATE TABLE blumi_realtime_payload_budget (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  used_bytes BIGINT NOT NULL DEFAULT 0 CHECK(used_bytes BETWEEN 0 AND 67108864)
);
INSERT INTO blumi_realtime_payload_budget(singleton) VALUES(TRUE);
CREATE FUNCTION blumi_bound_realtime_payloads() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE blumi_realtime_payload_budget
      SET used_bytes = used_bytes + octet_length(NEW.payload::text)
      WHERE singleton AND used_bytes + octet_length(NEW.payload::text) <= 67108864;
    IF NOT FOUND THEN RAISE EXCEPTION 'Realtime payload capacity reached'; END IF;
    RETURN NEW;
  END IF;
  UPDATE blumi_realtime_payload_budget SET used_bytes = used_bytes - octet_length(OLD.payload::text) WHERE singleton;
  RETURN OLD;
END;
$$;
CREATE TRIGGER blumi_realtime_payload_insert_budget BEFORE INSERT ON blumi_realtime_payload_refs
  FOR EACH ROW EXECUTE FUNCTION blumi_bound_realtime_payloads();
CREATE TRIGGER blumi_realtime_payload_delete_budget AFTER DELETE ON blumi_realtime_payload_refs
  FOR EACH ROW EXECUTE FUNCTION blumi_bound_realtime_payloads();
