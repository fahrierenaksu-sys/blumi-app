# Account deletion and safety evidence: design for the owner (2026-10-01)

Status: **design only**. No file was added to `apps/server/db/migrations`; nothing
was applied to Supabase. The code change described in "Done without a
migration" is implemented and tested on this branch.

Findings closed or narrowed: DB_HEALTH_AUDIT DB-15, INTERACTION_WAVE_STATUS
"P1 privacy/safety: Hesap silme açık raporları ve kanıtı siliyor; aynı
telefonla temiz kayıt mümkün".

## 1. Problem

`deleteAccountData` (`apps/server/src/db/postgresAuthRepository.ts`) ran
`DELETE FROM blumi_safety_reports WHERE actor_user_id = $1 OR reported_user_id = $1`.

1. A reported person could erase the open reports against them by deleting
   the account, before a moderator looked at them.
2. Only a **ban** survives deletion (migration 069 phone-ban HMAC). A
   **suspended** person, or a person with open reports, could delete and sign
   up again with the same phone number with a clean, active account.
3. A moderator resolving a report after the reported account was deleted got
   `resolved/ban` back although no account was banned and no phone ban could be
   derived (the number is gone).

## 2. Done without a migration (this branch)

| Change | Where | Test |
|---|---|---|
| Open (`status = 'pending'`) reports **against** the deleted account are kept; the account's own reports and closed reports about it are still deleted. `blumi_safety_reports` has no FK to accounts, so no schema change is needed. | `postgresAuthRepository.ts` `deleteAccountData` | `db/accountDeletionIntegrity.postgres.test.ts` (failed first: the pending report was deleted) |
| A `suspend`/`ban` of a report whose account no longer exists is refused with `409` ("dismiss or warn instead"); the report stays pending. PostgreSQL locks the reported account row (`FOR UPDATE`) in the same statement, so a ban racing a deletion is either committed first (deletion then sees `banned` and writes the 069 phone ban, as before) or finds the row gone and is refused. Never a silent "banned" record for nobody. | `postgresSafetyRepository.ts` `resolveReport`, `safetyService.ts` `ReportedAccountDeletedError`, `adminRoutes.ts` | same PostgreSQL test (repository and service), `safety/safetyService.adminResolution.test.ts` (in-memory, via `isKnownUser`) |
| The existing phone-ban carry-over for a **banned** account is unchanged and now consistent with the refusal above. | — | existing 069 tests |

The schema-wide orphan scan in `accountDeletionIntegrity.postgres.test.ts`
now expects exactly one intentional survivor, `blumi_safety_reports.reported_user_id`
on pending rows, next to the two work queues.

What is still open without a schema change:

- A **suspended** account that is deleted leaves no record of the suspension;
  the same number signs up again active. The 069 table cannot hold it: its
  rows are permanent bans (`source IN ('account_deletion','phone_change')`, no
  expiry) and every binary since 069 treats any matching row as a ban.
- The kept pending reports name a `user_id` that no longer resolves; there is
  no link from them to the phone number, so a later ban decision cannot reach a
  re-registered account.
- Kept reports have no retention limit yet.

## 3. Proposed migration 071 (additive)

Name: `071_deleted_account_safety_holds.sql`. Written by the owner's release
process (never edit or renumber existing files; `032` is doubled and `044` is
missing on purpose).

```sql
-- Additive: one new table that every earlier binary ignores.
-- A deleted account that was suspended or had open reports against it leaves
-- a time-limited hold keyed by the keyed phone hash (the same HMAC as 069,
-- apps/server/src/auth/moderationPhoneBan.ts). The plain number is never stored.
CREATE TABLE IF NOT EXISTS blumi_deleted_account_safety_holds (
  previous_user_id TEXT PRIMARY KEY,
  phone_hash TEXT NOT NULL
    CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  suspended_until TIMESTAMPTZ,
  successor_user_id TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  retain_until TIMESTAMPTZ NOT NULL,
  CHECK (retain_until > deleted_at),
  CHECK (suspended_until IS NULL OR suspended_until <= retain_until)
);

CREATE INDEX IF NOT EXISTS blumi_deleted_account_safety_holds_phone_idx
  ON blumi_deleted_account_safety_holds (phone_hash);
CREATE INDEX IF NOT EXISTS blumi_deleted_account_safety_holds_retain_idx
  ON blumi_deleted_account_safety_holds (retain_until);

ALTER TABLE blumi_deleted_account_safety_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE blumi_deleted_account_safety_holds
  FROM PUBLIC, anon, authenticated;
```

Why a new table and not new columns on `blumi_moderation_phone_bans`: the
deployed binary reads any row there as a permanent ban
(`CASE WHEN EXISTS (SELECT 1 FROM blumi_moderation_phone_bans …) THEN 'banned'`).
A suspension hold written there would turn into a permanent ban under a
rolled-back binary. A separate table is invisible to older binaries, so the
migration is safe to apply before or after the binary.

### Lock analysis

- `CREATE TABLE` and the two `CREATE INDEX` statements touch only the new,
  empty relation. No lock is taken on `blumi_accounts`, `blumi_safety_reports`
  or `blumi_moderation_phone_bans`; no table rewrite; no `VALIDATE` scan.
- `ENABLE ROW LEVEL SECURITY` and `REVOKE` take `ACCESS EXCLUSIVE` on the new
  table only (no readers exist yet).
- Runs inside the migrator's per-file transaction with `SET LOCAL lock_timeout`
  (default 5 s, `BLUMI_MIGRATION_LOCK_TIMEOUT_MS`); expected duration is
  milliseconds. `CREATE INDEX CONCURRENTLY` is unnecessary on an empty table.

### Rollback

```sql
DROP TABLE IF EXISTS blumi_deleted_account_safety_holds;
```

Only after the binary that writes the table has been rolled back (that binary's
`/ready` would otherwise refuse the schema, or, if 071 is listed in
`OPTIONAL_READINESS_MIGRATIONS`, its ledger probe turns the feature off).
Dropping loses the holds: export them first if any exist
(`COPY (SELECT * FROM blumi_deleted_account_safety_holds) TO STDOUT`). The
ledger row in `blumi_migrations` must be removed in the same maintenance step
or `/ready` reports a checksum mismatch.

### Compatibility matrix

| Database \ Binary | Current (`develop`) | Binary that uses 071 |
|---|---|---|
| Without 071 | Works (this branch's behaviour) | Optional-readiness probe keeps holds off (recommended), or `/ready` 503 if 071 is required |
| With 071 | Works; table ignored | Full behaviour |

Recommended: list 071 in `OPTIONAL_READINESS_MIGRATIONS` with a ledger probe,
as 070 does (`MIGRATION_070_RUNBOOK.md`), so binary and schema can ship in
either order.

## 4. Behaviour with 071 (code to write after approval)

1. **Deletion** (`deleteAccountData`, same transaction, after the account row
   is locked `FOR UPDATE`): if the account is suspended with
   `suspended_until > now`, or any pending report names it, insert a hold with
   `phone_hash = phoneBanHash(phone)`,
   `suspended_until` (null when only reports are open) and
   `retain_until = GREATEST(suspended_until, now + retention)`.
   A banned account keeps using the 069 phone ban (unchanged).
2. **Sign-up** (`signInWithVerifiedPhone` account insert): look up live holds
   for the phone hash (`retain_until > now`). If the latest
   `suspended_until > now`, create the account `suspended` until that time
   (the same CASE pattern as the 069 ban). Set `successor_user_id` on the
   holds so moderators can see the earlier reports against the same number.
3. **Report resolution** against a deleted account: `ban` writes the 069 phone
   ban from the hold's `phone_hash` (and bans the successor account, if any);
   `suspend` extends the hold's `suspended_until` (and suspends the successor).
   This replaces the `409` refusal from section 2 when a hold exists.
4. **Retention** (`db/postgresRetention.ts`, bounded `SKIP LOCKED` batches):
   delete holds with `retain_until < now`, and pending reports whose reported
   account no longer exists and that are older than the retention period
   (they then get no decision; the moderator SLA is hours, so this should be
   empty in practice).
5. Admin view: mark a report whose reported account was deleted, and show the
   successor link.

Tests to add with it: PostgreSQL deletion of a suspended account writes a hold;
sign-up with the same number starts suspended until the same time and after
expiry starts active; ban of a retained report bans the phone and the
successor; retention removes expired holds; rollback-binary compatibility
(old binary with 071 applied).

## 5. Owner decisions needed

1. **Retention period** for kept reports and holds (proposal: 180 days after
   deletion, or the end of an active suspension if later). Legal/privacy to
   confirm against the privacy text, which today says deletion removes
   "safety … records, except information that must be segregated and retained
   by law or for a documented legal hold" (`apps/mobile/src/features/legal/legalCopy.ts`).
   Keeping open reports about a deleted account is that kind of segregated
   safety record, but the text should name it and its period.
2. Whether open reports **filed by** a deleting member against someone else
   are kept as well (today they are deleted with the reporter's data). Keeping
   them protects third parties; it retains the reporter's note.
3. Whether a blocked pair survives deletion (today the reporter's block of the
   deleted account is removed; a re-registered account has a new id and can be
   discovered by the reporter again). A hold-based block would need the
   reporter's consent model.
4. Deletion during an active suspension stays allowed (App Store 5.1.1(v)
   requires in-app deletion); 071 carries the suspension instead of refusing
   the deletion. Confirm.

## 6. Status labels

- **Implemented / Tested**: section 2 (named tests above, real PostgreSQL 16
  through `scripts/security/postgres-gate.mjs` as `pgtest`).
- **Design only / Open**: sections 3–5. Not applied, not deployed.
