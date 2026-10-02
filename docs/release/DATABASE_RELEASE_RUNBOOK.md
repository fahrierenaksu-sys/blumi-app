# Blumi database release runbook

This is an implementation and verification guide, not a release approval. The
founder-facing status remains in `LAUNCH_CONTROL.md`.

## Current state (2026-10-02)

- **Classification (owner decision, 2026-09-30):** Supabase project
  `nkqcbxufbhfibrgvajim` and the Railway `production` environment are the
  release target. Handle the database as production: backup, restore proof and
  explicit owner approval before any write. All 18 accounts are the owner's own
  test accounts and are kept. There is no separate staging database yet.
- **Ledger:** 69 rows, latest `069_moderation_phone_bans.sql` (read-only check
  2026-10-02). 066–069 are applied. 070 is written but not applied; the
  deployed server (`main` @ `76a195e`, Railway deployment `8909a8ee`,
  2026-10-01 23:56 UTC) runs without it with receipts off.
- **Backups:** the Supabase organisation is on the Free plan, so there is no
  PITR and no platform restore point. The latest recorded restore-tested
  archive is the owner-only public-schema dump of 2026-09-30 (SHA-256
  `c6cb8355c8cf8fabe2addf9cf2025279d2908e6fb14ffd9f7dc24e9334603020`,
  68 migrations; see `LAUNCH_CONTROL.md`); its path is not recorded here.
  A daily encrypted GitHub Actions backup is written but off until the owner
  adds its two secrets (see "Daily GitHub Actions backup").
- **Before 070:** record the path and SHA-256 of a fresh restore-tested dump
  here (the 068 archive was never recorded), and have the owner confirm the
  host and port of Railway's `DATABASE_URL` without reading the password
  (`OPEN_WORK_2026-09-30.md` REL-4).

## Evidence of 2026-09-28 (dated; superseded by the state above)

- `nkqcbxufbhfibrgvajim` is still the test database. Read-only inspection found
  18 accounts, 14 inventories, 16 test personas, 20 chat messages, four mini
  rooms and zero store transactions. One account was created after the prior
  17-account snapshot. Its identity and purpose have not been classified.
- Applied migration checksums matched all 65 pre-existing source files. The new
  `066_inventory_release_integrity.sql` has **not** been applied to Supabase.
- No orphan inventory, duplicate inventory row, malformed owned item ID,
  negative balance, unknown owned/equipped catalog ID, unowned equipped item,
  or `anon`/`authenticated` grant was detected. Four accounts have no inventory;
  this can be normal before inventory hydration, but must be classified before
  clearing the test project.
- Owner-only public-schema archive:
  `/Users/evrenevren/BlumiReleaseBackups/supabase-public-pre-066-2026-09-28.dump`
  (SHA-256 `12da272415c8bc7a5e7d8dd76ca6a33606b8c3375fde90771509771e7930a532`).
  A local PostgreSQL 17 restore contained all 18 accounts and 14 inventories;
  migration 066 applied once and its rerun applied zero files. The post-restore
  grant check passed **after** replaying migration 059's privilege revocations.
  This archive is local and covers only the application `public` schema. It is
  not the planned offsite S3 backup or a Supabase platform recovery point.

## Migration 068 (2026-09-30) — APPLIED

Migration `068_session_reuse_detection_and_firebase_uid.sql` (nullable
session-rotation columns, `blumi_accounts.firebase_uid` and a partial unique
index) was **applied** on 2026-09-30 by owner decision, recorded in commit
`19b6ff3` ("docs: record migration 068 as applied by owner decision"). Per
[`MIGRATION_068_RUNBOOK.md`](./MIGRATION_068_RUNBOOK.md): 68 ledger rows,
checksum matches the file, columns and partial unique index present, 18
accounts unchanged, `/health` and `/ready` 200 afterwards; `main` at `19b6ff3`
was then deployed to Railway (deployment `c25660ad`, SUCCESS). The owner waived
the pre-apply native QA and the Railway `DATABASE_URL` check; the backup
archive path and SHA-256 are not recorded, and native QA plus the 24-hour watch
remain open. That runbook keeps the lock analysis, compatibility matrix,
verification queries, rollback and stop conditions. The disposable
mixed-version rehearsal is
`node scripts/security/migration-068-rehearsal.mjs [old-ref] [--old-suite]`.

## Migration 069 (2026-09-30) — APPLIED

Migration `069_moderation_phone_bans.sql` adds one table
(`blumi_moderation_phone_bans`, keyed by an HMAC of the phone number). It was
**applied** on 2026-09-30, recorded in commit `d283333` ("docs: record
migration 069 as applied"): one transaction under the migrator's advisory lock,
69 ledger rows, RLS on, no `anon`/`authenticated` SELECT, table empty. It was
applied at the owner's request without a separate dump and restore test. The
binary that ships 069 can now pass `/ready`. See
[`MIGRATION_069_NOTE.md`](./MIGRATION_069_NOTE.md).

## Migration 070 (2026-10-01) — WRITTEN, NOT APPLIED

Migration `070_chat_delivery_receipts.sql` adds nullable receipt cursors to
`blumi_chat_thread_participants` and the `blumi_chat_privacy_preferences`
table. Unlike 068, the binary ships first: `/ready` treats 070 as optional
(`OPTIONAL_READINESS_MIGRATIONS`) and the server probes the ledger before
using it, so receipts stay off until it is applied. While 070 is pending, the
release audit reports one missing migration; that is expected. Steps,
compatibility matrix, verification and rollback order:
[`MIGRATION_070_RUNBOOK.md`](./MIGRATION_070_RUNBOOK.md).

## Safe inspection

From the repository root, with the exact target project ref:

```bash
node --env-file-if-exists=.env.local --import tsx \
  apps/server/scripts/auditDatabaseRelease.ts \
  --project-ref nkqcbxufbhfibrgvajim --require-clean
```

The audit refuses a mismatched project ref, uses a read-only transaction and
prints aggregate counts only. It exits 2 when integrity or access findings
exist. `accountsWithoutInventory` is informational; investigate it in the
classified environment. A missing migration is expected until an authorized
staging/production rollout. Do not run `npm run db:migrate` against a URL whose
project and environment have not been independently confirmed.

## Environments and migration order

Under the 2026-09-30 classification there is one database, the release target
above. A separate staging Supabase project is recommended and still open
(`OPEN_WORK_2026-09-30.md` REL-5):

1. Create the staging project, apply source migrations, seed only synthetic
   identities, and point a separate Railway staging environment at it (none
   exists yet; reconcile `.railway/railway.ts` with the live project first).
   Verify `/ready`, authenticated API paths, account creation/deletion, chat,
   room and avatar equip/reload. Staging and production must never share a
   database or Firebase test identity.
2. Apply each new migration to staging first and rerun it to prove zero new
   applications, then repeat on the release target with a fresh restore-tested
   backup. Deploy the matching API commit only after the database is
   compatible (070 is the documented exception: its binary ships first). Stop
   on any checksum, integrity, grant or `/ready` failure; restore to a **new**
   database or use a reviewed forward repair rather than assuming SQL rollback
   is safe.
3. After a migration is applied to the release target, append the file and
   its SHA-256 to `apps/server/db/migrations.applied.json`. The migration
   ledger test (`apps/server/src/db/migrationLedger.test.ts`) then fails if
   that file ever changes, and holds every file not yet listed to the
   additive, RLS-and-revoke policy.

Until staging exists, rehearse each migration on the fresh dump instead: run
`node scripts/security/restore-upgrade-gate.mjs /absolute/path/to/fresh.dump`
(below), which restores it into a throwaway PostgreSQL 17 cluster, applies the
pending migrations and proves the rerun applies none. Only then apply to the
release target, with the owner's approval. The fresh backup, that rehearsal
and the approval are the only safety net.

If the owner reverses the classification and wants test identities removed:
freeze writes; list every account and dependent record privately, including
Firebase identities; confirm each one is disposable (not from an old snapshot
or a `blumi_test_personas` marker alone); take and restore a fresh archive;
delete through the reviewed account-deletion path; verify zero account,
session, inventory, chat, room, report, push and test-persona residue (deleting
a PostgreSQL row does not delete the Firebase identity); keep the original
backup under the agreed retention policy.

## Daily GitHub Actions backup

`.github/workflows/db-backup.yml` runs at 02:17 UTC every day and on demand. It
installs `pg_dump` 17, dumps the `public` schema with the conventions above
(`--format=custom --schema=public --no-owner --no-acl`, read-only TLS session),
checks it with `pg_restore --list`, encrypts it with gpg (AES256, symmetric
passphrase) and uploads only the encrypted file and a manifest (both SHA-256
values) as the artifact `blumi-db-backup`, kept 14 days. The repository is
public, so any signed-in GitHub user can download that artifact and read the
run logs: the passphrase is the only protection of the data, and the logs carry
only hashes and counts. The run
summary shows the SHA-256. It costs nothing on GitHub's free minutes.

It is **off** until both secrets exist: without them every run succeeds and
says "Database backup is off". GitHub runs the schedule only from `main`, so
it starts after the workflow reaches `main`.

Owner's one-time setup:

1. Optional but recommended, a read-only role. Run in the Supabase SQL editor
   (a write to the live database, so only by the owner; pick your own password):

   ```sql
   CREATE ROLE blumi_backup WITH LOGIN BYPASSRLS PASSWORD '<long random password>';
   ALTER ROLE blumi_backup SET default_transaction_read_only = on;
   GRANT USAGE ON SCHEMA public TO blumi_backup;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO blumi_backup;
   GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO blumi_backup;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO blumi_backup;
   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON SEQUENCES TO blumi_backup;
   ```

   `BYPASSRLS` is needed because the tables have row-level security and
   `pg_dump` refuses a partial read. Without this role the existing `postgres`
   URL also works; the job forces a read-only session either way.
2. GitHub → repository → Settings → Secrets and variables → Actions → New
   repository secret:
   - `BLUMI_BACKUP_DATABASE_URL`: the **Session pooler** URL from Supabase →
     Connect (host `aws-…pooler.supabase.com`, port 5432, user
     `blumi_backup.nkqcbxufbhfibrgvajim` or `postgres.nkqcbxufbhfibrgvajim`).
     GitHub runners have no IPv6, so the direct `db.…supabase.co` host fails,
     and port 6543 is refused.
   - `BLUMI_BACKUP_ENCRYPTION_KEY`: a random passphrase of at least 24
     characters (a generated 32+ character one is better, since the encrypted
     file is downloadable by anyone). Keep a copy in your password manager: without it no backup
     can be opened.
3. Actions → Database backup → Run workflow, then Actions → Database restore
   proof → Run workflow. The restore proof downloads the newest backup, checks
   both SHA-256 values, restores it into a throwaway PostgreSQL 17 container,
   prints table, row and migration-ledger counts, and (by default) runs
   `restore-upgrade-gate.mjs` on it. It never connects to the live database.

To open a backup on the Mac: download the artifact, then
`gpg --decrypt --output blumi-public.dump blumi-public.dump.gpg` (`brew install
gnupg`) and compare `shasum -a 256` with `plaintextSha256` in the manifest.
Artifacts expire after 14 days and live in GitHub; keep a monthly copy
elsewhere. This does not replace the offsite S3 plan below or a PITR plan.

## Independent S3 backup

The source for a dedicated Railway cron service is `apps/server/backup/`.
Build `Dockerfile` with repository root as Docker context. The production-only
job must have `DATABASE_URL`, `BLUMI_EXPECTED_PROJECT_REF`,
`BLUMI_BACKUP_BUCKET`, `AWS_REGION` and scoped S3 credentials in Railway
secrets, plus `NODE_ENV=production` and `BLUMI_DEPLOY_ENV=production`.
Schedule `0 2 * * *` UTC. The container exits after `pg_dump`, validates its
archive, uploads an AES256-encrypted object and a SHA-256 receipt using only
`PutObject`, then checks the upload acknowledgements. The separate read-only
freshness job checks remote size and encryption against the receipt. The single
PUT implementation fails closed above 5 GiB; a reviewed multipart uploader is
needed before archives reach that size. The URL must use the exact project-ref username and
TLS (`sslmode=require` or `verify-full`). No credentials belong in Git or the
mobile bundle.

Use a private bucket with Block Public Access, versioning, and lifecycle expiry
of both current and noncurrent backup-object versions after 30 days, subject to
the approved data-retention policy. The writer identity needs only prefix-limited
`PutObject`, with no read, list or delete rights. A separate read-only identity
should run `check-freshness.sh` hourly and deliver an alert when it exits
nonzero; the script rejects a missing completed receipt, a mismatched archive,
or one older than 26 hours. Configure external alert delivery and test it. A skipped
Railway cron execution must not silently count as a backup.

For weekly verification, download one archive with the read-only identity and
compare its SHA-256 with its receipt, then run:

```bash
node scripts/security/restore-upgrade-gate.mjs /absolute/path/to/backup.dump
```

This gate creates an isolated PostgreSQL 17 cluster, restores the archive,
replays `059_revoke_public_api_access.sql` because the portable dump omits ACLs,
applies new migrations, checks idempotency and audits grants/data counts.
The monthly drill must additionally restore into a disposable Supabase project
and time the complete switch/readiness path. Only that measured drill can prove
the four-hour recovery target. The daily schedule alone does not guarantee a
24-hour maximum data loss if a run is skipped; monitor age, retry failures and
hold public release until the observed backup process meets the target.

## Acceptance gate

Before public users enter: isolated PostgreSQL suite and source checks pass;
staging and production identities are distinct; all test data is classified
(the owner's 18 test accounts are kept by decision); backup and restore are proven; permissions are closed; production
migration hashes match; `/ready` is healthy; 1,000-DAU launch traffic is
measured and tested at twice observed peak concurrency; connection and query
latency are inside the measured budget; alarms reach an operator; rollback to
the previous API version or a newly restored database is rehearsed. Native and
App Store readiness are separate gates.
