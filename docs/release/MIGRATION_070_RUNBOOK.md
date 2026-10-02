# Migration 070 runbook — chat delivery and read receipts

> **STATUS: WRITTEN, NOT APPLIED.** No database was touched. Apply only with
> the owner's explicit approval, after a restore-tested backup.
>
> **2026-10-02:** the code that tolerates 070 is on `main` and deployed (`main`
> @ `76a195e`, Railway deployment `8909a8ee`, SUCCESS 2026-10-01 23:56 UTC;
> `/health` and `/ready` 200). The ledger still has 69 rows and no 070 row
> (read-only check). Step 1 is therefore done; step 2 is next.

File: `apps/server/db/migrations/070_chat_delivery_receipts.sql`, SHA-256
`48c21b7964a69a04fb328f1b3d597e2b7b6f7fbdcaee48c9b48f7391ce492dd1` (what the
migrator records in `blumi_migrations.checksum`). It requires 069 (the
migrator applies files in order).

## What it adds

- `blumi_chat_thread_participants`: three nullable columns,
  `last_delivered_at`, `last_delivered_message_id`, `last_read_message_id`,
  and two CHECK constraints (the delivery cursor is both columns or neither;
  a read message id needs `last_read_at`). No default, no backfill.
- `blumi_chat_privacy_preferences (user_id PK → blumi_accounts ON DELETE
  CASCADE, read_receipts_enabled boolean NOT NULL DEFAULT false, updated_at)`,
  RLS on, no grant to `PUBLIC`, `anon`, `authenticated`. A missing row means
  read receipts off.

Locks: `ADD COLUMN` without default is metadata-only but takes a brief
ACCESS EXCLUSIVE lock on the participants table; each `ADD CONSTRAINT ...
CHECK` scans that table once under the same lock (two rows per thread, tiny
today). The migrator's `lock_timeout` (5 s) bounds the wait. No other table
is locked.

## Deploy order (this migration is the exception to "migrate, then deploy")

The binary that uses 070 ships **before** it:

- `/ready` lists 070 in `OPTIONAL_READINESS_MIGRATIONS`
  (`apps/server/src/operations/schemaReadiness.ts`): a database without the
  ledger row stays ready; a row with another checksum is still refused.
- The chat repository asks a ledger probe (`chatReceiptSchema.ts`, cached
  30 s) before any statement that names a 070 object. Until the row exists,
  reads keep the pre-070 SQL and the receipt methods answer without a query.
- The `chat_read_receipts` capability carries a runtime gate on the same
  probe, so a manifest that enables it early cannot switch it on.

## Compatibility matrix

"Old binary" = the server on `main` before this change; "new binary" = this
change.

| | Database without 070 (today) | Database with 070 |
|---|---|---|
| **Old binary** | Current state. | **Compatible.** Never reads the new objects. Its read call moves `last_read_at` only; a stale `last_read_message_id` can only affect two messages sent in the same millisecond. Account deletion removes the preference row through the FK. |
| **New binary** | **Compatible.** `/ready` 200, chat, history, reads and unread counts unchanged; no receipt events, no `partnerReceipts`, `GET /v1/chat-preferences` says `available: false`, `PUT` answers 409 `CHAT_RECEIPTS_UNAVAILABLE`, delivery acks are dropped silently. | **Target.** Receipts work for accounts in the `chat_read_receipts` rollout. |

Proven by `apps/server/src/db/chatReceiptsPreMigration.postgres.test.ts`
(rolls 070 back in a disposable database, runs chat and `/ready` on it, then
applies 070 with the migrator and sees receipts switch on without a restart),
`postgresChatRepository.test.ts` (no pre-070 query names a 070 object),
`chatReceiptRoutes.test.ts` and `chatReceiptService.test.ts`.

## Steps

| # | Step | Who |
|---|---|---|
| 1 | Merge the reviewed change to `main`; confirm the Railway deployment commit; `/health` and `/ready` 200. Receipts stay off. | Owner |
| 2 | PostgreSQL 17 dump of production and a restore test (`DATABASE_RELEASE_RUNBOOK.md`). Record the archive path and SHA-256 in `DATABASE_RELEASE_RUNBOOK.md`, and confirm the host and port of Railway's `DATABASE_URL` without reading the password. | Owner |
| 3 | Preflight: 69 ledger rows, no 070 row, none of the new columns or table, no transaction older than 60 s. | Operator |
| 4 | Apply: `npm run db:migrate` against production, or the same transaction by hand as for 068 (`BEGIN`, `SET LOCAL lock_timeout = '5000ms'`, `pg_advisory_xact_lock(hashtextextended('blumi:migrations', 0))`, the file's SQL, the ledger row with the checksum above, `COMMIT`). | Operator, owner approval |
| 5 | Verify (below). Within 30 s the running binary's probe sees 070; a restart is not needed. Then add `070_chat_delivery_receipts.sql` and its SHA-256 to `apps/server/db/migrations.applied.json` in the commit that records the apply, so the migration ledger test locks it. | Operator |
| 6 | Roll out with `BLUMI_CAPABILITY_MANIFEST`, e.g. `{"rollouts":{"db_chat_metadata_ready":100,"chat_read_receipts":"internal"},"internalUserIds":["<owner>","<tester>"]}`, then 5 → 25 → 100. Keep every existing rollout entry. | Owner |
| 7 | Ship the mobile build that declares `chat_read_receipts` (JavaScript only; no native change). | Owner |
| 8 | Two phones: ✓ when sent, ✓✓ when the other phone is in the foreground or opens the chat, "görüldü" only after both turn on Settings → Gizlilik → Okundu bilgisi. Turning it off on either phone hides it on both after their next refresh. | Owner |

## Verification after apply

```sql
SELECT id, checksum FROM blumi_migrations WHERE id = '070_chat_delivery_receipts.sql';
SELECT column_name, is_nullable FROM information_schema.columns
 WHERE table_name = 'blumi_chat_thread_participants'
   AND column_name IN ('last_delivered_at', 'last_delivered_message_id', 'last_read_message_id');
SELECT relrowsecurity FROM pg_class WHERE relname = 'blumi_chat_privacy_preferences';
SELECT has_table_privilege('anon', 'blumi_chat_privacy_preferences', 'SELECT'); -- false
SELECT count(*) FROM blumi_chat_privacy_preferences;                          -- 0
```

## Rollback

First remove `chat_read_receipts` from the manifest (receipts stop at once).
The new binary runs on either schema, so the columns can stay. To remove
them (loses cursors and settings), keep this order: delete the ledger row
first, wait at least 60 s so every running probe has switched to the pre-070
SQL, then drop the objects. Dropping them while the probe still sees the row
would fail thread lists and reads for up to 30 s.

```sql
DELETE FROM blumi_migrations WHERE id = '070_chat_delivery_receipts.sql';
-- wait at least 60 seconds, then:
ALTER TABLE blumi_chat_thread_participants
  DROP CONSTRAINT IF EXISTS blumi_chat_participants_delivered_cursor_check,
  DROP CONSTRAINT IF EXISTS blumi_chat_participants_read_cursor_check,
  DROP COLUMN IF EXISTS last_delivered_at,
  DROP COLUMN IF EXISTS last_delivered_message_id,
  DROP COLUMN IF EXISTS last_read_message_id;
DROP TABLE IF EXISTS blumi_chat_privacy_preferences;
```

## Query cost (disposable cluster, 2,000 threads, 80,000 messages)

`EXPLAIN (ANALYZE, BUFFERS)`: a delivery cursor move uses the participant
`(user_id, thread_id)` index and the message primary key, 6 shared buffers,
0.09 ms. Receipt participants for a 50-thread page use the
`(thread_id, participant_order)` index, 103 buffers, 0.85 ms. Each thread
page gains one such query while receipts are enabled; a delivery ack is one
statement plus one block check when the cursor moved.

## Open before a wide rollout

- The privacy notice (`apps/mobile/src/features/legal/legalCopy.ts`, versioned)
  does not yet describe delivery and read receipts. Owner/legal decision.
- Native (Simulator and two-phone) verification of ticks, the crossfade, the
  Settings switch and VoiceOver labels.
