# Blumi database release runbook

This is an implementation and verification guide, not a release approval. The
founder-facing status remains in `LAUNCH_CONTROL.md`.

## Current state (2026-10-02)

Superseding OTP update, 2026-10-10: owner authorized deployment and OTP-only
migration 073 in the current conversation. Fresh owner-only public-schema
archive `/Users/evrenevren/BlumiReleaseBackups/scheduled-public-2026-10-10T09-41-21-666Z-78432.dump`,
544820 bytes, SHA-256 `97ba771baf10fed876e2cb4c3874e34eb95c3e52f1cd6966873e7ab83aa76490`,
restored in a disposable PostgreSQL 17 cluster: 70 prior ledger rows,
all three pending migrations rehearsed, rerun zero, 24 accounts/22 inventories,
zero integrity/access findings. Only `073_sms_verification_outcomes.sql` was
then applied live using an isolated migrator directory; 070/071 remain pending.
Checksum `5452a289e0abb048ba67d89382105124838226633d16b6833020cb70558082dc`
matches readback and is locked in `migrations.applied.json`; rerun skipped it.
Live account/inventory counts remain 24/22. The backend identity was already a
member of the new observer role but lacked SET permission; its membership was
configured with INHERIT FALSE, SET TRUE. A read-only transaction using the
restricted role was verified. Outcome-based enforcement stays false pending
real-client observation. The restore gate now recreates the NOLOGIN SMS role
names before restoring policies; it never creates those roles on a live target.

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

## Migrations 074–076 (2026-10-15) — WRITTEN, NOT APPLIED

Three additive files from the 2026-10-14 release audit, each tested in the
isolated PostgreSQL gate (first apply and rerun). All three are in
`OPTIONAL_READINESS_MIGRATIONS`, so `/ready` stays green whichever of code and
schema reaches production first. The preferred order is still migrate first,
then deploy. None of them changes or deletes an existing row.

The migrator applies **every** pending file in order: a plain `db:migrate`
would also apply the still-pending 070 and 071. To apply only some files, use
an isolated migrator directory holding just those files (as done for 073), and
keep each step a separate owner yes with its own fresh restore-tested dump.
The exact procedure is "Applying 074–076 through an isolated directory" below.

| File | What | Optional because | Order |
|---|---|---|---|
| `074_notification_retention_index.sql` | Partial index `(created_at) WHERE notification_type IN ('message','like')` on `blumi_notification_policy_events` (audit D08) | Index only; every query returns the same rows without it | Any time. Builds under a SHARE lock (claim writes wait, reads do not) inside the migrator transaction, bounded by its 5 s lock timeout; not CONCURRENTLY, because the migrator runs each file in a transaction. If the lock times out, nothing changed: run it again later. |
| `075_chat_hide_point_message.sql` | Nullable `hidden_through_message_id` and `hidden_through_message_sent_at` next to 071's `hidden_through` (audit R15) | The chat repository probes this ledger row and keeps 071's time-only rule until it exists | After or together with 071 (alone it is harmless but unused). Code before or after. |
| `076_beta_reset_runs.sql` | Table `blumi_beta_reset_runs`, one row per applied beta reset (audit F2) | The app never touches it; the reset script refuses every apply without it | Before the next beta reset apply. Code order does not matter. |

Gate evidence for 074 on 300,001 synthetic claims: the retention scan went from
a sequential scan reading and discarding 297,000 rows (about 74 ms) to an index
scan of the partial index discarding none (about 2 ms), and the purge deleted
exactly the rows the unindexed predicate selects.

075 compatibility: a binary that knows 075 writes the hidden message's id and
time with `hidden_through` and reads that exact point only while its time still
equals `hidden_through`. Rows hidden before 075, and rows whose
`hidden_through` an older binary moved during a rolling deploy, keep 071's
inclusive time rule, which can hide a same-millisecond message. One rolling-deploy
case can show a message again: the new binary hides through X, then an older
binary hides through Y, which shares X's millisecond and sorts after it. The
older binary leaves the time unchanged, so the exact point stays at X and Y
shows again in history. This needs both binaries live, a same-millisecond
message and a second hide. The thread list (`hiddenThroughMessageId`), both
unread counts and the app use the same exact point as history. Still open: a message stored with an earlier time that commits
after a hide is ordered before the hide point and stays hidden; closing that
needs a commit-ordered sequence, not this pair.

076 caveat: the marker table starts empty. If a beta reset was already applied
to this database before 076, record that in `LAUNCH_CONTROL.md` and treat the
next apply as a repeat (`--repeat-reason`).

075 locking: the ADD COLUMN takes a brief ACCESS EXCLUSIVE lock on
`blumi_chat_thread_participants`. While it waits (at most the 5 s lock
timeout) it also blocks reads of that table: thread list, send and history.
Apply it at a quiet moment.

Rollback (each needs the owner's yes; take a dump first). Run every statement
inside `BEGIN; SET LOCAL lock_timeout = '5s'; <statement>; COMMIT;` so a busy
table makes it fail instead of queueing the app behind it:

- 074: `DROP INDEX IF EXISTS blumi_notification_policy_events_retention_idx;`
  then delete its `blumi_migrations` row. Retention keeps working, slower.
- 075: delete its `blumi_migrations` row first and wait at least 30 s (the
  probe interval) so running binaries stop naming the columns; then
  `ALTER TABLE blumi_chat_thread_participants DROP COLUMN IF EXISTS
  hidden_through_message_id, DROP COLUMN IF EXISTS hidden_through_message_sent_at;`.
  Hide points fall back to `hidden_through` (hides at most a same-millisecond
  message more; nothing hidden becomes visible).
- 076: delete its `blumi_migrations` row only. Do not drop the table after a
  reset ran: it is the only record that the reset happened. Without the table
  the reset script refuses every apply.

### Applying 074–076 through an isolated directory

Nothing here has been run against a real database. Every step that writes
needs the owner's yes in the current conversation. Run on the owner's Mac from
the repository root, at the commit that holds the files, one command at a time;
stop at the first STOP. Live ledger when written: 001–069, 072 and 073 applied;
**070 and 071 pending**. The owner chooses one path before step 1:

- **Path A, only 074–076:** 070 and 071 stay pending. 075 is then stored but
  unused (it needs 071), which is harmless.
- **Path B, 070, 071 and 074–076 together:** also follow
  [`MIGRATION_070_RUNBOOK.md`](./MIGRATION_070_RUNBOOK.md) for 070's checks.
  The isolated directory then holds all five files, which is what a plain
  `db:migrate` would apply, but the set is written down and checked.

1. Clean checkout: `git status --short` prints nothing. STOP otherwise.
2. Make the isolated directory (this prints its path; use it as `$ONLY` below,
   in the same terminal):
   `ONLY=$(mktemp -d /tmp/blumi-migrate.XXXXXX) && echo "$ONLY"`
3. Copy exactly the chosen files.
   - Path A: `cp apps/server/db/migrations/07[456]_*.sql "$ONLY"/ && ls "$ONLY"`
     → exactly `074_notification_retention_index.sql`,
     `075_chat_hide_point_message.sql`, `076_beta_reset_runs.sql`.
   - Path B: `cp apps/server/db/migrations/07[01456]_*.sql "$ONLY"/ && ls "$ONLY"`
     → those three plus `070_chat_delivery_receipts.sql` and
     `071_chat_hide_for_me_and_advisor_fixes.sql`.
   STOP if the list differs.
4. Prove each copy is byte-identical to the repository file. The ledger
   checksum is the SHA-256 of the file, and `/ready` fails on an optional row
   whose checksum differs, so one changed byte (CRLF, an editor save) would take
   the API down:
   `for f in "$ONLY"/*.sql; do n=$(basename "$f"); a=$(shasum -a 256 "$f" | cut -d' ' -f1); b=$(shasum -a 256 "apps/server/db/migrations/$n" | cut -d' ' -f1); if [ "$a" = "$b" ]; then echo "OK $n $a"; else echo "STOP $n"; fi; done`
   → one `OK` line per file. Keep these checksums for steps 8 and 9.
5. Fresh PostgreSQL 17 dump of the live database, right before the apply:
   `PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH node --env-file-if-exists=.env.local scripts/automation/local-backup.mjs`
   → note the archive path and SHA-256. STOP if it fails.
6. Rehearse exactly this file set on that dump. The gate restores into a
   throwaway PostgreSQL 17 cluster and never reads `DATABASE_URL`; with
   `BLUMI_MIGRATIONS_ONLY_DIRECTORY` it applies only the isolated files, refuses
   any copy that differs from the repository, and lists what stays pending:
   `LC_ALL=en_US.UTF-8 BLUMI_MIGRATIONS_ONLY_DIRECTORY="$ONLY" node scripts/security/restore-upgrade-gate.mjs /absolute/path/to/fresh.dump`
   → `archiveSha256` equals step 5, `rerunApplied` is 0, `accounts` and
   `inventories` match the read-only audit (step 7), and:
   - Path A: `appliedFiles` is the three files and `stillPending` is
     `["070_chat_delivery_receipts.sql","071_chat_hide_for_me_and_advisor_fixes.sql"]`.
   - Path B: `appliedFiles` is the five files and `stillPending` is `[]`.
   STOP on any error or difference.
7. Confirm the target is the release database (read-only):
   `node --env-file-if-exists=.env.local --import tsx apps/server/scripts/auditDatabaseRelease.ts --project-ref nkqcbxufbhfibrgvajim`
   → the project ref matches; the missing migrations are exactly the files you
   are about to apply (Path A also leaves 070/071 missing). STOP otherwise.
8. Apply (owner's yes for this step, in the current conversation). Only the
   files in `$ONLY` are read; each file runs in its own transaction with the
   5 s lock timeout:
   `ONLY="$ONLY" node --env-file-if-exists=.env.local --import tsx --input-type=module -e "import m from './apps/server/src/db/migrate.ts'; const r = await m.runMigrations({ databaseUrl: process.env.DATABASE_URL, migrationsDirectory: process.env.ONLY, ...m.parseMigrationTimeouts(process.env) }); console.log('applied', JSON.stringify(r.applied), 'skipped', r.skipped.length)"`
   → `applied` lists exactly the files of step 3. A lock timeout rolls back
   only the file it hit: run step 9, then step 8 again later; files already
   applied are skipped.
9. Read the ledger back (read-only transaction):
   `node --env-file-if-exists=.env.local --input-type=module -e "import pg from 'pg'; const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); try { await c.query('BEGIN READ ONLY'); const r = await c.query(\"SELECT id, checksum FROM blumi_migrations WHERE id >= '070' ORDER BY id\"); for (const row of r.rows) console.log(row.id, row.checksum); await c.query('ROLLBACK') } finally { await c.end() }"`
   → each applied file with the checksum from step 4, 072 and 073 unchanged,
   and (Path A) no 070/071 row. Then `curl -s https://<api-host>/ready` is
   ready. STOP and use the rollback above if either fails.
10. Record it: add each applied file and its checksum from step 9 to
    `apps/server/db/migrations.applied.json`, update the ledger line at the top
    of this file and `LAUNCH_CONTROL.md` (date, dump SHA-256, path A or B),
    run `node --import tsx --test apps/server/src/db/migrationLedger.test.ts`
    and commit. Then `rm -r "$ONLY"`.

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

## Full beta reset (owner option "c", pre-approved 2026-10-10)

`apps/server/scripts/betaReset.ts` is the only way to run it; never ad-hoc SQL.
It sets coins to 1,250, every loadout to its body's starter look, every finished
room to the starter room with the bed, and deletes all chats, messages, matches,
discovery decisions (except the likes the test personas hand out), mini rooms,
invites, reactions, pending pushes about them, room presence, realtime payloads
and old room renders. It never writes profile columns, sessions, push devices,
settings, blocks, reports, bans, money ledgers, owned items, test personas or
`blumi_migrations`. Deleting a mini room queues a LiveKit media revocation per
participant (database trigger, as when the app ends a room; voice is off).
Output is counts, catalog item IDs and commit SHAs only.

The starter looks and room come from the code that runs the script, so it must
run from the exact release that is live:

- a clean checkout of the commit `/health` reports as `commit` (12 characters;
  if it is null, take the commit from the Railway deployment), with
  `npm ci` and `npm run build:packages` run in that checkout;
- the script prints `commit=<sha>` and the starter item IDs. The dry-run hash
  covers the commit, the starter digest, the counts and the content of every row
  the reset reads, so an apply from another checkout, a stale build or after any
  app write is refused (`hash mismatch`). It also refuses to start when the built
  `@blumi/domain` differs from the checkout's source;
- `DATABASE_URL` must be the Supabase **Session pooler** URL (user
  `postgres.<ref>`); any other user is refused.

Run it last, after the new server is live and smoke-tested. Every step is one
command; stop at the first STOP.

1. Release check: `curl -s https://<api-host>/health` → note `commit`. In the
   checkout: `git rev-parse --short=12 HEAD` and `git status --short
   --untracked-files=no`. STOP if the commits differ or the status is not empty.
2. Quiet step (stop app writes). There is no maintenance flag in the server, so
   the window is "no running instance". Stopping and restarting the Railway
   deployment is a Railway action: get the owner's yes in the current
   conversation first, and tell testers the app is down for about 15 minutes.
   - Railway → project → service `blumi-app` → Deployments → the active
     deployment (its commit = step 1) → ⋮ → **Remove** (stops it; the build is
     kept). Labels can differ; the goal is that no instance of the service runs.
   - Wait 2 minutes, so realtime leases (90 s) and room presence expire.
3. Dump right before the apply (PostgreSQL 17 client on PATH):
   `PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH node --env-file-if-exists=.env.local scripts/automation/local-backup.mjs`
   → note the archive path and SHA-256. STOP if it fails. Restore proof if time
   allows: `restore-upgrade-gate.mjs` (below; on macOS also `LC_ALL=en_US.UTF-8`).
4. Dry run (default, READ ONLY):
   `node --env-file-if-exists=.env.local --import tsx apps/server/scripts/betaReset.ts --project-ref <ref>`
   → counts, `activity`, `starter`, `commit=`, `fingerprint=`, `expect=`. STOP if
   `commit` is not step 1's or says "modified", if `activity` is not all 0, if
   `starter` is not the release's starter look (girl: coral wave polo and pants,
   ink pageboy hair; boy: blue-black curls, white basic tee, black straight
   trousers, black clean sneakers) and room (`room_v3_bed_blumi_starter`), or if
   `keep.blumi_accounts` differs from the read-only audit's account count.
5. Send the owner the short Turkish list (counts only): what is removed, what
   each user gets, what is kept. The reset is pre-approved; this is a notice.
6. Apply: the same command plus `--apply --expect <sha256> --fingerprint <fp>
   --deployed-commit <step 1 commit>`, with `BLUMI_BETA_RESET_CONFIRM=reset-beta-<ref>`
   set for that one command. It locks the tables it writes, refuses on a hash,
   fingerprint or commit mismatch or when a live connection or room presence
   exists, and rolls back unless the post-check finds nothing left to reset, the
   accounts, inventories and persona likes at their old counts. `hash mismatch`
   means something wrote since step 4: check step 2, then repeat from step 4.
7. Verify: re-run step 4; every delete and reset count must be 0. Run the
   read-only audit (Safe inspection above).
8. Restart: Railway → the removed deployment → **Redeploy** (the same commit;
   covered by the owner's yes in step 2). Check `/health` shows the step 1
   commit. The restart also drops any in-memory room or chat state.
9. Record the counts (never IDs) in `LAUNCH_CONTROL.md` and tell the owner in
   Turkish, counts only.

Undo: after the COMMIT the only undo is restoring the step 3 dump into a new
Supabase project and pointing Railway's `DATABASE_URL` at it, which needs the
owner's yes and loses everything written after the dump. After Phase F, retire
the script: a later dry run plus apply would wipe the new chats again.

One-shot marker (migration 076, audit F2): every applied reset records one
row in `blumi_beta_reset_runs` (commit, plan hash, time, reason) in the same
transaction. Without 076 the apply refuses before it locks anything. The dry
run prints `previous-resets=<n>`; STOP unless it is 0. A database that already
recorded a reset applies again only with `--repeat-reason "<why>"` (12–200
plain characters, no phone-like numbers), given with the owner's yes, and the
reason is recorded with the run. Two concurrent applies serialize on the
table lock; the second one sees the first one's row and refuses.

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
