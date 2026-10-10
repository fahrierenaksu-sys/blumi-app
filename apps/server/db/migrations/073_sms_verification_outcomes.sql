-- Additive rollout: outcome-based enforcement stays off until the signed
-- Firebase token observer has been deployed and verified on real clients.
ALTER TABLE blumi_sms_admission_config
  ADD COLUMN verification_outcomes_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE blumi_sms_send_admissions
  ADD COLUMN verified_at TIMESTAMPTZ,
  ADD COLUMN verification_key CHAR(64) UNIQUE CHECK (verification_key ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT sms_verification_pair CHECK ((verified_at IS NULL) = (verification_key IS NULL));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'blumi_sms_observer') THEN
    CREATE ROLE blumi_sms_observer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO blumi_sms_observer;
GRANT SELECT (id, checksum) ON blumi_migrations TO blumi_sms_observer;
GRANT SELECT ON blumi_sms_send_admissions TO blumi_sms_observer;
GRANT UPDATE (verified_at, verification_key) ON blumi_sms_send_admissions TO blumi_sms_observer;
CREATE POLICY blumi_sms_observer_read ON blumi_sms_send_admissions FOR SELECT TO blumi_sms_observer USING (true);
CREATE POLICY blumi_sms_observer_mark ON blumi_sms_send_admissions FOR UPDATE TO blumi_sms_observer
  USING (verified_at IS NULL) WITH CHECK (verified_at IS NOT NULL);
