# Migration 069 note — moderation phone bans

> **STATUS: NOT APPLIED** anywhere (2026-09-30). Nothing was run against
> Supabase or Railway. Apply it **before** deploying the binary that ships it:
> that binary's `/ready` compares every packaged migration checksum
> (`apps/server/src/operations/schemaReadiness.ts`) and answers 503 until 069
> is in the ledger. Same ordering and approvals as 068: owner approval,
> PostgreSQL 17 dump plus restore test, migrate, then a separate deploy
> approval ([`MIGRATION_068_RUNBOOK.md`](./MIGRATION_068_RUNBOOK.md),
> [`DATABASE_RELEASE_RUNBOOK.md`](./DATABASE_RELEASE_RUNBOOK.md)).

File: `apps/server/db/migrations/069_moderation_phone_bans.sql`. It requires
068 (the migrator applies files in order).

## What it adds

One new table, nothing else:

```sql
CREATE TABLE IF NOT EXISTS blumi_moderation_phone_bans (
  phone_hash TEXT PRIMARY KEY CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  source TEXT NOT NULL CHECK (source IN ('account_deletion', 'phone_change')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
-- plus ENABLE ROW LEVEL SECURITY and REVOKE ALL FROM PUBLIC, anon, authenticated
```

Creating an empty table takes no lock on existing tables and rewrites no
data. The current live binary never reads it, so applying 069 first is safe;
rolling the binary back does not require removing the table.

## Behaviour of the binary that needs it

- Deleting an account that is **banned** at that moment, or moving a banned
  account to another phone number, stores
  `HMAC-SHA256(BLUMI_OTP_HMAC_SECRET, "blumi:moderation-phone-ban:v1\0" + E.164)`
  in the same transaction (`apps/server/src/auth/moderationPhoneBan.ts`). The
  plain number is never stored.
- A **new** account created for a number with a record starts with
  `moderation_status = 'banned'`, so product routes answer
  `403 ACCOUNT_BANNED` as they did for the original account. Existing
  accounts are never changed by a record.
- Suspensions (time-limited) and warnings are not recorded.

## Retention and operations

- Records are kept until an administrator removes them. There is no admin
  route or UI; removal is a reviewed
  `DELETE FROM blumi_moderation_phone_bans WHERE phone_hash = '<hash>'`, where
  the operator computes the hash with the server secret.
- Rotating `BLUMI_OTP_HMAC_SECRET` makes every existing record unmatchable
  (bans silently lapse). Rotate only with a plan to re-key or accept that.
- No reason field is stored; the source says which flow created the record.

## Verification after apply

```sql
SELECT id, checksum FROM blumi_migrations WHERE id = '069_moderation_phone_bans.sql';
SELECT relrowsecurity FROM pg_class WHERE relname = 'blumi_moderation_phone_bans';
SELECT has_table_privilege('anon', 'blumi_moderation_phone_bans', 'SELECT');  -- false
SELECT count(*) FROM blumi_moderation_phone_bans;                             -- 0
```

Local evidence: the disposable PostgreSQL gate applies 001–069 from empty and
reruns as a no-op; `apps/server/src/db/authPhoneBan.contract.test.ts` runs the
behaviour against the in-memory and PostgreSQL repositories.
