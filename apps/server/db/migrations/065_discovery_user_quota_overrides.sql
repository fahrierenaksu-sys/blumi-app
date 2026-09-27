CREATE TABLE IF NOT EXISTS blumi_discovery_quota_overrides (
  user_id TEXT PRIMARY KEY REFERENCES blumi_accounts(user_id) ON DELETE CASCADE,
  is_unlimited BOOLEAN NOT NULL DEFAULT TRUE,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 12 AND 500),
  enabled_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE blumi_discovery_quota_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE blumi_discovery_quota_overrides FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE blumi_discovery_quota_overrides IS
  'Server-only per-account discovery quota exceptions. A matching enabled row exempts that account from the daily decision cap.';

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
           period.quota_day,
           EXISTS (
             SELECT 1
               FROM blumi_discovery_quota_overrides o
              WHERE o.user_id = p_user_id
                AND o.is_unlimited IS TRUE
           ) AS is_unlimited
      FROM period
      LEFT JOIN blumi_discovery_decision_quotas q
        ON q.user_id = p_user_id
       AND q.quota_day = period.quota_day
  )
  SELECT CASE WHEN is_unlimited THEN 2147483647 ELSE 10 + extension_decisions END,
         extension_decisions,
         used_decisions,
         CASE WHEN is_unlimited THEN 2147483647 - used_decisions
              ELSE GREATEST(0, 10 + extension_decisions - used_decisions) END,
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
  v_is_unlimited BOOLEAN := FALSE;
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

  SELECT EXISTS (
    SELECT 1
      FROM blumi_discovery_quota_overrides o
     WHERE o.user_id = p_from_user_id
       AND o.is_unlimited IS TRUE
  ) INTO v_is_unlimited;

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

  v_limit := CASE WHEN v_is_unlimited THEN 2147483647 ELSE 10 + v_extension END;
  IF NOT v_is_unlimited AND v_used >= v_limit THEN
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
                      v_limit, v_extension, v_used,
                      CASE WHEN v_is_unlimited THEN 2147483647 - v_used ELSE v_limit - v_used END,
                      v_resets_at;
END;
$$;
