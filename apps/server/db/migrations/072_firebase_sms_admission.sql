-- Provider-side SMS reservations. This feature starts disabled; the existing
-- API and app do not depend on it. Enable only after a verified beforeSmsSent
-- deployment, owner approval, and the database backup/restore gate.
CREATE TABLE blumi_sms_admission_config (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton = true),
  enabled BOOLEAN NOT NULL DEFAULT false,
  ip_limit_15_minutes INTEGER NOT NULL DEFAULT 10 CHECK (ip_limit_15_minutes BETWEEN 1 AND 1500),
  ip_limit_24_hours INTEGER NOT NULL DEFAULT 50 CHECK (ip_limit_24_hours BETWEEN 1 AND 1500),
  project_limit_24_hours INTEGER NOT NULL DEFAULT 1500 CHECK (project_limit_24_hours BETWEEN 1 AND 1500),
  project_limit_15_minutes INTEGER NOT NULL DEFAULT 50 CHECK (project_limit_15_minutes BETWEEN 1 AND 1500),
  cost_limit_24_hours_microusd BIGINT NOT NULL DEFAULT 0 CHECK (cost_limit_24_hours_microusd BETWEEN 0 AND 10000000000),
  cost_limit_month_microusd BIGINT NOT NULL DEFAULT 0 CHECK (cost_limit_month_microusd BETWEEN 0 AND 10000000000),
  opening_month_utc CHAR(7) CHECK (opening_month_utc ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  opening_cost_microusd BIGINT NOT NULL DEFAULT 0 CHECK (opening_cost_microusd BETWEEN 0 AND 10000000000)
);
-- No policy row is provisioned by the migration. Missing policy blocks SMS.
-- An operator initializes it separately, only during the approved rollout.

CREATE TABLE blumi_sms_country_policy (
  country CHAR(2) PRIMARY KEY CHECK (country ~ '^[A-Z]{2}$'),
  enabled BOOLEAN NOT NULL DEFAULT false,
  price_microusd BIGINT NOT NULL CHECK (price_microusd BETWEEN 1 AND 10000000),
  price_valid_until TIMESTAMPTZ NOT NULL,
  limit_24_hours INTEGER NOT NULL CHECK (limit_24_hours BETWEEN 1 AND 1500),
  cost_limit_24_hours_microusd BIGINT NOT NULL CHECK (cost_limit_24_hours_microusd BETWEEN 1 AND 10000000000)
);

CREATE TABLE blumi_sms_send_admissions (
  event_key CHAR(64) PRIMARY KEY CHECK (event_key ~ '^[0-9a-f]{64}$'),
  phone_key CHAR(64) NOT NULL CHECK (phone_key ~ '^[0-9a-f]{64}$'),
  ip_key CHAR(64) NOT NULL CHECK (ip_key ~ '^[0-9a-f]{64}$'),
  country CHAR(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  charge_microusd BIGINT NOT NULL CHECK (charge_microusd BETWEEN 1 AND 10000000),
  admitted_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX blumi_sms_send_admissions_time ON blumi_sms_send_admissions (admitted_at);
CREATE INDEX blumi_sms_send_admissions_phone ON blumi_sms_send_admissions (phone_key, admitted_at);
CREATE INDEX blumi_sms_send_admissions_ip ON blumi_sms_send_admissions (ip_key, admitted_at);
CREATE INDEX blumi_sms_send_admissions_country ON blumi_sms_send_admissions (country, admitted_at);

CREATE TABLE blumi_sms_installations (
  installation_key CHAR(64) PRIMARY KEY CHECK (installation_key ~ '^[0-9a-f]{64}$'),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  public_key TEXT,
  sign_count BIGINT NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
  created_at TIMESTAMPTZ NOT NULL,
  CHECK ((platform = 'ios' AND public_key IS NOT NULL) OR (platform = 'android' AND public_key IS NULL))
);
CREATE TABLE blumi_sms_device_challenges (
  challenge_key CHAR(64) PRIMARY KEY CHECK (challenge_key ~ '^[0-9a-f]{64}$'),
  installation_key CHAR(64) NOT NULL CHECK (installation_key ~ '^[0-9a-f]{64}$'),
  phone_key CHAR(64) NOT NULL CHECK (phone_key ~ '^[0-9a-f]{64}$'),
  ip_key CHAR(64) NOT NULL CHECK (ip_key ~ '^[0-9a-f]{64}$'),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '2 minutes')
);
CREATE INDEX blumi_sms_device_challenges_time ON blumi_sms_device_challenges (created_at);
CREATE INDEX blumi_sms_device_challenges_ip ON blumi_sms_device_challenges (ip_key, created_at);
CREATE INDEX blumi_sms_device_challenges_installation ON blumi_sms_device_challenges (installation_key, created_at);
CREATE TABLE blumi_sms_device_permits (
  challenge_key CHAR(64) PRIMARY KEY REFERENCES blumi_sms_device_challenges(challenge_key),
  installation_key CHAR(64) NOT NULL REFERENCES blumi_sms_installations(installation_key),
  phone_key CHAR(64) NOT NULL CHECK (phone_key ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '60 seconds')
);
CREATE INDEX blumi_sms_device_permits_phone ON blumi_sms_device_permits (phone_key, expires_at);
CREATE INDEX blumi_sms_device_permits_installation ON blumi_sms_device_permits (installation_key, created_at);

-- Provision a separate login identity that inherits only this restricted role.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'blumi_sms_defense') THEN
    CREATE ROLE blumi_sms_defense NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO blumi_sms_defense;
GRANT SELECT (id, checksum) ON blumi_migrations TO blumi_sms_defense;
GRANT SELECT ON blumi_sms_admission_config TO blumi_sms_defense;
GRANT SELECT ON blumi_sms_country_policy TO blumi_sms_defense;
GRANT SELECT, INSERT ON blumi_sms_send_admissions TO blumi_sms_defense;
GRANT SELECT, UPDATE (consumed_at) ON blumi_sms_device_permits TO blumi_sms_defense;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'blumi_sms_device_gate') THEN
    CREATE ROLE blumi_sms_device_gate NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO blumi_sms_device_gate;
GRANT SELECT (id, checksum) ON blumi_migrations TO blumi_sms_device_gate;
GRANT SELECT ON blumi_sms_admission_config, blumi_sms_country_policy TO blumi_sms_device_gate;
GRANT SELECT, INSERT ON blumi_sms_installations, blumi_sms_device_challenges, blumi_sms_device_permits TO blumi_sms_device_gate;
GRANT UPDATE (sign_count) ON blumi_sms_installations TO blumi_sms_device_gate;
GRANT UPDATE (consumed_at) ON blumi_sms_device_challenges TO blumi_sms_device_gate;

ALTER TABLE blumi_sms_admission_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE blumi_sms_send_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blumi_sms_country_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE blumi_sms_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE blumi_sms_device_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE blumi_sms_device_permits ENABLE ROW LEVEL SECURITY;
CREATE POLICY blumi_sms_config_read ON blumi_sms_admission_config
  FOR SELECT TO blumi_sms_defense USING (true);
CREATE POLICY blumi_sms_admissions_read ON blumi_sms_send_admissions
  FOR SELECT TO blumi_sms_defense USING (true);
CREATE POLICY blumi_sms_admissions_reserve ON blumi_sms_send_admissions
  FOR INSERT TO blumi_sms_defense WITH CHECK (true);
CREATE POLICY blumi_sms_country_policy_read ON blumi_sms_country_policy
  FOR SELECT TO blumi_sms_defense USING (true);
CREATE POLICY blumi_sms_gate_config_read ON blumi_sms_admission_config FOR SELECT TO blumi_sms_device_gate USING (true);
CREATE POLICY blumi_sms_gate_country_read ON blumi_sms_country_policy FOR SELECT TO blumi_sms_device_gate USING (true);
CREATE POLICY blumi_sms_installation_read ON blumi_sms_installations FOR SELECT TO blumi_sms_device_gate USING (true);
CREATE POLICY blumi_sms_installation_create ON blumi_sms_installations FOR INSERT TO blumi_sms_device_gate WITH CHECK (true);
CREATE POLICY blumi_sms_installation_counter ON blumi_sms_installations FOR UPDATE TO blumi_sms_device_gate USING (true) WITH CHECK (true);
CREATE POLICY blumi_sms_challenge_read ON blumi_sms_device_challenges FOR SELECT TO blumi_sms_device_gate USING (true);
CREATE POLICY blumi_sms_challenge_create ON blumi_sms_device_challenges FOR INSERT TO blumi_sms_device_gate WITH CHECK (true);
CREATE POLICY blumi_sms_challenge_consume ON blumi_sms_device_challenges FOR UPDATE TO blumi_sms_device_gate USING (consumed_at IS NULL) WITH CHECK (consumed_at IS NOT NULL);
CREATE POLICY blumi_sms_permit_read ON blumi_sms_device_permits FOR SELECT TO blumi_sms_device_gate, blumi_sms_defense USING (true);
CREATE POLICY blumi_sms_permit_create ON blumi_sms_device_permits FOR INSERT TO blumi_sms_device_gate WITH CHECK (true);
CREATE POLICY blumi_sms_permit_consume ON blumi_sms_device_permits FOR UPDATE TO blumi_sms_defense USING (consumed_at IS NULL) WITH CHECK (consumed_at IS NOT NULL);

-- The function identity cannot erase fresh reservations or change policy.
CREATE FUNCTION public.blumi_sms_prune_expired() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  DELETE FROM public.blumi_sms_device_permits WHERE challenge_key IN (
    SELECT challenge_key FROM public.blumi_sms_device_permits
    WHERE created_at <= clock_timestamp() - interval '48 hours' ORDER BY created_at LIMIT 100
  );
  DELETE FROM public.blumi_sms_device_challenges WHERE challenge_key IN (
    SELECT c.challenge_key FROM public.blumi_sms_device_challenges c
    WHERE c.created_at <= clock_timestamp() - interval '48 hours'
      AND NOT EXISTS (SELECT 1 FROM public.blumi_sms_device_permits p WHERE p.challenge_key = c.challenge_key)
    ORDER BY c.created_at LIMIT 100
  );
  DELETE FROM public.blumi_sms_send_admissions WHERE event_key IN (
    SELECT event_key FROM public.blumi_sms_send_admissions
    WHERE admitted_at <= clock_timestamp() - interval '62 days'
    ORDER BY admitted_at LIMIT 100
  );
$$;
REVOKE ALL ON FUNCTION public.blumi_sms_prune_expired() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.blumi_sms_prune_expired() TO blumi_sms_defense;
GRANT EXECUTE ON FUNCTION public.blumi_sms_prune_expired() TO blumi_sms_device_gate;
REVOKE ALL ON TABLE blumi_sms_admission_config FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE blumi_sms_send_admissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE blumi_sms_country_policy FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE blumi_sms_installations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE blumi_sms_device_challenges FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE blumi_sms_device_permits FROM PUBLIC, anon, authenticated;
