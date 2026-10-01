# Blumi database release runbook

This is an implementation and verification guide, not a release approval. The
founder-facing status remains in `LAUNCH_CONTROL.md`.

## Current evidence (2026-09-28)

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

## Environment conversion order

1. Create a separate staging Supabase project. Apply source migrations there
   and seed only synthetic identities. Point the currently staging-configured
   Railway API at it; verify `/ready`, authenticated API paths, account
   creation/deletion, Chat, Room and avatar equip/reload. Staging and production
   must never share a database or Firebase test identity.
2. Freeze writes to the existing test project. Produce an exact account and
   dependent-record inventory privately, including the 18th account and any
   Firebase identity. Confirm that **every** listed account is disposable.
   Do not infer this from the old 17-account snapshot or a `blumi_test_personas`
   marker alone. Take a fresh archive and restore it before any deletion.
3. Clean the confirmed test identities through the reviewed account-deletion
   path and reconcile remaining linked records. Verify zero account, session,
   inventory, chat, room, report, push and test-persona residue. Deleting a
   PostgreSQL row alone does not prove Firebase identity deletion. Keep the
   original backup under the agreed retention policy and verify no production
   session points at test data.
4. Apply migration 066 and later reviewed migrations to staging first, rerun
   idempotently, then repeat on the classified production project with a fresh
   restorable backup. The matching API commit must be deployed only after the
   database is compatible. Stop rollout on any checksum, integrity, grant or
   `/ready` failure; restore to a **new** database or use a reviewed forward
   repair rather than assuming SQL rollback is safe.

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
staging and production identities are distinct; all test data is classified and
cleaned; backup and restore are proven; permissions are closed; production
migration hashes match; `/ready` is healthy; 1,000-DAU launch traffic is
measured and tested at twice observed peak concurrency; connection and query
latency are inside the measured budget; alarms reach an operator; rollback to
the previous API version or a newly restored database is rehearsed. Native and
App Store readiness are separate gates.
