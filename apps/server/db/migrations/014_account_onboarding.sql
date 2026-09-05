ALTER TABLE blumi_accounts
  ADD COLUMN IF NOT EXISTS onboarding_profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_avatar_complete BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_room_complete BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Legacy accounts already passed through avatar and room setup, but the old
-- client did not explicitly explain that display_name is public. Preserve the
-- visual work while asking for one truthful public-name confirmation.
UPDATE blumi_accounts
   SET onboarding_profile_complete = FALSE,
       onboarding_avatar_complete = TRUE,
       onboarding_room_complete = TRUE,
       onboarding_completed_at = NULL
 WHERE display_name <> ''
   AND age IS NOT NULL
   AND onboarding_completed_at IS NULL;
