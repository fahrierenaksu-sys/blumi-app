-- Additive and backward compatible (2026-10-02). Written for owner review:
-- apply only after a restore-tested backup (docs/release/MIGRATION_071_RUNBOOK.md).
-- Requires 070 (the migrator applies files in order). The binary that uses
-- hidden_through also runs before this migration: /ready treats this file as
-- optional, and the server probes the migration ledger and keeps "delete chat
-- for me" on the device only until the row exists. Older binaries never read
-- the new column.

-- 1. "Delete chat for me". NULL means never hidden; no backfill. Messages at
-- or before hidden_through are hidden from this participant only: the thread
-- leaves their list until a newer message arrives, and their history then
-- starts after it. The partner's view never changes.
ALTER TABLE blumi_chat_thread_participants
  ADD COLUMN IF NOT EXISTS hidden_through TIMESTAMPTZ;

-- 2. Supabase advisor "function_search_path_mutable": pin the search path of
-- every server-defined function. Each body names only public tables and
-- pg_catalog built-ins (md5, random, clock_timestamp, unnest, btrim).
ALTER FUNCTION blumi_valid_owned_item_ids(TEXT[]) SET search_path = public, pg_temp;
ALTER FUNCTION blumi_discovery_decision_quota(TEXT, TIMESTAMPTZ) SET search_path = public, pg_temp;
ALTER FUNCTION blumi_consume_discovery_decision(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) SET search_path = public, pg_temp;
ALTER FUNCTION blumi_rotate_push_registration() SET search_path = public, pg_temp;
ALTER FUNCTION blumi_invalidate_push_registration() SET search_path = public, pg_temp;
ALTER FUNCTION blumi_enqueue_room_revocation() SET search_path = public, pg_temp;
ALTER FUNCTION blumi_enqueue_block_revocation() SET search_path = public, pg_temp;
ALTER FUNCTION blumi_enqueue_moderation_revocation() SET search_path = public, pg_temp;
ALTER FUNCTION blumi_invalidate_discovery_watch_generation() SET search_path = public, pg_temp;
ALTER FUNCTION blumi_bound_realtime_payloads() SET search_path = public, pg_temp;

-- 3. Supabase advisor "unindexed_foreign_keys". The migrator runs each file
-- in one transaction, so CONCURRENTLY is not possible; each table is small
-- (a SHARE lock blocks its writes for milliseconds, bounded by lock_timeout).
CREATE INDEX IF NOT EXISTS blumi_account_recovery_requests_account_idx
  ON blumi_account_recovery_requests(account_id);
CREATE INDEX IF NOT EXISTS blumi_economy_iap_ledger_event_idx
  ON blumi_economy_iap_ledger(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS blumi_mini_rooms_completion_requested_by_idx
  ON blumi_mini_rooms(completion_requested_by_user_id);
