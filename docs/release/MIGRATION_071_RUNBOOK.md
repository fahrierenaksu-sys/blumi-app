# Migration 071 runbook — delete chat for me, Supabase advisor fixes

> **STATUS: WRITTEN, NOT APPLIED.** No database was touched. Apply only with
> the owner's explicit approval, after a restore-tested backup, and only after
> 070 (the migrator applies files in order; see the
> [070 runbook](./MIGRATION_070_RUNBOOK.md)).

File: `apps/server/db/migrations/071_chat_hide_for_me_and_advisor_fixes.sql`,
SHA-256 `a1088bee13ba03e3361726a7e43cc05c0047a1ba66fff5d45ecafa649d340794`
(what the migrator records in `blumi_migrations.checksum`). If the file changes
in review before it is applied, recompute it with `sha256sum` and update this
line in the same commit.

## What it adds

1. `blumi_chat_thread_participants.hidden_through TIMESTAMPTZ` (nullable, no
   default, no backfill): "delete chat for me". Messages at or before it are
   hidden from that participant only.
2. `ALTER FUNCTION ... SET search_path = public, pg_temp` on the ten functions
   the Supabase advisor flags (`function_search_path_mutable`):
   `blumi_valid_owned_item_ids(text[])`,
   `blumi_discovery_decision_quota(text, timestamptz)`,
   `blumi_consume_discovery_decision(text, text, text, timestamptz, timestamptz)`,
   and the trigger functions `blumi_rotate_push_registration`,
   `blumi_invalidate_push_registration`, `blumi_enqueue_room_revocation`,
   `blumi_enqueue_block_revocation`, `blumi_enqueue_moderation_revocation`,
   `blumi_invalidate_discovery_watch_generation`,
   `blumi_bound_realtime_payloads`. Each body uses only `public` tables and
   `pg_catalog` built-ins, so behaviour does not change.
3. Three indexes for the advisor's `unindexed_foreign_keys`:
   `blumi_account_recovery_requests_account_idx (account_id)`,
   `blumi_economy_iap_ledger_event_idx (provider, provider_event_id)`,
   `blumi_mini_rooms_completion_requested_by_idx (completion_requested_by_user_id)`.

Locks: the migrator runs the file in one transaction with `lock_timeout` 5 s,
so `CREATE INDEX CONCURRENTLY` is not possible. `ADD COLUMN` without default is
metadata-only (brief ACCESS EXCLUSIVE on the participants table). Each
`CREATE INDEX` holds a SHARE lock on its table (writes wait, reads continue)
while it builds; all three tables are tiny today (a few rows), so this is
milliseconds. `ALTER FUNCTION` takes a lock on the function only; triggers
pick up the setting on their next call.

## Deploy order (like 070, the binary ships first)

- `/ready` lists 071 in `OPTIONAL_READINESS_MIGRATIONS`
  (`apps/server/src/operations/schemaReadiness.ts`): no ledger row stays
  ready; a row with another checksum is refused.
- The chat repository asks a ledger probe (`chatHideSchema.ts`, cached 30 s)
  before any statement that names `hidden_through`. Until the row exists,
  thread lists and history keep their pre-071 SQL and
  `POST /v1/threads/:threadId/hide` answers 409 `CHAT_HIDE_UNAVAILABLE`.
- The app always hides the chat on the phone first (today's behaviour) and
  then calls the route. On 404 (older server), 409 (before 071) or any error,
  the on-device hide is the whole effect.

## Compatibility matrix

| | Database without 071 | Database with 071 |
|---|---|---|
| **Old binary** (before this change) | Current state. | **Compatible.** Never reads `hidden_through`; a hidden thread shows again on that binary (the app's on-device hide still hides it on the phone that deleted it). The functions and indexes are transparent. |
| **New binary** | **Compatible.** `/ready` 200, chat unchanged, hide answers 409, the app hides on the device only. | **Target.** Hide is server-side: every device of the account, history starts after the hide point when a newer message brings the thread back. |

Proven by `apps/server/src/db/chatHidePreMigration.postgres.test.ts` (rolls the
column and ledger row back in a disposable database, runs chat and `/ready`,
then applies 071 with the migrator and sees hide switch on without a restart),
`chatRepository.contract.test.ts` (memory and PostgreSQL),
`chatHideRoutes.test.ts`, and `databaseAdvisorGuards.postgres.test.ts` (every
`public` function pins `search_path`, every foreign key has a covering index).

## Steps

| # | Step | Who |
|---|---|---|
| 0 | 070 is applied and verified (its runbook). | Owner + operator |
| 1 | Merge the reviewed change to `main`; confirm the Railway deployment commit; `/health` and `/ready` 200. The hide stays on-device. | Owner |
| 2 | PostgreSQL 17 dump of production and a restore test (`DATABASE_RELEASE_RUNBOOK.md`). Record the archive path and SHA-256 there. Confirm the host and port of Railway's `DATABASE_URL` without reading the password. | Owner |
| 3 | Owner approval in the conversation, naming this file and its SHA-256. | Owner |
| 4 | Preflight (below). Stop if any check differs. | Operator |
| 5 | Apply: `npm run db:migrate` against production, or the same transaction by hand (`BEGIN`, `SET LOCAL lock_timeout = '5000ms'`, `SELECT pg_advisory_xact_lock(hashtextextended('blumi:migrations', 0))`, the file's SQL, `INSERT INTO blumi_migrations (id, checksum) VALUES ('071_chat_hide_for_me_and_advisor_fixes.sql', '<sha above>')`, `COMMIT`). | Operator, owner approval |
| 6 | Verify (below). Within 30 s the running binary's probe sees 071; no restart. Then add the file and its SHA-256 to `apps/server/db/migrations.applied.json` in the commit that records the apply. | Operator |
| 7 | Re-run the Supabase advisors: `function_search_path_mutable` and `unindexed_foreign_keys` should list none of the items above. | Operator |
| 8 | On a phone: long-press a chat → Sohbeti sil. It disappears on both of the account's devices; the partner still sees it. The partner sends a message: the chat returns with only that message. | Owner |

## Preflight (read-only)

```sql
SELECT count(*) FROM blumi_migrations;                                          -- 70 (after 070)
SELECT id FROM blumi_migrations WHERE id LIKE '071_%';                          -- none
SELECT checksum FROM blumi_migrations WHERE id = '070_chat_delivery_receipts.sql'; -- 070's SHA
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'blumi_chat_thread_participants' AND column_name = 'hidden_through'; -- none
SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'blumi\_%';                      -- the ten functions above
SELECT count(*) FROM pg_stat_activity
 WHERE state <> 'idle' AND xact_start < now() - interval '60 seconds';           -- 0
```

## Verification after apply

```sql
SELECT id, checksum FROM blumi_migrations WHERE id = '071_chat_hide_for_me_and_advisor_fixes.sql';
SELECT column_name, is_nullable FROM information_schema.columns
 WHERE table_name = 'blumi_chat_thread_participants' AND column_name = 'hidden_through'; -- YES
SELECT count(*) FROM blumi_chat_thread_participants WHERE hidden_through IS NOT NULL;   -- 0
SELECT p.proname, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'blumi\_%';      -- each {"search_path=public, pg_temp"}
SELECT indexname FROM pg_indexes WHERE indexname IN (
  'blumi_account_recovery_requests_account_idx',
  'blumi_economy_iap_ledger_event_idx',
  'blumi_mini_rooms_completion_requested_by_idx');                                       -- 3 rows
```

Then `/ready` 200 and one chat list and history read in the app.

## Rollback

The new binary runs on either schema, so the objects can stay. Hidden chats
would simply show again if the column were removed; the phone that deleted a
chat still hides it on the device. To remove the column (loses every hide
point), keep this order: delete the ledger row first, wait at least 60 s so
every running probe has switched to the pre-071 SQL, then drop it.

```sql
DELETE FROM blumi_migrations WHERE id = '071_chat_hide_for_me_and_advisor_fixes.sql';
-- wait at least 60 seconds, then:
ALTER TABLE blumi_chat_thread_participants DROP COLUMN IF EXISTS hidden_through;
```

The function settings and indexes need no rollback (they change no results).
If one must be undone: `ALTER FUNCTION <signature> RESET search_path;` and
`DROP INDEX IF EXISTS <name>;`. Re-applying 071 after a rollback is safe: every
statement is idempotent (`IF NOT EXISTS`, `ALTER FUNCTION ... SET`).

## Open

- Native verification of the Inbox delete on two phones (step 8).
- Room invitations in a hidden chat's timeline are not hidden; only messages
  are. The thread preview (`lastMessage`) of `POST /v1/threads` for an existing
  thread is not filtered either (the app does not show it for a hidden chat).
- Two messages in the same millisecond as the hide point are both hidden
  (the point is a time, like the 070 cursors' known limit).
