ALTER TABLE blumi_mini_rooms
  ADD COLUMN IF NOT EXISTS completion_reward_date DATE,
  ADD COLUMN IF NOT EXISTS completion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_requested_by_user_id TEXT
    REFERENCES blumi_accounts(user_id) ON DELETE SET NULL;

ALTER TABLE blumi_mini_rooms
  DROP CONSTRAINT IF EXISTS blumi_mini_rooms_completion_intent_check;

ALTER TABLE blumi_mini_rooms
  ADD CONSTRAINT blumi_mini_rooms_completion_intent_check CHECK (
    (completion_reward_date IS NULL AND completion_requested_at IS NULL)
    OR
    (completion_reward_date IS NOT NULL AND completion_requested_at IS NOT NULL)
  );
