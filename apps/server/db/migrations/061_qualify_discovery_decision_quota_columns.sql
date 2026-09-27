-- The table-returning function exposes extension_decisions as an output variable.
-- Qualify table columns so PL/pgSQL does not treat them as ambiguous variables.
CREATE OR REPLACE FUNCTION blumi_consume_discovery_decision(
  p_from_user_id TEXT,
  p_to_user_id TEXT,
  p_decision TEXT,
  p_now TIMESTAMPTZ,
  p_reconsideration_decided_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  outcome TEXT,
  decision TEXT,
  decided_at TIMESTAMPTZ,
  created BOOLEAN,
  decision_limit INTEGER,
  extension_decisions INTEGER,
  used INTEGER,
  remaining INTEGER,
  resets_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_quota_day DATE := (p_now AT TIME ZONE 'UTC')::date;
  v_existing blumi_discovery_decisions%ROWTYPE;
  v_used INTEGER := 0;
  v_extension INTEGER := 0;
  v_limit INTEGER;
  v_reconsidering BOOLEAN := FALSE;
  v_resets_at TIMESTAMPTZ := ((v_quota_day + 1)::timestamp AT TIME ZONE 'UTC');
BEGIN
  IF p_decision NOT IN ('like', 'pass') THEN
    RAISE EXCEPTION 'invalid discovery decision';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_from_user_id || ':' || v_quota_day::text,
    0
  ));

  SELECT * INTO v_existing
    FROM blumi_discovery_decisions d
   WHERE d.from_user_id = p_from_user_id
     AND d.to_user_id = p_to_user_id;

  v_reconsidering := FOUND;

  IF v_reconsidering AND (
    p_reconsideration_decided_at IS NULL
    OR v_existing.decided_at <> p_reconsideration_decided_at
  ) THEN
    SELECT q.decision_limit, q.extension_decisions, q.used, q.remaining, q.resets_at
      INTO v_limit, v_extension, v_used, remaining, v_resets_at
      FROM blumi_discovery_decision_quota(p_from_user_id, p_now) q;
    RETURN QUERY SELECT 'existing', v_existing.decision, v_existing.decided_at,
                        FALSE, v_limit, v_extension, v_used, remaining, v_resets_at;
    RETURN;
  END IF;

  INSERT INTO blumi_discovery_decision_quotas (user_id, quota_day)
  VALUES (p_from_user_id, v_quota_day)
  ON CONFLICT (user_id, quota_day) DO NOTHING;

  SELECT q.used_decisions, q.extension_decisions
    INTO v_used, v_extension
    FROM blumi_discovery_decision_quotas q
   WHERE q.user_id = p_from_user_id
     AND q.quota_day = v_quota_day
   FOR UPDATE;

  v_limit := 10 + v_extension;
  IF v_used >= v_limit THEN
    RETURN QUERY SELECT 'quota_exhausted', NULL::TEXT, NULL::TIMESTAMPTZ,
                        FALSE, v_limit, v_extension, v_used, 0, v_resets_at;
    RETURN;
  END IF;

  IF v_reconsidering THEN
    UPDATE blumi_discovery_decisions d
       SET decision = p_decision,
           decided_at = p_now
     WHERE d.from_user_id = p_from_user_id
       AND d.to_user_id = p_to_user_id;
  ELSE
    INSERT INTO blumi_discovery_decisions (
      from_user_id, to_user_id, decision, decided_at
    ) VALUES (p_from_user_id, p_to_user_id, p_decision, p_now);
  END IF;

  UPDATE blumi_discovery_decision_quotas q
     SET used_decisions = q.used_decisions + 1
   WHERE q.user_id = p_from_user_id
     AND q.quota_day = v_quota_day
  RETURNING q.used_decisions INTO v_used;

  RETURN QUERY SELECT 'created', p_decision, p_now, TRUE,
                      v_limit, v_extension, v_used, v_limit - v_used, v_resets_at;
END;
$$;
