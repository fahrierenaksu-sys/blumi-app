ALTER TABLE blumi_accounts
  ADD COLUMN IF NOT EXISTS profile_prompts JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE blumi_accounts
  DROP CONSTRAINT IF EXISTS blumi_profile_prompts_array_check;

ALTER TABLE blumi_accounts
  ADD CONSTRAINT blumi_profile_prompts_array_check
  CHECK (jsonb_typeof(profile_prompts) = 'array');
