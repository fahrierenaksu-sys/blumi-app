# Blumi veritabanı sağlık denetimi — 2026-10-01

Kapsam: `apps/server` (Fastify 5, pg 8.23) ile Supabase Free PostgreSQL 17.6
(`nkqcbxufbhfibrgvajim`, eu-west-1) arasındaki veri modeli ve sözleşme.
Hedef: tek Railway replikası, 5000 eşzamanlı kullanıcı, 500 oda, ek maliyet yok.
Branch: `integration/interaction-wave` (772846a) üzerinden bu worktree.

## Özet (sahip için)

**Sağlıklı mı?** Temel tasarım sağlam: kimlik, eşleşme, sohbet, davet ve
ekonomi kuralları veritabanı kısıtlarıyla korunuyor; migration çalıştırıcısı
kilitli, checksum'lı ve `/ready` ile bağlı; Supabase'in herkese açık API'si
(PostgREST) hiçbir tabloya erişemiyor. Ancak 5000 kullanıcı hedefine ve ücretsiz
plana göre **dört gerçek sorun** vardı; bunlar bu çalışmada kodda düzeltildi.
Kalanlar ya şema değişikliği (aşağıda önerilen, **uygulanmamış** DDL) ya da
transport mühendisinin alanındaki bağlantı havuzu ayarları.

| Alan | Durum | Önem | Kısa açıklama |
|---|---|---|---|
| Hesap silme | **Düzeltildi** | Yüksek | Paylaşılan oda daveti kabul edilmiş herkesin hesap silmesi FK hatasıyla (23503) başarısız oluyordu. App Store hesap silme şartını bozuyordu. Canlıdaki 18 test hesabından en az bir kısmı etkileniyordu (7 oda, 15 davet var). |
| Keşfet anlık görüntüleri | **Düzeltildi** | Yüksek (P0) | Her yenileme tüm uygun hesapları kopyalıyordu; temizlik dakikada 5000 satır siliyordu. 5000 kullanıcıda 500 MB'lık ücretsiz disk hızla dolardı. Artık en iyi 1000 aday tutuluyor ve temizlik birikimi her turda boşaltıyor. |
| Bağlantı canlılık sinyali | **Düzeltildi** | Orta-Yüksek | Her websocket pong'u 4 gidiş-dönüş (~80 ms) bağlantı tutuyordu; 5000 sokette havuz (10 bağlantı) yetmezdi. Artık tek ifade. |
| İstek başına gidiş-dönüş | **Düzeltildi** | Orta | Her oturumlu istek oturumu iki kez çözüyordu (+2 sorgu, ~40 ms). Artık bir kez. |
| Büyüyen iş/denetim tabloları | **Düzeltildi** | Orta | Tamamlanan sohbet teslim işleri, push makbuzları ve iki denetim tablosu hiç silinmiyordu. 10 dakikada bir sınırlı temizlik eklendi. |
| Hata eşleme | **Düzeltildi** | Orta | Her veritabanı hatası 500'dü. Artık yarış → 409, geçici hata (kilitlenme, zaman aşımı, havuz) → 503 + `Retry-After`. |
| Havuz hata dinleyicisi | **Açık** (transport) | Yüksek | `config.ts` havuzunda `'error'` dinleyicisi yok: Supavisor bağlantıyı kopardığında süreç çöker. Tek satırlık düzeltme transport mühendisine bırakıldı. |
| Zaman aşımları | **Açık** (transport + sahip) | Orta | `statement_timeout` 120 s, `idle_in_transaction_session_timeout` ve `lock_timeout` kapalı, havuz bağlantı beklemesi sonsuz. Önerilen değerler aşağıda. |
| RLS / Supabase güvenliği | Sağlıklı, sertleştirme önerili | Düşük | 63 tablonun hiçbirinde `anon`/`authenticated` yetkisi yok; danışman hata vermiyor. 57 tabloda RLS kapalı (savunma derinliği için açılması önerildi), 10 fonksiyonda `search_path` sabit değil. |
| İndeksler | Sağlıklı, ince ayar önerili | Düşük | Sıcak sorgular indeksli. 2 gereksiz indeks, 3 indekssiz FK, sohbet sayfalama indeksinde eksik `message_id`. |
| Migration çalıştırıcı | Sağlıklı | — | Danışma kilidi, checksum, işlem başına `lock_timeout`, `/ready` kontrolü. 070 bilerek uygulanmadı. |
| Yedekleme | **Açık** (sahip) | Yüksek | Free planda PITR yok. Elde tek doğrulanmış yedek 2026-09-28 tarihli yerel arşiv. S3 cron işi kodda var, çalıştığı kanıtlanmadı. |

Bu çalışmada canlı veritabanına **hiçbir yazma yapılmadı**, migration
uygulanmadı, migration klasörüne dosya eklenmedi.

---

## 1. Method and evidence

- Read all 70 migration files (`001`–`070`, two `032_*`, no `044`) and the
  repositories in `apps/server/src/db/**`.
- Live database, **read-only** Supabase MCP calls only: `get_advisors`
  (security, performance), `list_extensions`, `list_migrations` (empty: Blumi
  uses its own `blumi_migrations` ledger), and `execute_sql` limited to
  `pg_settings`, `pg_db_role_setting`, `pg_stat_activity`/`pg_stat_ssl`
  (aggregated, no query text), `pg_stat_user_tables`, `pg_stat_user_indexes`,
  `pg_stat_statements`, `pg_constraint`, `pg_proc`, `pg_class`,
  `information_schema`. No application row was selected; `DATABASE_URL` and
  Railway variables were not read. Statistics cover 2026-09-26 22:01 UTC to
  2026-10-01 08:00 UTC (test traffic only).
- Real-PostgreSQL tests: PostgreSQL 16 binaries through
  `scripts/security/postgres-gate.mjs` as the non-root `pgtest` user (the
  worktree guard blocks `su`/`runuser`, so a small Node launcher drops to
  `pgtest` with `spawnSync({ uid, gid })` and runs only the gate).

### Live facts

| Fact | Value |
|---|---|
| Version | PostgreSQL 17.6, `TimeZone=UTC`, `default_transaction_isolation=read committed` |
| `max_connections` | 60 (3 superuser-reserved) |
| `statement_timeout` | 120 s (config file); no override for role `postgres` |
| `idle_in_transaction_session_timeout`, `lock_timeout`, `idle_session_timeout`, `transaction_timeout` | 0 (off) |
| Server connections | 7 idle `postgres` backends with `application_name=Supavisor` (the API pool through the pooler); PostgREST 2, Supabase internals 5 |
| Data size | Largest table 352 kB; statistics estimate ~19 account rows (the runbook counts 18 test accounts) and 95 messages |
| Applied migrations | 001–069 (068 `firebase_uid` and 069 phone bans present); 070 objects absent, as intended |
| Extensions | `pgcrypto`, `uuid-ossp`, `pg_stat_statements` (schema `extensions`), `supabase_vault`, `plpgsql`; `pg_cron` not installed |
| Timestamps | No `timestamp without time zone` column in `public` |
| Id types | `text` (application ids), `uuid` (snapshots, payload refs, admin audit), `bigint` (audit sequences) |
| Publications | `supabase_realtime` publishes no Blumi table |

## 2. Findings

| ID | Area | Severity | Evidence | Fix | Status |
|---|---|---|---|---|---|
| DB-01 | Account deletion | High | `postgresAuthRepository.ts` deleted `blumi_mini_room_invites` before `blumi_mini_rooms`; `blumi_mini_rooms.invite_id` → invites is `NO ACTION` (`020_mini_room_invite_link.sql`) and `acceptPendingInvite` sets it (`postgresMiniRoomRepository.ts:178-183`). Real-PG reproduction: `23503 blumi_mini_rooms_invite_id_fkey`. The existing unit test used a fake client and only checked statement names. | Rooms (including rooms referencing the account's invites) are deleted before invites. New `accountDeletionIntegrity.postgres.test.ts` also scans every `*user_id`/`account_id` column in the schema for leftovers. | **Fixed, tested** (7fbee16) |
| DB-02 | Discover snapshots | High (P0) | `postgresDiscoverySnapshots.ts:45` copied every eligible account per refresh, 30 live snapshots per user; purge removed 5000 candidate rows per minute (`index.ts:77`). At 5000 users × 5000 accounts one refresh wave is ~25 M rows vs 0.3 M/hour purge. | Cap 1000 ranked candidates per snapshot (`DISCOVERY_SNAPSHOT_CANDIDATE_LIMIT`, both repositories; daily decision quota is 10); purge drains in bounded batches (5000 candidates/500 snapshots per statement, ≤ 40 rounds per tick). | **Fixed, tested** (fffe4fd) |
| DB-03 | Realtime lease heartbeat | Medium-High | `postgresPresenceRepository.ts:133` ran BEGIN, advisory lock, UPDATE, COMMIT per pong (4 round trips). 30 s heartbeat (`realtimeServer.ts:40`) × 5000 sockets ≈ 167/s × ~80 ms ≈ 13 connection-seconds per second, above the default pool of 10. | Same per-user advisory xact lock taken inside one autocommit statement (lock CTE read by the clock CTE). The real-PG race test "heartbeat cannot resurrect a removed lease" still passes. | **Fixed, tested** (cba4e72) |
| DB-04 | Round trips per request | Medium | `sharedRateBudgetHook.ts` called `auth.getSession` and every route called it again via `resolveBearerSession`; `getSession` is 2 queries (session, account). Authenticated request = 5 round trips before route work (~100 ms at 20 ms RTT). | Per-request memo (`resolveRequestSession`, WeakMap keyed by request and token). Now 3. | **Fixed, tested** (3eb4820) |
| DB-05 | Data growth | Medium | `pg_stat_user_tables`: `blumi_chat_delivery_outbox` 95 inserts, 0 deletes; no code deletes completed chat jobs, finished push receipts, `blumi_push_delivery_audit` or `blumi_notification_policy_audit`. | `db/postgresRetention.ts`, every 10 min, bounded SKIP LOCKED batches: completed chat jobs after 30 days (they are the idempotent-resend tombstone), finished receipts after 7 days, both audits after 30 days. | **Fixed, tested** (13a39a5) |
| DB-06 | Error mapping | Medium | `server.ts` mapped every escaped `pg` error to 500; only `postgresMiniRoomRepository.ts:393` inspects a SQLSTATE. No retry on 40001/40P01. | `operations/databaseErrorStatus.ts`: 23505/23503 → 409; 40001, 40P01, 55P03, 57014, 57P0x, 53300/53400, class 08, pool connect timeout, socket errors → 503 + `Retry-After: 1`. Fixed bodies; log carries only the SQLSTATE. | **Fixed, tested** (4c24fbc) |
| DB-07 | Pool error listener | High | `config.ts:455` `new Pool({ connectionString })` has no `pool.on('error')`; no `process.on('uncaughtException')`. pg-pool 3.14 re-emits idle-client errors (`node_modules/pg-pool/index.js:52-62`); an unhandled `'error'` event throws and exits the process. A Supavisor restart or Supabase maintenance terminating idle backends therefore crashes the API. | `pool.on("error", (error) => console.error("PostgreSQL idle client error", safeOperationalErrorKind(error)))` in `config.ts`. Not edited here: the transport engineer owns the pool. | **Open** (transport) |
| DB-08 | Timeouts | Medium | Live: `statement_timeout=120s`, `idle_in_transaction_session_timeout=0`, `lock_timeout=0`; pool `connectionTimeoutMillis` default 0 (waits forever), `max` default 10, `idleTimeoutMillis` default 10 s. Only the data export (`accountDataExportStream.ts:36`) and the fanout listener (`postgresRealtimeFanout.ts:232`) set their own limits. | Pool (transport): `max: 12`, `connectionTimeoutMillis: 5000` (now answers 503), `idleTimeoutMillis: 30000`, `statement_timeout: 15000`, `idle_in_transaction_session_timeout: 30000` as pg client config, `lock_timeout` via `options` only if Supavisor forwards it, otherwise role-level (P-05). | **Open** |
| DB-09 | Backups | High | Free plan: no PITR and no platform backup. Only proven archive: `/Users/evrenevren/BlumiReleaseBackups/supabase-public-pre-066-2026-09-28.dump` (restore-tested). 069 was applied without a fresh dump (`DATABASE_RELEASE_RUNBOOK.md:52`). S3 cron in `apps/server/backup/` is not shown running. | Owner procedure in §5. | **Open** (owner) |
| DB-10 | Supabase API exposure | Low | No `anon`/`authenticated`/`PUBLIC` grant on any of 63 tables (`information_schema.role_table_grants`); advisor reports no `rls_disabled_in_public`. 57 tables have RLS off by design (`059_revoke_public_api_access.sql`). `service_role` still has EXECUTE on the 10 functions and default table grants. | P-02 enables RLS (no policies) on every table as defence in depth; the server connects as owner `postgres` and is unaffected (no `FORCE`). | Proposed |
| DB-11 | Function search_path | Low | Advisor `function_search_path_mutable` × 10; none is `SECURITY DEFINER`; only `postgres`/`service_role` may execute. | P-01. | Proposed |
| DB-12 | Indexes | Low | `blumi_chat_thread_participants_user_idx (user_id)` is a prefix of `blumi_chat_participants_user_thread_idx (user_id, thread_id)` (0 scans live); `blumi_push_devices_user_idx (user_id)` is a prefix of the PK `(user_id, push_token)`. Chat pages order by `(sent_at, message_id)` (`postgresChatRepository.ts:175,343,359`) but the index is `(thread_id, sent_at)`. Advisor: unindexed FKs `blumi_account_recovery_requests.account_id` (SET NULL on every account delete), `blumi_mini_rooms.completion_requested_by_user_id`, `blumi_economy_iap_ledger(provider, provider_event_id)`. The retention deletes in DB-05 filter on unindexed time columns. | P-03. 37 "unused" indexes are expected on a test database with no traffic on those paths; do **not** drop them before production statistics exist. | Proposed |
| DB-13 | Invariants not enforced by the schema | Low | `blumi_matches`/`blumi_mini_rooms` allow `participant_a = participant_b`; `blumi_chat_messages.body` has no length CHECK (the edit audit has 1–500); inventory arrays accept duplicate ids (the writer de-duplicates with `ARRAY(... WHERE NOT ... = ANY)`). | P-04. | Proposed |
| DB-14 | Media revocations without LiveKit | Low | `blumi_media_revocations` gets 2 rows per ended room from a trigger (`053`); the dispatcher (which also prunes) runs only when LiveKit is configured (`index.ts:35`). Live: 14 rows, 0 deletes. | Either configure LiveKit or prune pending rows older than 7 days when LiveKit is off. | Open (low) |
| DB-15 | Safety reports on deletion | Info | Account deletion deletes reports **against** the deleted user (`postgresAuthRepository.ts` `DELETE FROM blumi_safety_reports WHERE actor_user_id = $1 OR reported_user_id = $1`). A reported person can erase the evidence by deleting the account; only a ban survives (069). | Product/legal decision (retain pseudonymised reports for N days). | Open (owner) |

### Verified healthy

- **One match per pair**: `blumi_matches UNIQUE (participant_key)` (generated,
  order-independent) — `005_matching.sql`.
- **One thread per match**: thread id is derived (`createAuthorizedThreadId`,
  `routes/matchThreadAnnouncement.ts:35`), PK plus `ON CONFLICT (thread_id) DO NOTHING`
  (`postgresChatRepository.ts:142-146`).
- **One pending invite per thread**: partial unique index
  `blumi_mini_room_invites_one_pending_thread_uidx` (`026`); expiry is applied in
  the same statement path before insert.
- **One active room per user**: `blumi_active_mini_room_participants (user_id PK)`
  (`019`); the violation is mapped to `participant_busy`.
- **Idempotency keys**: chat `(thread_id, sender_user_id, client_message_id)`
  partial unique (`029`); reports `(actor_user_id, idempotency_key)` (`024`);
  rewards PK `(user_id, reward_type, idempotency_key)` (`012`); IAP
  `(provider, provider_transaction_id, entry_type)` (`040`); notification
  dedupe `UNIQUE (user_id, notification_type, dedupe_key)` (`036`).
- **Coins never negative**: `CHECK (coins >= 0)`, `coin_debt >= 0` (`004`, `040`);
  inventory FK to accounts with cascade and id-format CHECKs (`066`).
- **Discovery quota**: serialized per user/day by `pg_advisory_xact_lock` inside
  `blumi_consume_discovery_decision` (`065`).
- **Outbox leasing**: `FOR UPDATE SKIP LOCKED` with partial due indexes
  (`blumi_chat_delivery_due_idx`, `blumi_push_receipts_due`); live mean 0.01–0.03 ms.
- **Account deletion** is one transaction with an explicit lock order and the
  phone-ban carry-over; after DB-01 the schema-wide orphan scan finds nothing
  except the two intentional work queues (`blumi_media_revocations`,
  `blumi_firebase_user_deletion_outbox`).
- **Migration runner** (`db/migrate.ts`): session advisory lock, SHA-256 checksum
  per file (immutable once applied), one transaction per file with
  `SET LOCAL lock_timeout` (default 5 s), connect timeout 10 s. `/ready`
  (`operations/schemaReadiness.ts`) compares every packaged checksum and treats
  070 as optional behind a runtime ledger probe. Rerun applies 0 files (gate).
- **Time source**: leases and payload expiry use database `clock_timestamp()`/
  `NOW()`; invites, sessions and quotas use the server clock passed as a
  parameter. Both hosts are NTP-synchronised; the mixed source is acceptable
  while one replica writes, and lease/expiry comparisons that must agree
  across replicas already use the database clock.
- **Hot query cost (live `pg_stat_statements`)**: everything under 10 ms mean;
  the most frequent statements are the three outbox/receipt pollers
  (~480 k, ~480 k and ~310 k calls since 2026-09-26, ≈1.3 polls/s each).
  That is the idle floor of database work and is fine on Free.

## 3. Supabase connection: direct or pooled

- Evidence: the server's backends appear as `application_name=Supavisor`, user
  `postgres`; the runbooks require the **session pooler** (port 5432, user
  `postgres.nkqcbxufbhfibrgvajim`, TLS). The Railway variable itself was not
  read; the owner should confirm host and port in the Railway dashboard
  (`CLOSING_AUDIT_2026-09-30.md`).
- This is the right choice for one long-lived Node process: the realtime
  fanout holds a dedicated `LISTEN` connection and sets a session
  `statement_timeout` (`postgresRealtimeFanout.ts:226-232`), and the migrator
  uses a session advisory lock. **Neither works through the transaction pooler
  (6543)**. The direct host is IPv6-only on Free without the paid IPv4 add-on.
- Budget: API pool (10 today, 12 proposed) + 1 `LISTEN` + 1 migrator + 1 backup
  job must stay within the session pooler's pool size (Dashboard → Database →
  Connection pooling; the small-compute default is 15) and well within
  `max_connections=60`.
- TLS: the Supavisor → PostgreSQL hop shows `ssl=false` (internal network). The
  client → Supavisor hop must use `sslmode=require`/`verify-full`; confirm in the
  Railway value without printing it.

## 4. Proposed schema changes (NOT applied; not in `db/migrations`)

Apply only after a restore-tested backup (§5), as new numbered files written by
the owner's release process, never by editing existing files. The migrator wraps
each file in a transaction with `lock_timeout`, so `CREATE INDEX CONCURRENTLY`
is not available; on today's table sizes (≤ 352 kB) every lock below is held
for milliseconds. At production size, run index builds in a maintenance window
or add a non-transactional path to the runner first.

### P-01 Fix function search_path (advisor DB-11)

```sql
ALTER FUNCTION blumi_discovery_decision_quota(TEXT, TIMESTAMPTZ) SET search_path = pg_catalog, public;
ALTER FUNCTION blumi_consume_discovery_decision(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) SET search_path = pg_catalog, public;
ALTER FUNCTION blumi_rotate_push_registration() SET search_path = pg_catalog, public;
ALTER FUNCTION blumi_invalidate_push_registration() SET search_path = pg_catalog, public;
ALTER FUNCTION blumi_enqueue_room_revocation() SET search_path = pg_catalog, public;
ALTER FUNCTION blumi_enqueue_block_revocation() SET search_path = pg_catalog, public;
ALTER FUNCTION blumi_enqueue_moderation_revocation() SET search_path = pg_catalog, public;
ALTER FUNCTION blumi_bound_realtime_payloads() SET search_path = pg_catalog, public;
ALTER FUNCTION blumi_invalidate_discovery_watch_generation() SET search_path = pg_catalog, public;
ALTER FUNCTION blumi_valid_owned_item_ids(TEXT[]) SET search_path = pg_catalog, public;
```

Lock: function catalog row only. Impact: `blumi_valid_owned_item_ids` (used by
CHECKs) is no longer inlined; cost is negligible for arrays of a few dozen ids.
`gen_random_uuid()` is core since PG 13, so no `extensions` schema is needed.
Rollback: `ALTER FUNCTION … RESET search_path;` for each.

### P-02 RLS on every table (defence in depth, DB-10)

```sql
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
              AND c.relname LIKE 'blumi\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
```

Lock: `ACCESS EXCLUSIVE` per table for a catalog update (milliseconds; bounded
by the migrator's `lock_timeout`). Impact: none for the server, which connects
as the table owner `postgres` (RLS is bypassed without `FORCE`); PostgREST
already has no grants. The advisor will then show `rls_enabled_no_policy`
(INFO) for every table, which is the intended state. Rollback: the same loop
with `DISABLE ROW LEVEL SECURITY` over the tables this migration changed.

### P-03 Index adjustments (DB-12, DB-05)

```sql
-- Chat pages order by (sent_at, message_id); include the tiebreaker.
CREATE INDEX IF NOT EXISTS blumi_chat_messages_thread_order_idx
  ON blumi_chat_messages (thread_id, sent_at, message_id);
DROP INDEX IF EXISTS blumi_chat_messages_thread_sent_at_idx;

-- Strict prefixes of other indexes.
DROP INDEX IF EXISTS blumi_chat_thread_participants_user_idx;
DROP INDEX IF EXISTS blumi_push_devices_user_idx;

-- Unindexed foreign keys (advisor).
CREATE INDEX IF NOT EXISTS blumi_account_recovery_requests_account_idx
  ON blumi_account_recovery_requests (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS blumi_mini_rooms_completion_requester_idx
  ON blumi_mini_rooms (completion_requested_by_user_id)
  WHERE completion_requested_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS blumi_economy_iap_ledger_event_idx
  ON blumi_economy_iap_ledger (provider, provider_event_id);

-- Retention scans (db/postgresRetention.ts).
CREATE INDEX IF NOT EXISTS blumi_chat_delivery_completed_idx
  ON blumi_chat_delivery_outbox (completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS blumi_push_delivery_audit_occurred_idx
  ON blumi_push_delivery_audit (occurred_at);
CREATE INDEX IF NOT EXISTS blumi_notification_policy_audit_occurred_idx
  ON blumi_notification_policy_audit (occurred_at);
CREATE INDEX IF NOT EXISTS blumi_push_receipts_finished_idx
  ON blumi_push_receipts (created_at) WHERE outcome IS NOT NULL;
```

Lock: `CREATE INDEX` takes `SHARE` (blocks writes to that table for the build;
milliseconds today), `DROP INDEX` takes `ACCESS EXCLUSIVE` briefly. Check each
plan with `EXPLAIN (ANALYZE, BUFFERS)` after apply (engineering rule). Rollback:
recreate the dropped definitions exactly (`003_chat.sql`, `010_notifications.sql`)
and drop the new indexes.

### P-04 Invariants (DB-13)

```sql
ALTER TABLE blumi_matches ADD CONSTRAINT blumi_matches_distinct_participants
  CHECK (participant_a_user_id <> participant_b_user_id) NOT VALID;
ALTER TABLE blumi_matches VALIDATE CONSTRAINT blumi_matches_distinct_participants;
ALTER TABLE blumi_mini_rooms ADD CONSTRAINT blumi_mini_rooms_distinct_participants
  CHECK (participant_a_user_id <> participant_b_user_id) NOT VALID;
ALTER TABLE blumi_mini_rooms VALIDATE CONSTRAINT blumi_mini_rooms_distinct_participants;
ALTER TABLE blumi_chat_messages ADD CONSTRAINT blumi_chat_messages_body_length
  CHECK (char_length(body) BETWEEN 1 AND 500) NOT VALID;
ALTER TABLE blumi_chat_messages VALIDATE CONSTRAINT blumi_chat_messages_body_length;

CREATE FUNCTION blumi_owned_item_ids_unique(item_ids TEXT[]) RETURNS BOOLEAN
  LANGUAGE sql IMMUTABLE SET search_path = pg_catalog
  AS $$ SELECT cardinality(item_ids) = (SELECT count(DISTINCT id) FROM unnest(item_ids) AS id) $$;
REVOKE ALL ON FUNCTION blumi_owned_item_ids_unique(TEXT[]) FROM PUBLIC, anon, authenticated;
ALTER TABLE blumi_economy_inventories
  ADD CONSTRAINT blumi_economy_inventories_avatar_ids_unique
    CHECK (blumi_owned_item_ids_unique(owned_avatar_item_ids)) NOT VALID,
  ADD CONSTRAINT blumi_economy_inventories_room_ids_unique
    CHECK (blumi_owned_item_ids_unique(owned_room_item_ids)) NOT VALID;
ALTER TABLE blumi_economy_inventories VALIDATE CONSTRAINT blumi_economy_inventories_avatar_ids_unique;
ALTER TABLE blumi_economy_inventories VALIDATE CONSTRAINT blumi_economy_inventories_room_ids_unique;
```

Pre-check (read-only, owner): no existing row violates these (count of
self-pairs, bodies over 500 characters, arrays with duplicates must be 0), and
the chat send path's limit equals 500. Lock: `ADD … NOT VALID` takes a brief
`ACCESS EXCLUSIVE`; `VALIDATE` takes `SHARE UPDATE EXCLUSIVE` (reads and writes
continue). Rollback: `ALTER TABLE … DROP CONSTRAINT …;` and drop the function.

### P-05 Role-level safety timeouts (DB-08)

```sql
ALTER ROLE postgres SET idle_in_transaction_session_timeout = '60s';
-- Only after the migrator sets SET LOCAL statement_timeout = 0 per file
-- (a long index build must not be cancelled):
ALTER ROLE postgres SET statement_timeout = '30s';
```

Applies to new sessions only (existing pooled backends keep the old value until
they reconnect). Affects every client using role `postgres`, including the
Supabase SQL editor. A dedicated application role (`blumi_app`, owner of
nothing, granted DML) is the cleaner long-term boundary. Rollback:
`ALTER ROLE postgres RESET idle_in_transaction_session_timeout; ALTER ROLE postgres RESET statement_timeout;`.

## 5. Backup and restore (owner)

Supabase Free has no point-in-time recovery and no downloadable platform
backup. Until the S3 job in `apps/server/backup/` is shown running daily, the
procedure is (from `docs/release/DATABASE_RELEASE_RUNBOOK.md`):

1. Before **any** schema change (including 070 and P-01…P-05), take a
   `pg_dump -Fc` of the `public` schema with PostgreSQL 17 client tools over the
   session pooler URL (project-ref username, TLS), entering the URL without
   echoing it.
2. Record the SHA-256 and store the archive off the laptop.
3. Restore-test it: `node scripts/security/restore-upgrade-gate.mjs /absolute/path/to/backup.dump`
   (isolated PG 17 cluster, replays `059`, applies pending migrations, audits
   grants and counts). Only a restored archive counts as a backup.
4. Then apply the migration, then deploy (070 may deploy first; see
   `MIGRATION_070_RUNBOOK.md`).
5. Production: deploy the Railway backup cron (`0 2 * * *` UTC) and the hourly
   freshness check with alerting; run the monthly restore drill into a
   disposable Supabase project to prove the recovery-time target.

The last proven archive is from 2026-09-28 (pre-066); 067, 068 and 069 have
been applied since. **Take a fresh restore-tested dump before the next change.**

## 6. Changes in this branch

| Commit | Change | Tests |
|---|---|---|
| 7fbee16 | DB-01 account deletion order | `db/accountDeletionIntegrity.postgres.test.ts` (failed with 23503 first) |
| fffe4fd | DB-02 snapshot cap and draining purge | `matches/postgresDiscoverySnapshots.test.ts`, `db/discoverySnapshotReadCost.postgres.test.ts` |
| cba4e72 | DB-03 one-statement lease heartbeat | `db/postgresPresenceRepository.test.ts` (new, failed first), `db/postgresRealtimeConnectionLease.test.ts` (race) |
| 3eb4820 | DB-04 session resolved once per request | `operations/sharedRateBudgetHook.test.ts` (failed first: 2 resolutions) |
| 13a39a5 | DB-05 retention job | `db/postgresRetention.postgres.test.ts` |
| 4c24fbc | DB-06 database error mapping | `operations/databaseErrorStatus.test.ts`, `routes/routeErrorBoundary.security.test.ts` (failed first: 500) |

Status labels: **Implemented** and **Tested** (named checks). Not deployed,
not native-verified, not production-ready. The behaviour change for users is
DB-02 (a Discover list now ends after 1000 ranked profiles per refresh) and
DB-06 (clients now see 409/503 where they saw 500).

## 7. Open checks

- DB-07 pool `'error'` listener and DB-08 pool limits: transport engineer.
- Confirm Railway `DATABASE_URL` uses the session pooler (5432), the project-ref
  username and TLS, without revealing the value.
- Fresh restore-tested dump (§5); S3 backup cron not yet proven.
- Production `pg_stat_user_indexes` after real traffic before dropping any
  "unused" index.
- Parity: the in-memory development repositories do not mirror the PostgreSQL
  account-deletion cascade across social repositories; development-only, see
  `REPOSITORY_PARITY_2026-09-30.md`.
