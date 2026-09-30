# Migration 068 runbook — session reuse detection and Firebase uid binding

> **STATUS: NOT APPLIED — awaiting owner approval.**
> Prepared 2026-09-30. The owner decided that this phase applies nothing to
> Supabase and deploys nothing. Every step below that writes to a database or
> deploys a binary needs a separate, explicit owner approval at the time it runs.

This runbook covers one migration,
`apps/server/db/migrations/068_session_reuse_detection_and_firebase_uid.sql`
(SHA-256 `a475eecbf15c0cb7d0ee7e06ff84d5cdae9269299590b843b19fc84a3647e0ee`),
and the server binary that needs it (commit `150915f` and later on the
integration branch `claude/busy-cray-dl5wvr`). It follows the conventions of
[`DATABASE_RELEASE_RUNBOOK.md`](./DATABASE_RELEASE_RUNBOOK.md). The status
summary is in [`LAUNCH_CONTROL.md`](./LAUNCH_CONTROL.md). The security rationale
is in [`THREAT_MODEL_2026-09-30.md`](../security/THREAT_MODEL_2026-09-30.md)
(rows S "Stolen or replayed session token" and "Recycled or taken-over phone
number", risks R1–R3).

## 1. Target environment (read-only facts, 2026-09-30)

| Item | Value |
| --- | --- |
| Database | Supabase project "Blumi", ref `nkqcbxufbhfibrgvajim`, PostgreSQL 17.6 |
| Classification | Test/staging database behind the Railway staging API. It is **not** production |
| Migration ledger | `blumi_migrations` holds 67 rows; the latest is `067_realtime_connection_leases.sql`. 068 is not applied |
| Schema | `blumi_accounts.firebase_uid` does not exist |
| Data | 18 accounts, 1 session row (1 live). `blumi_sessions` is 80 kB and `blumi_accounts` is 128 kB |
| API | Railway runs one replica, deployed from `main` (the source is at `2a55475`; the **live deployment commit is unverified**). The healthcheck is `/ready` with a 300 s timeout (`.railway/railway.ts`). `/ready` compares every packaged migration checksum (`apps/server/src/operations/schemaReadiness.ts`) |
| Backups | Supabase PITR and daily-backup availability for this project is **unknown**. Treat the owner-controlled `pg_dump` in step 3 as the only restore point you can rely on |

## 2. Schema change and locks

```sql
ALTER TABLE blumi_sessions
  ADD COLUMN IF NOT EXISTS family_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replaced_by_token_hash TEXT;
ALTER TABLE blumi_accounts
  ADD COLUMN IF NOT EXISTS firebase_uid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS blumi_accounts_firebase_uid_key
  ON blumi_accounts(firebase_uid) WHERE firebase_uid IS NOT NULL;
```

The change is additive. All four columns are nullable and have no default,
and existing rows are not updated.

**Locks.** `apps/server/src/db/migrate.ts` wraps each file in one transaction and
also takes a session-level advisory lock (`blumi:migrations`). In the rehearsal,
068 held these relation locks until COMMIT:

- `blumi_sessions`: `AccessExclusiveLock`, from `ALTER TABLE … ADD COLUMN`.
- `blumi_accounts`: `AccessExclusiveLock` from `ALTER TABLE`, plus
  `ShareLock` from `CREATE UNIQUE INDEX`.

Adding a nullable column with no default only changes the catalog; the table is
not rewritten. The index build scans 18 rows. The migration held these locks for
milliseconds: `runMigrations` took 45 ms end to end, including the checksum pass
over the 67 existing files.

**The real risk is waiting to get the lock, not holding it.** An
`AccessExclusiveLock` request waits behind any open transaction that has touched
either table. While it waits, it blocks every new query on those tables, and
every authenticated request reads `blumi_sessions`. The migration therefore runs
with `lock_timeout=5s`, passed through `PGOPTIONS`. node-postgres reads that
variable, and the rehearsal confirmed it. If the timeout fires, the transaction
rolls back completely: no columns are added and the ledger still has 67 rows.
The rehearsal proved this with an open reader and a 1.5 s timeout.

**`CONCURRENTLY` is neither needed nor possible here.** `CREATE INDEX
CONCURRENTLY` cannot run inside a transaction block, and the migrator always
opens one. With 18 rows, a plain build is instant. Reconsider only if a later
environment has a large `blumi_accounts` table. In that case, write a separate
reviewed migration; never edit 068, because applied checksums are immutable.

**Supabase connection.** Use the **session pooler** URL, with user
`postgres.nkqcbxufbhfibrgvajim` on port 5432, and TLS (`sslmode=require` or
`verify-full`). Never use the transaction pooler on port 6543: a session-level
advisory lock and a multi-statement transaction are unsafe through it. The audit
script accepts only a URL whose username ends in the project ref. Whether
Supavisor forwards `PGOPTIONS` is **unverified**, so step 4a checks it before
anything is applied.

## 3. Compatibility matrix

"Old binary" means the server at `2a55475`, the source currently on `main`, with
migrations through 067. The same results were obtained for `785a86c`. "New
binary" means this branch, with 068.

| | 067 database (today) | 068 database |
| --- | --- | --- |
| **Old binary** | Current state. `/ready` 200. | **Compatible.** `/ready` 200: the old manifest ignores the extra 068 ledger row. Sign-up, sign-in, session read, refresh and account deletion work. The old binary's own 22 PostgreSQL suites pass on 068 (45 tests; one explained exception, see §6). Differences: successors it issues on refresh have `family_expires_at` NULL, so the 90-day cap resets until the next new-binary rotation. It never binds a uid. **Its phone change does not clear `firebase_uid`**, see §8. |
| **New binary** | **Not ready.** `/ready` returns 503 ("migrations are incomplete"), so the Railway healthcheck fails and the deployment is not promoted. If the gate were bypassed, every session lookup would fail, because the new `SESSION_COLUMNS` select columns that do not exist yet (known from the code, not rehearsed). | **Target state.** `/ready` 200. Reuse detection, the family lifetime cap and uid binding are active. |

Order is therefore fixed: **migrate first, then deploy.** The old binary can keep
serving while and after 068 is applied.

## 4. Effect on existing data

These results come from the rehearsal (§6) and the code in
`apps/server/src/auth/authRepository.ts` (`planSessionRotation`) and
`apps/server/src/db/postgresAuthRepository.ts`.

- **Sessions created before 068.** `family_expires_at`, `rotated_at` and
  `replaced_by_token_hash` are NULL.
  - A live legacy token keeps working until its existing `expires_at` (30 days
    after issue).
  - On its first refresh by the new binary, the family is **anchored** at
    rotation time + 90 days. The presented row becomes a tombstone
    (`rotated_at` = now, `replaced_by_token_hash` = successor).
  - Tokens that the old binary rotated before 068 only have
    `expires_at = rotation time`. If presented again, they are **rejected as
    expired (401), not treated as reuse**, so their family is not revoked.
  - **Reuse detection starts only after a family's first post-068 rotation.**
- **The one live session.** Nothing changes until the mobile app refreshes it.
  `apps/mobile/src/features/session/sessionRefresh.ts` `shouldRefreshSessionSoon`
  refreshes only within 24 h of expiry, on launch or foreground. After that the
  family ends 90 days from the refresh.
  - If the app does not open before the token expires, the member signs in again
    (unchanged behaviour).
  - The client deduplicates concurrent refreshes (`createSessionRefreshCoordinator`).
    A retry of a lost response inside 30 s is honoured.
  - Any later reuse returns 401 "Sign in again to continue."; the client then
    clears the stored session (`useSessionState`) and the server publishes a
    realtime revocation.
- **Accounts without `firebase_uid`** (all 18 after 068).
  - The uid binds on the account's **next verified Firebase sign-in**.
  - After binding, a completion with a different uid returns
    **409 `ACCOUNT_RECOVERY_REQUIRED`**, writes nothing, and queues a manual
    recovery request.
  - Accounts that never sign in again, such as test personas, stay NULL, which
    is harmless.
  - The mobile client shows the server's English message. There is no dedicated
    recovery screen and no Turkish copy (open, §10).
  - A completed phone change on the new binary clears the binding.

## 5. Backup plan

1. **Platform backups.** In the Supabase dashboard (Database → Backups), record
   whether PITR or daily backups exist for `nkqcbxufbhfibrgvajim`, and the
   latest restore point. If they are not available, write "unavailable" down;
   do not assume they exist.
2. **Owner-controlled archive (required).** Use PostgreSQL **17** client tools.
   `pg_dump` 16 refuses a 17.6 server.

   ```bash
   export PG17=/opt/homebrew/opt/postgresql@17/bin
   read -rs DATABASE_URL && export DATABASE_URL   # session-pooler URL, never echoed or saved
   $PG17/pg_dump --version                        # must print 17.x
   ARCHIVE=/Users/evrenevren/BlumiReleaseBackups/supabase-public-pre-068-$(date +%F).dump
   $PG17/pg_dump --dbname "$DATABASE_URL" --format=custom --schema=public --no-owner --file "$ARCHIVE"
   chmod 600 "$ARCHIVE" && shasum -a 256 "$ARCHIVE"
   ```

   The archive covers the whole `public` schema, which includes both affected
   tables. It is local owner-only material and not an offsite backup. Record
   its path and SHA-256 in `DATABASE_RELEASE_RUNBOOK.md`.
3. **Restore verification (required before step 4).** From a clean checkout of
   the release commit:

   ```bash
   BLUMI_PG17_BIN=/opt/homebrew/opt/postgresql@17/bin \
     node scripts/security/restore-upgrade-gate.mjs "$ARCHIVE"
   ```

   The gate restores into its own disposable PostgreSQL 17 cluster, replays 059,
   **applies 068 to the restored copy**, reruns the migrator idempotently and
   audits grants and data.

   Expected result: `beforeMigrations: 67`, `applied: 1`, `rerunApplied: 0`,
   `accounts: 18`, and no findings. This is the real-data rehearsal of 068.
4. **Before any schema rollback** (§8), take a second archive, `…-post-068-…`,
   so that uid bindings and rotation markers can be recovered.

## 6. Rehearsal evidence (2026-09-30, disposable PostgreSQL 16)

Command, repeatable, needs PostgreSQL server tools on `PATH`:

```bash
node scripts/security/migration-068-rehearsal.mjs [old-ref=2a55475] [--old-suite]
```

The script never reads `DATABASE_URL`. It creates its own cluster in
`$TMPDIR/blumi-pg-gate-068-rehearsal-*` and deletes it on success. It archives
the old server source with `git archive <old-ref>` and runs the old code paths
themselves, not copies of their SQL.

| Step | Result |
| --- | --- |
| a1 | The **old** migrator applied 001–067 from empty (67 files). |
| a2 | The **old** binary seeded 5 accounts and 7 sessions (4 live): a live session, an expired session, a family rotated twice, an account later deleted, and an unbound account. |
| c1 | 067-only database: **new binary `/ready` 503**, old binary `/ready` 200. |
| backup | A custom-format `public` archive was restored into a new database with `--no-owner --no-privileges` and 059 replayed. Counts were identical (5/7/67). 068 applied to the copy and its `/ready` returned 200. |
| lock | With an open reader transaction on `blumi_sessions`, `PGOPTIONS='-c lock_timeout=1500'` aborted 068 after about 1.5 s with no columns and 67 ledger rows. Lock modes are as listed in §2. |
| a3 | The new migrator applied **only** 068 (67 skipped). The 67 prior checksums were unchanged. The rerun applied 0 and left the ledger byte-identical. Columns are nullable with no defaults, the partial unique index is present, and 0 legacy markers exist. |
| c2 | 068 database: **new binary `/ready` 200** and old binary `/ready` 200. |
| b1 | Old binary on 068: session read, sign-up, sign-in, refresh and account deletion all succeeded. |
| effect | Legacy tombstones and the expired token were rejected with no revocation. The live legacy session rotated and was anchored at +90 d. A grace retry succeeded; a later reuse deleted the family and published one revocation. The legacy account bound its uid on sign-in, and a different uid returned 409. |
| b2 | New → old → new on one family: sessions interoperate. The old refresh dropped the family cap, and the next new rotation re-anchored it. An old sign-in keeps the binding. |
| rollback | The down-SQL (§8) restored the 067 shape: new `/ready` 503, old `/ready` 200, and sessions survive. Re-applying 068 worked, and 2 uid bindings were lost as expected. |
| old suites | `--old-suite` ran the **old binary's own** PostgreSQL integration tests on a 001–068 database. For `2a55475`: 22 files, 45 tests. For `785a86c`: 23 files, 48 tests. Everything passed except the old `postgresSchemaReadiness.test.ts` case. That test deletes the ledger row with the highest id and expects `/ready` to fail. On 068 that row is 068, which the old manifest does not require, so the old binary correctly stays ready. That is the compatibility property itself (c2). On a 067 control database the test passes. One earlier run showed a single timing flake in the old `postgresPresenceRepository.test.ts` ("move cannot renew a lease…"). It passed on the two later runs; the script retries once and attributes a failure to 068 only when the 067 control does not reproduce it. |
| d | `postgres-gate.mjs`: 27 files and 110 tests passed, 0 failed, 0 skipped. `sessionSecurity.postgres.test.ts` ran all 11 scenarios against PostgreSQL. |
| CLI | `npm run db:migrate` on a disposable cluster printed `applied=68 skipped=0`, then `applied=0 skipped=68` on the rerun. The 068 ledger checksum matched the file hash. |

Remaining differences from the target: the rehearsal used PostgreSQL 16 while
the target runs 17.6, and synthetic data rather than the 18 real accounts. The
§5 restore gate closes both on the owner's Mac. It also did not run through
Supavisor, so check §2 and step 4a.

## 7. Ordered steps

**The operator** is the owner, or a release captain the owner names. Nobody pastes
the database URL, tokens or query results that contain phone numbers into
chat, tickets or Git.

| # | Step | Command / action | Pass condition | Approves |
| --- | --- | --- | --- | --- |
| 0 | Go/no-go and identity | Confirm in writing that the target is `nkqcbxufbhfibrgvajim` (test/staging) and that this window is authorised. In the Railway dashboard, record the **live deployment commit** (read-only). Pick the release commit that contains 068 and check `sha256sum apps/server/db/migrations/068_*.sql` = `a475eecb…e0ee`. | Target, release SHA and live SHA written down | **Owner** |
| 1 | Realtime lease check | If the live deployment commit predates `4d016d2` (no lease code), the later deploy is also the realtime lease cutover, and the LAUNCH_CONTROL lease gate (BLOCKED) applies. Applying 068 alone is still allowed. | Recorded: "lease-aware live" or "lease cutover pending" | Owner |
| 2 | Read-only preflight | `node --env-file-if-exists=.env.local --import tsx apps/server/scripts/auditDatabaseRelease.ts --project-ref nkqcbxufbhfibrgvajim`, then the §9 preflight queries. | `missingMigrations: 1` (068 only), `changedMigrations: 0`, `unexpectedMigrations: 0`, no other findings; 67 ledger rows; `firebase_uid` absent; no transaction older than 60 s | Operator |
| 3 | Backup and restore proof | §5 steps 1–3. | Archive SHA-256 recorded; restore gate `applied: 1`, `rerunApplied: 0`, no findings | Operator runs; **owner reviews the evidence** |
| 4a | Check the session setting through the pooler | `PGOPTIONS='-c lock_timeout=5s' $PG17/psql "$DATABASE_URL" -Atc 'SHOW lock_timeout'` | Prints `5s`. Otherwise STOP (§10) | Operator |
| 4b | **Apply 068** (from a clean checkout of the release commit; `NODE_ENV` unset) | `BLUMI_OTP_HMAC_SECRET=$(openssl rand -hex 32) PGOPTIONS='-c lock_timeout=5s' npm run db:migrate`. The migrator's config check requires a 32-character secret but never uses it, so use a throwaway value and never the real one. `DATABASE_URL` from the shell environment overrides `.env.local`. | Prints `Blumi migrations applied=1 skipped=67`. On `lock timeout`, re-run step 2's activity query, wait, and retry at most twice | **Owner, explicitly, immediately before running** |
| 5 | Idempotent rerun | Run the same command again. | `applied=0 skipped=68` | Operator |
| 6 | Verify | `auditDatabaseRelease.ts --project-ref nkqcbxufbhfibrgvajim --require-clean` exits 0, and the §9 post-apply queries pass. `curl -fsS https://blumi-app-production.up.railway.app/ready` still returns 200: the old binary on 068. | All pass | Operator; owner signs off |
| 7 | Deploy the new binary (**separate phase, not approved now**) | Merge the reviewed release into `main`; Railway builds and runs the `/ready` healthcheck. Follow the LAUNCH_CONTROL lease rule if step 1 said "cutover pending". | `/ready` 200 on the new deployment; `/health` 200; unauthenticated `/v1/users/me` 401; the owner's device signs in (its uid binds) | **Owner** |
| 8 | Watch | For 24 h: Railway logs for 5xx, and 409 on `/v1/auth/firebase/complete` (there is no security event sink, R3); the recovery request queue; §9 binding counts. | No unexplained 5xx or 409 | Operator |

## 8. Rollback

**Binary rollback is safe without a schema rollback.** Redeploy the previous
Railway deployment. The old binary is fully functional on 068 (b1, b2, old
suites). Consequences while the old binary serves:

- Reuse detection and the family cap stop. Tokens the new binary already rotated
  stay rejected, because their `expires_at` equals the rotation time.
- The old binary does not bind uids.
- **The old binary's phone change leaves a stale `firebase_uid`.** On roll-forward,
  that member's next sign-in with the new number gets 409 and a manual review.
  Before rolling forward, clear bindings for accounts the old binary may have
  changed, with an owner-approved, reviewed statement:
  `UPDATE blumi_accounts SET firebase_uid = NULL WHERE firebase_uid IS NOT NULL AND updated_at >= '<old-binary restart time>';`
  This over-clears on purpose; the uids re-bind at the next sign-in.
- If the previous deployment is not lease-aware, follow the LAUNCH_CONTROL
  reverse order: stop new admission and drain lease-aware sockets before the
  old binary returns.

**Schema rollback (owner only, only if 068 itself is proven harmful).** First make
sure the old binary is serving and its `/ready` returns 200. Never drop these
columns while the new binary serves, or every session lookup fails. Then take
the post-068 archive (§5.4) and run:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS blumi_accounts_firebase_uid_key;
ALTER TABLE blumi_accounts DROP COLUMN IF EXISTS firebase_uid;
ALTER TABLE blumi_sessions
  DROP COLUMN IF EXISTS replaced_by_token_hash,
  DROP COLUMN IF EXISTS rotated_at,
  DROP COLUMN IF EXISTS family_expires_at;
DELETE FROM blumi_migrations WHERE id = '068_session_reuse_detection_and_firebase_uid.sql';
COMMIT;
```

**Data-loss note:**

- **All `firebase_uid` bindings are lost.** Every account re-binds to whichever
  uid next signs in, which reopens the recycled-number window (R2) for all
  members.
- **Rotation markers are lost.** Reuse history is gone. Tombstones remain
  expired, so they are still rejected.
- **Family caps are lost.** They re-anchor at +90 days on the next rotation,
  which extends lifetimes.

Afterwards, the audit must show 67 matching migrations, and a later re-apply of
068 is a normal forward migration. The rehearsal proved this sequence. Prefer a
reviewed forward repair to a schema rollback, and restore into a **new**
database rather than over the live one, as DATABASE_RELEASE_RUNBOOK says.

## 9. Verification queries (read-only)

```sql
-- Preflight and post-apply: ledger
SELECT count(*) AS applied, max(id) AS latest FROM blumi_migrations;       -- 67 / 067_… before; 68 / 068_… after
SELECT checksum FROM blumi_migrations
 WHERE id = '068_session_reuse_detection_and_firebase_uid.sql';            -- a475eecbf15c0cb7d0ee7e06ff84d5cdae9269299590b843b19fc84a3647e0ee

-- Preflight: long transactions that would hold the lock queue (no query text)
SELECT pid, state, backend_type, application_name, now() - xact_start AS xact_age
  FROM pg_stat_activity
 WHERE datname = current_database() AND xact_start IS NOT NULL AND pid <> pg_backend_pid()
 ORDER BY xact_start;

-- Post-apply: shape
SELECT table_name, column_name, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND column_name IN ('family_expires_at','rotated_at','replaced_by_token_hash','firebase_uid');  -- 4 rows, YES, NULL
SELECT indexdef FROM pg_indexes WHERE indexname = 'blumi_accounts_firebase_uid_key';          -- … WHERE (firebase_uid IS NOT NULL)

-- Post-apply and watch: aggregate state only
SELECT count(*) FILTER (WHERE firebase_uid IS NOT NULL) AS bound, count(*) AS accounts FROM blumi_accounts;
SELECT count(*) FILTER (WHERE expires_at > now()) AS live,
       count(*) FILTER (WHERE family_expires_at IS NOT NULL) AS anchored,
       count(*) FILTER (WHERE rotated_at IS NOT NULL) AS tombstones
  FROM blumi_sessions;
```

## 10. Stop conditions

Stop, change nothing further, and report to the owner if any of these happens:

- The target ref, environment classification or live deployment commit cannot
  be confirmed, or `DATABASE_URL` does not use the session pooler with the
  project-ref username.
- The preflight audit shows anything other than exactly one missing migration
  (068), a checksum mismatch, an unexpected migration, a grant exposure or an
  integrity finding.
- The ledger does not have exactly 67 rows, or `firebase_uid` already exists
  (the migration was partly applied by hand).
- The backup cannot be taken with PostgreSQL 17 tools, the archive SHA-256 is
  not recorded, or the restore gate fails.
- `SHOW lock_timeout` through the pooler is not `5s`. Proceeding without a lock
  timeout is an owner decision.
- `lock timeout` occurs three times, or the migrator prints anything other than
  `applied=1 skipped=67` (first run) and `applied=0 skipped=68` (rerun).
- The old binary's `/ready` stops returning 200 after 068.
- After the deploy, `/ready` is not 200, sustained 5xx appear on auth routes, or
  there are unexpected 409 `ACCOUNT_RECOVERY_REQUIRED` responses.
- The deploy would be the realtime lease cutover (step 1) and the LAUNCH_CONTROL
  lease gate is still BLOCKED.

**Open risks, which this runbook does not close:**

- Supavisor handling of `PGOPTIONS` is unverified.
- Supabase PITR status is unknown.
- The rehearsal ran on PostgreSQL 16 with synthetic data; the §5 restore gate on
  PostgreSQL 17 covers this.
- Overlap between two lease-aware versions during a Railway deploy was not
  rehearsed. The lease lock module and migration 067 are unchanged between
  `2a55475` and this branch, but `connectionManager` did change.
- The mobile client has no localized 409 recovery UX.
- R1–R3 from the threat model remain open.
