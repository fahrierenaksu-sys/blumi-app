ALTER TABLE blumi_account_recovery_requests
  ADD COLUMN IF NOT EXISTS claimed_old_phone_number TEXT;
