-- Forward-only. Existing binaries do not read this table; the new binary treats
-- a missing row as the default 10-decision UTC-day allowance. Rollback is a
-- restore decision, not a destructive down migration.
CREATE TABLE IF NOT EXISTS blumi_discovery_decision_quotas (
  user_id TEXT NOT NULL,
  quota_day DATE NOT NULL,
  used_decisions INTEGER NOT NULL DEFAULT 0 CHECK (used_decisions >= 0),
  extension_decisions INTEGER NOT NULL DEFAULT 0 CHECK (extension_decisions >= 0),
  PRIMARY KEY (user_id, quota_day)
);

CREATE OR REPLACE FUNCTION blumi_discovery_decision_quota(
  p_user_id TEXT,
  p_now TIMESTAMPTZ
)
RETURNS TABLE (
  decision_limit INTEGER,
  extension_decisions INTEGER,
  used INTEGER,
  remaining INTEGER,
  resets_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  WITH period AS (
    SELECT (p_now AT TIME ZONE 'UTC')::date AS quota_day
  ), quota AS (
    SELECT COALESCE(q.used_decisions, 0) AS used_decisions,
           COALESCE(q.extension_decisions, 0) AS extension_decisions,
           period.quota_day
      FROM period
      LEFT JOIN blumi_discovery_decision_quotas q
        ON q.user_id = p_user_id
       AND q.quota_day = period.quota_day
  )
  SELECT 10 + extension_decisions,
         extension_decisions,
         used_decisions,
         GREATEST(0, 10 + extension_decisions - used_decisions),
         ((quota_day + 1)::timestamp AT TIME ZONE 'UTC')
    FROM quota;
$$;

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

  -- Serializes a user's daily decision writes even before a quota row exists.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_from_user_id || ':' || v_quota_day::text,
    0
  ));

  SELECT * INTO v_existing
    FROM blumi_discovery_decisions
   WHERE from_user_id = p_from_user_id
     AND to_user_id = p_to_user_id;

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

  SELECT used_decisions, extension_decisions
    INTO v_used, v_extension
    FROM blumi_discovery_decision_quotas
   WHERE user_id = p_from_user_id
     AND quota_day = v_quota_day
   FOR UPDATE;

  v_limit := 10 + v_extension;
  IF v_used >= v_limit THEN
    RETURN QUERY SELECT 'quota_exhausted', NULL::TEXT, NULL::TIMESTAMPTZ,
                        FALSE, v_limit, v_extension, v_used, 0, v_resets_at;
    RETURN;
  END IF;

  IF v_reconsidering THEN
    UPDATE blumi_discovery_decisions
       SET decision = p_decision,
           decided_at = p_now
     WHERE from_user_id = p_from_user_id
       AND to_user_id = p_to_user_id;
  ELSE
    INSERT INTO blumi_discovery_decisions (
      from_user_id, to_user_id, decision, decided_at
    ) VALUES (p_from_user_id, p_to_user_id, p_decision, p_now);
  END IF;

  UPDATE blumi_discovery_decision_quotas
     SET used_decisions = used_decisions + 1
   WHERE user_id = p_from_user_id
     AND quota_day = v_quota_day
  RETURNING used_decisions INTO v_used;

  RETURN QUERY SELECT 'created', p_decision, p_now, TRUE,
                      v_limit, v_extension, v_used, v_limit - v_used, v_resets_at;
END;
$$;
