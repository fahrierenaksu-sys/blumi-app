# Backend teknoloji kararı (2026-10-01)

Historical record — not an instruction; see AGENTS.md.

## Sahip için özet (Türkçe)

**Soru:** "En iyi, en hızlı, en sağlam, en yeni teknoloji; ama ek masraf yok."

**Kısa cevap:** Altyapıyı değiştirmeye gerek yok. Yavaşlığın asıl nedeni
kullanılan teknoloji değil. Her sohbet mesajı veritabanına sırayla 11-16 kez
gidip geliyor ve her gidiş-dönüş yaklaşık 20 ms sürüyor. WebSocket
kütüphanesini, Node sürümünü ya da veri formatını değiştirmek bunu düzeltmez.
Bu sorguları birleştirmek düzeltir.

| | Karar |
|---|---|
| **Koru** | Node 22, Fastify 5, `ws` 8, `pg` 8, JSON, Railway'de tek kopya, Supabase Free, Expo Push |
| **Hemen yap** | 1) Sohbet gönderimini 11 sıralı sorgudan tek SQL ifadesine indir. 2) Node 22'yi en son güvenlik sürümüne sabitle (yerelde 22.22.2 var, iki güvenlik sürümü geride). 3) Supabase'in "egress" (dışarı veri) kotasını ölç; sessizce dolabilir. |
| **Sonra yap** | Node 24 LTS'e geçiş (2027 Nisan'dan önce), gerekirse Supabase "transaction pooler", Fastify 6 çıktığında yükseltme, 2. kopya için hareket olaylarını toplu NOTIFY ile paylaşma |
| **Yapma** | uWebSockets.js, Bun, Deno, MessagePack/CBOR, HTTP/2, Supabase Realtime, sunucuda pg-native |

**Ölçülen kazanç (bu makinede, 20 ms veritabanı gecikmesiyle):**

- Bir sohbet mesajının kaydı **265 ms'den 25 ms'ye** iner (tek SQL ifadesi;
  bugünkü zincirin kopyası ile ölçüldü).
- 10 bağlantılık havuzla saniyede kaydedilebilen mesaj **50'den 341'e**
  çıkar (yaklaşık 7 kat).
- WebSocket kütüphanesini değiştirmek 5.000 bağlantıda en fazla ~40 MB RAM
  ve tek çekirdeğin ~%15'ini kazandırır. Railway faturasında bu ayda yaklaşık
  0,5-3 dolar eder ve kullanıcının hissettiği hızı değiştirmez.

**Maliyet:** Önerilen "hemen yap" maddelerinin hiçbiri para gerektirmez.
Sessizce para yakabilecek üç nokta var:

1. Railway Hobby paketinin 5 dolarlık kullanım hakkı aşılırsa fark faturalanır.
2. Supabase Free'nin aylık 5 GB egress kotası. Veritabanından sunucuya giden
   her sorgu sonucu bu kotaya sayılır.
3. Firebase ile telefon doğrulamada her SMS ülkeye göre ücretlendirilir;
   Blaze paketi gerekir.

**Risk:** Sohbet sorgusu değişikliği orta riskli bir koddur ama küçüktür ve
mevcut testlerle korunur. Hiçbirinde veri göçü (migration) yoktur. Runtime
veya kütüphane değiştirmek ise yüksek risklidir ve ölçülebilir bir kazanç
getirmez. Bu yüzden hepsi reddedildi.

**Tek kopyanın tavanı:** Railway'in kenar sunucusu 10.000 eşzamanlı bağlantıya
izin veriyor; 5.000 kullanıcı hedefi bunun içinde. Asıl sınır sohbet
hızıdır: bugün saniyede yaklaşık 30 mesaj. Sohbet düzeltmesinden sonra bu
yaklaşık 160 mesaj/saniye olur, transaction pooler ile ~600'ün üzerine çıkar.

---

## English detail

Status labels follow `AGENTS.md`. This is a **decision document**. No production
code, Railway variable, `DATABASE_URL`, Supabase data or migration was touched.
Every number below was either measured on this machine (4 vCPU Linux container,
local PostgreSQL 16, injected latency) or comes from an official source with
the date it was read (2026-10-01). Nothing here was measured on Railway,
Supabase, or a phone.

Companion document: `docs/quality/REALTIME_CAPACITY_2026-10-01.md` covers the
transport hardening and the 5,000-user harness. It was staged on the
integration branch's in-progress merge when this was written. This document
reuses its harness numbers and does not repeat its transport work: per-user
index, encode once, NOTIFY skipped with one instance, batched leases, pool
settings, and the zod 4 / TypeScript 7 assessment.

### Verified current stack

From `package.json`, `apps/server/package.json`, `package-lock.json`, `.nvmrc`
and `.railway/railway.ts`:

- Runtime: `engines.node` `>=22.22.2 <23`; `.nvmrc` `22.22.2`; local and CI
  `v22.22.2`.
- Server: fastify 5.12.3 (latest 5.12.5; 6.0.0-alpha.4 on `next`), ws 8.22.0
  (latest), pg 8.23.0 (latest 8.23.1), zod 3.25.76, firebase-admin 14.5.0,
  fast-json-stringify 7.0.1 (via Fastify).
- Railway: one replica, Railpack build `npm ci --include=dev && npm run
  build:server`, healthcheck `/ready`.
- Supabase: Free plan (Nano), Supavisor **session** pooler on port 5432
  (`docs/release/railway-supabase-launch.md`), PostgreSQL 17, eu-west-1.
  Railway runs in europe-west4, roughly 15-25 ms away (estimated, not
  measured).

### Root cause, measured

The chat send path before the acknowledgement, counted against today's code
(`threadRoutes.ts`, `sharedRateBudgetHook.ts`, `chatMessageDeliveryService.ts`,
`chatService.ts`, `postgresChatRepository.ts`), has these sequential steps:

1. Session lookup (preHandler)
2. Account lookup (preHandler)
3. Rate budget upsert (preHandler)
4. Session lookup again (route)
5. Account lookup again (route)
6. `findThread`
7. `loadParticipants`
8. Two block lookups, run in parallel
9. `findThread` again
10. `loadParticipants` again
11. Message insert, as one CTE with the outbox row

Delivery after the acknowledgement adds another 4-6 round trips. Commit
`2a114cf` ("read the chat thread once per message send") and the companion
transport work already removed some of these. The companion harness counts
12.4 round trips per room message and 16.1 per HTTP message in total.

With pool size `P` and round trip `R`, the database ceiling is `P / R`
statements per second: 10 / 20 ms = 500. Every chat message consumes 12-16 of
them. **Chat throughput and latency are bounded by round trips × distance, not
by CPU, the WebSocket library or the runtime.**

### Decision table

| Option | Evidence (link + date, or measurement in the appendix) | Gain | Risk | Effort | Decision |
|---|---|---|---|---|---|
| **Chat send as one SQL statement** (session + account + rate budget + participant + block + insert + outbox) | M1 and M2: 265 → 25 ms p50 at 20 ms RTT; 50 → 341 sends/s on pool 10; 50 → 542 on pool 15 | 7-10× chat capacity, about 10× lower send latency. Works on the session and the transaction pooler. | Medium: auth, moderation and block rules move into SQL, so their error mapping needs tests | M (2-3 PRs) | **ADOPT NOW** |
| Merge only the duplicate reads (session+account and thread+participants+block become one query each; 3 statements) | M1, M2: 68 ms p50, 149 sends/s | 3× | Low | S | **ADOPT NOW** as step 1 of the item above |
| pg 8.23 pipelining (`pipeline: true`, 2 round trips) | [node-postgres pipelining](https://node-postgres.com/features/pipelining) (2026-10-01); M1: 50 ms p50; M2: 196/s | Lower than one statement; keeps the decision logic in JS | Needs `pool.connect()`. **Not supported by the Supavisor transaction pooler** ([Supabase: connecting](https://supabase.com/docs/guides/database/connecting-to-postgres), 2026-10-01) | S | **REJECT** (one statement is better and works on every pooler) |
| Named prepared statement for the merged statement | M3: 1,225-1,501 → 4,096-4,104 ops/s CPU-bound (RTT 0); planning a large CTE costs about 0.5 ms | 3× less database CPU per send, which helps the shared Nano CPU | Not supported in transaction mode (same source). Works in session mode. | XS | **ADOPT LATER**, only while on the session pooler, behind a flag |
| postgres.js 3.4.9 instead of pg | M1: `sql.unsafe` with parameters is about 2× slower than pg per sequential statement (Describe adds a round trip); with `prepare: true` and one statement it matches pg (24.5 vs 25.2 ms); M2 pipelined: 87/s vs pg 196/s | None over pg + one statement | Driver swap across about 25 repositories plus the fanout LISTEN code | L | **REJECT** |
| pg-native (libpq) | Not measured; native build needs libpq-dev in Railpack | Small CPU only; latency is network bound | Native build, supply chain | M | **REJECT** |
| Supavisor transaction pooler (6543) with pool 40, LISTEN on the session URL | [Supabase compute: Nano, 60 direct, 200 pooler clients](https://supabase.com/docs/guides/platform/compute-and-disk) (2026-10-01); companion harness: 1,618 RT/s on pool 40 | 4× ceiling, free | Loses prepared statements and pipelining; staging needed; owner sets variables | S (config) | **ADOPT LATER**: after the chat statement, only if measured load needs it (owner decision, see the capacity doc §5) |
| Node 22 → latest 22.x patch | [Node dist index](https://nodejs.org/dist/index.json) (2026-10-01): 22.23.0 (2026-06-17) and 22.23.2 (2026-07-28) are security releases after the pinned 22.22.2; latest is 22.23.3 | Security fixes | Very low | XS | **ADOPT NOW** |
| Node 24 LTS (24.21.0) | [Release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) (2026-10-01): 22 maintenance until **2027-04-30**; 24 active LTS → maintenance 2026-10-20, EOL **2028-04-30**. M4/M5: no consistent performance difference (ws server: connect CPU 690-720 vs 850 ms, RSS per socket 11-12 vs 8.4 KB; JSON within noise) | One more year of support; newer V8, undici, stable permission model | Low to medium: root `engines` also governs the mobile toolchain (Metro, EAS) | S | **ADOPT LATER** (Q4 2026 – Q1 2027, before 22's EOL) |
| Node 26 | Schedule: LTS on 2026-10-28 | — | Not LTS today | — | **REJECT now**, revisit in 2027 |
| `ws` 8 (keep) | M4: about 15% of one core at 2,500 msgs/s and about 30% at about 9,600 msgs/s for 5,000 sockets; 8-12 KB RSS per socket | — | — | — | **KEEP** |
| uWebSockets.js v20.71.0 | M4: about 2× less server CPU per message (6-8% vs 12-15% at 2,500/s), 1.3-2.8 KB vs 8-12 KB RSS per socket, about 4× less CPU per connect. Distributed **only from GitHub** (`registry.npmjs.org/uWebSockets.js` returns 404, checked 2026-10-01; [README](https://github.com/uNetworking/uWebSockets.js) says "We aren't in the NPM registry"). Prebuilt `.node` binaries per ABI (127/137/147 = Node 22/24/26) committed to a branch; Apache-2.0. | About $0.5-3 per month of Railway RAM/CPU at 5,000 users; no user-visible latency change (DB bound) | High: a git dependency outside npm provenance and audit, opaque native binaries, a single maintainer. It replaces the `ws` API used across `realtimeServer`, `connectionManager` and the slow-consumer policy (`bufferedAmount` semantics differ). Railway works (plain TCP). | L | **REJECT** (revisit only if CPU ever becomes the bottleneck) |
| Bun 1.3.11 / 1.4.2 as runtime | M4: Bun.serve is close to uWS (2.6 KB per socket, 7-8% CPU at 2,500/s). M6: the real server boots and serves `/health` and `/ready` under Bun, but **a rejected WebSocket upgrade returns an empty reply instead of `401`**. The mobile client treats 401 as "stop retrying" and a network error as "retry", so behaviour changes silently. | Small CPU/RAM | High: compatibility gaps in `node:http` upgrade handling; firebase-admin/gRPC and sharp unverified | L | **REJECT** |
| Deno 2 | Not installed or measured | — | Same class of risk as Bun, plus permission and runtime differences | L | **REJECT** |
| MessagePack / CBOR instead of JSON | M5: bytes saved 6-10% (231 → 207 B move, 376 → 354 B message, 22.6 → 20.6 KB thread list); round trip **slower**: msgpackr 0.4-0.7× JSON on Node, 0.17-0.3× on Bun. Hermes on the phone not measured; JSON.parse is native there. | None | Wire contract change on both ends | M | **REJECT** |
| perMessageDeflate | Off today; [ws README](https://github.com/websockets/ws/blob/master/README.md) warns of "catastrophic memory fragmentation" under concurrency | — | — | — | **KEEP off** |
| Fastify 5 (patch to 5.12.5) | npm `fastify` dist-tags 2026-10-01: latest 5.12.5, next 6.0.0-alpha.4 | Fixes | Very low | XS | **KEEP**, routine patch bump |
| Fastify 6 | Alpha only | — | Breaking changes | M | **ADOPT LATER** after GA and plugin support |
| fast-json-stringify response schemas on hot routes | M5: thread list (20): JSON.stringify 11.5-17k ops/s vs fjs 6.5-8k; message envelope: JSON.stringify 0.68-1.5M ops/s vs fjs 0.73-0.94M | None or negative for our nested shapes | — | — | **REJECT** as a performance lever. Keep response schemas only for contract and leak safety where they already exist. |
| Keep-alive / timeouts | [Railway specs](https://docs.railway.com/networking/public-networking/specs-and-limits) (2026-10-01): edge idle HTTP/1.1 60 s; WebSockets exempt; 10,000 concurrent connections; 10,000 requests per connection. Fastify's default `keepAliveTimeout` is 72 s, which is above 60 s. | — | Lowering it below 60 s risks 502s on reused upstream connections | — | **KEEP** defaults; do not set it below 61 s |
| HTTP/2 in the app | Same Railway page: HTTP/2 "is demuxed down to HTTP/1.1" to the app | None (phones already get HTTP/2 at the edge) | — | — | **REJECT** |
| Supabase Realtime instead of our WebSocket | [Realtime limits](https://supabase.com/docs/guides/realtime/limits) and [pricing](https://supabase.com/pricing) (2026-10-01): Free has 200 concurrent connections, 100 msgs/s and 2M msgs/month; Pro charges $10 per 1,000 extra peak connections and $2.50 per 1M messages | — | 5,000 users need Pro ($25) plus about $48 for connections plus messages (500 rooms × 1 move / 2 s ≈ 250 msgs/s ≈ 650M per month ≈ $1,600). Not free. | — | **REJECT** |
| Expo Push (keep) | [Expo docs](https://docs.expo.dev/push-notifications/sending-notifications/) (2026-10-01): 600 notifications/s per project, 100 per request; no price stated | — | Today one HTTP request per token (`pushProvider.ts`) | — | **KEEP**; batch up to 100 per request later if send volume grows |
| Horizontal: second replica | [Railway scaling](https://docs.railway.com/reference/scaling) (2026-10-01): random distribution, "does not support sticky sessions". Hobby allows up to 6 replicas. | Survives one instance failing | Breaks MiniRoom motion and presence consistency (see below); about +$2.5-5 per month | M | **ADOPT LATER** with the design below |

### Free-tier realities: what can silently cost money

| Service | Limit (official, read 2026-10-01) | Our exposure | Action |
|---|---|---|---|
| Railway | [Plans](https://docs.railway.com/reference/pricing/plans): Free has 0.5 GB / 1 vCPU / 1 replica and $1 credit. Hobby is $5 per month including $5 usage, up to 48 GB / 48 vCPU per service and 6 replicas. RAM costs $0.000231 per GB-minute (about $10 per GB-month), CPU $0.000463 per vCPU-minute (about $20 per vCPU-month), egress about $0.05 per GB. | 5,000 sockets ≈ 40-60 MB with `ws` (M4) ≈ $0.5 per month. Sustained 15% of a core ≈ $3 per month. **Above $5 of usage on Hobby is billed.** | The owner confirms the plan and sets a usage alert/limit in Railway. Check the service metrics monthly. |
| Supabase Free | [Pricing](https://supabase.com/pricing): 500 MB database, **5 GB egress** plus 5 GB cached, 50k MAU, no backups. Projects pause after 1 week of inactivity (not a risk while the API runs). [Nano](https://supabase.com/docs/guides/platform/compute-and-disk): 60 direct connections, 200 pooler clients. | Database results returned to Railway count as egress (estimated, not measured). At 50 round trips/s × about 1 KB that is about 4 GB per day, so 5 GB per month can be exceeded at modest load. The 20-thread list is 22.6 KB (M5), mostly repeated avatar data. | **ADOPT NOW:** read the egress figure on the Supabase usage page. Fewer round trips (the chat statement) and smaller thread lists reduce it. |
| Supabase Realtime | 200 connections, 100 msgs/s on Free | Not used | Keep it unused |
| Firebase phone auth | [Limits](https://firebase.google.com/docs/auth/limits): verification SMS is "Pay as you go (Blaze) plan only"; [pricing](https://firebase.google.com/pricing): "Billed per SMS sent" by country; no-cost auth up to 50k MAU | **Every OTP SMS costs money.** The Turkey rate is not on the summary page; read it in the [Identity Platform rate table](https://cloud.google.com/identity-platform/pricing). | Set a GCP budget alert. Keep the existing per-IP and per-number throttles. |
| Expo Push | 600 per second per project | Far above need | None |

### Single-replica ceiling (estimate from the measurements)

- **Sockets:** Railway edge allows 10,000 concurrent connections (documented;
  the per-service or per-domain scope is not stated). Memory at 10,000 ≈
  80-120 MB with `ws`. **Ceiling: about 10,000 connected phones.**
- **Realtime messages (transport only):** `ws` used about 30-35 µs of server
  CPU per delivered message (M4: 27-33% of one core at about 9,600/s). With 50%
  headroom on one Node thread that is **about 10,000-15,000 delivered msgs/s**.
  MiniRoom moves are local-only (0 database round trips per move with one
  instance, per the companion doc).
- **Chat messages (database bound):** `P / (R × k)` with `k` round trips per
  message:

  | Configuration | `P / (R × k)` | Capacity |
  |---|---|---|
  | Today: pool 10, 20 ms, k ≈ 16 | 10 / (0.02 × 16) | about 30 msgs/s |
  | After the chat statement: k ≈ 3 (send 1 + claim/complete 2) | 10 / (0.02 × 3) | about 160 msgs/s |
  | Plus pool 15 (session) | 15 / (0.02 × 3) | about 250 msgs/s |
  | Plus transaction pooler with 40 | 40 / (0.02 × 3) | about 650 msgs/s |

  Harness target: 127 msgs/s.

### Horizontal scale: what breaks with 2 replicas today, and the minimal fix

Railway distributes connections randomly with no stickiness, so the two
partners of a MiniRoom usually land on different instances.

| State | Where it lives | With 2 replicas |
|---|---|---|
| MiniRoom motion and presence (`miniRoomMotionService`) | process memory | Snapshots diverge; a move reaches the partner only through NOTIFY, at 1 round trip per move |
| Chat, invites, matches | Postgres + `pg_notify` fanout | Correct (peer-announced NOTIFY) |
| Realtime tickets, shared request budget | Postgres | Correct |
| `@fastify/rate-limit` (100/min per address), realtime event windows, upgrade limiter | process memory | Limits become per instance (effectively doubled); safe, not exact |
| Authorization cache | process memory + revocations over the control channel | Correct (companion doc §4) |

Minimal correct design (no Redis, no extra cost):

1. **Keep `pg_notify` fanout.** Sticky routing per room is not available on
   Railway: there is no affinity and no addressable replica.
2. **Coalesce motion per instance.** Batch outgoing moves every 50 ms into one
   NOTIFY per instance. At most 20 NOTIFY/s per instance, independent of the
   room count. Payloads stay under 8,000 bytes
   ([NOTIFY docs](https://www.postgresql.org/docs/17/sql-notify.html)) or use
   the existing payload-reference path.
3. **Mirror motion snapshots from NOTIFY.** Each instance keeps a read-only
   copy of the remote participants' last position. The authority stays the
   client's own validated moves, as today.
4. **Dedicated LISTEN connection** (`BLUMI_DB_LISTEN_URL`, companion §6.7).
5. **Rate limits:** accept per-instance limits, or move the per-address limit
   into the Postgres budget table, which already exists for users.

NOTIFY takes a global lock at commit, which serializes committing writers at
very high write rates
([Recall.ai, 2025-07](https://www.recall.ai/blog/postgres-listen-notify-does-not-scale)).
This is irrelevant at 20 NOTIFY/s per instance, but it is a reason not to
NOTIFY per event.

### Migration plans for ADOPT items

Each step is a separate, reviewed change with its own tests. The order is
the recommended order.

**A. Chat send as one statement (ADOPT NOW)**

1. *Test first:* add a PostgreSQL contract test that counts round trips for
   `POST /v1/threads/:id/messages` and the realtime `chat.send_message`.
   Assert today's count so the change is visible. Reuse the harness
   instrumentation (`pg.Client.prototype.query` wrapper).
2. *Request scope:* resolve the session once per request and pass it to the
   rate budget and the route. The companion change already does this
   ("1 lookup per request"); verify it is merged.
3. *Merge reads:* add `findThreadContext(threadId, userId)`, which returns the
   participants and the block flag in one query, and use it in
   `ChatMessageDeliveryService.sendMessage` and `dispatchJob`. Remove the
   second `getParticipantThread` read from `sendMessageIdempotently` by
   passing the verified thread. Expected result: 3 statements (M1 `merged3`).
4. *One statement:* add `repository.sendMessageAuthorized(...)` (Postgres and
   in-memory, shared contract suite), modelled on `Q.all` in the appendix.
   Keep moderation, eligibility and suspension expiry decisions where they are
   today: the statement returns the account row, and JS re-checks it before
   answering. If a restricted account would have been allowed by SQL, the
   statement must not insert. Simplest: the statement takes the
   already-resolved `user_id` from step 2 and only merges thread, block, rate
   and insert. The result is 2 round trips (session read + send), which keeps
   all auth logic in JS.
5. *Delivery:* `claimDeliveries` returns the thread participants and the block
   flag via a join, so delivery needs no extra reads (claim + complete = 2).
6. *Measure:* run the companion harness (`proj-*` scenarios) before and after;
   record round trips per message and p50/p99.
7. *Rollout:* no migration, no wire change. Deploy and watch `/ready`, chat
   error rates, and Supabase egress.

**B. Node 22 security patch (ADOPT NOW)**

1. Set `.nvmrc` to `22.23.3` and `engines.node` to `>=22.23.3 <23`. Railpack
   resolves `engines` before `.nvmrc`
   ([Railpack Node](https://railpack.com/languages/node), 2026-10-01); a
   range such as `>=22.22.2` may already resolve to the newest 22.x. This is
   not verified: read the Node version line in the latest Railway build log.
2. Run `npm run verify` on 22.23.3 locally or in CI.
3. Deploy; confirm the build log shows `node@22.23.3`.

**C. Supabase egress check (ADOPT NOW, owner, read-only)**

1. Supabase dashboard → Usage → Egress for the current cycle.
2. If above about 2 GB at mid-cycle, prioritise A and trimming the thread list
   payload (participant avatar data per thread), then re-check.

**D. Node 24 LTS (ADOPT LATER, before 2027-04-30)**

1. Run the server tests and the harness on 24.x locally (server only, via
   `RAILPACK_NODE_VERSION` on staging) while the mobile toolchain stays on 22.
2. Check native modules on 24: `sharp`, `firebase-admin` (gRPC), `bufferutil`
   if ever added.
3. Move root `engines`, `.nvmrc`, CI and `@types/node` together once Expo/EAS
   confirm Node 24 for the mobile toolchain.

**E. Transaction pooler (ADOPT LATER, owner decision; details in the capacity doc §5)**

Only after A, and only if measured round trips per second approach `P / R`
on the session pooler. Keep `BLUMI_DB_LISTEN_URL` and migrations on the
session URL. Do not adopt the prepared-statement or pipelining options while
on it.

**F. Second replica (ADOPT LATER)**

Implement the motion coalescing and mirroring (design above) behind a flag,
prove it with two local instances in the harness, then set `numReplicas: 2`
on staging.

### Open (not proven here)

- Real Railway ↔ Supabase round trip. 15-25 ms is an estimate. Measure it with
  `SELECT 1` timing from the Railway service.
- Supabase Free pooler `pool_size` (believed 15) and current egress.
- Which Node version Railway actually builds.
- Hermes decode cost of alternative encodings (rejected anyway).
- Any device, Railway or Supabase measurement of the changes proposed here.

---

## Appendix: benchmarks (scripts stay in scratch, not committed)

Scripts: `…/scratchpad/backend-bench/{pg-bench.mjs, delay-proxy.mjs,
ws-server.mjs, ws-protocol.mjs, ws-client.mjs, ws-bench.mjs, enc-bench.mjs}`.

Machine: 4 vCPU Linux container, 16 GB RAM, idle after a reboot (load average
under 1.5). PostgreSQL 16.13 in a disposable cluster (created, measured,
stopped and deleted), `synchronous_commit=off` so fsync noise does not hide
round trips. Latency is injected by a TCP proxy (half the RTT each way).
Runtimes: Node 22.22.2, Node 24.21.0 (official tarball, SHA-256 verified),
Bun 1.3.11, uWebSockets.js v20.71.0 (git tag), pg 8.23.1, postgres 3.4.9.

### M1: chat send latency, sequential, one sender (ms, p50 / p95 / p99)

The schema mirrors the chat tables; the statements are copies of today's SQL.

| Variant | Statements | RTT 0 | RTT 10 ms | RTT 20 ms |
|---|---|---|---|---|
| today11 (today's chain) | 12 | 5.2 / 20.5 / 59.4 | 148 / 185 / 203 | **265 / 326 / 339** |
| seq7 (no duplicate reads) | 8 | 2.2 / 7.4 / 11.7 | 90 / 116 / 132 | 164 / 219 / 257 |
| merged3 | 3 | 1.8 / 7.4 / 12.7 | 38.5 / 52 / 74 | 68.5 / 84 / 90 |
| pipelined2 (pg 8.23 `pipeline`) | 3 | 3.6 / 10.2 / 40.3 | 23.7 / 34.8 / 44 | 49.9 / 62 / 80 |
| **cte1 (one statement)** | 1 | 2.6 / 8.4 / 14.5 | 12.0 / 21.2 / 26.3 | **25.2 / 37.1 / 41.8** |
| postgres.js seq7 (`unsafe`) | — | 2.8 / 16.3 / 30.9 | 172 / 235 / 347 | 319 / 351 / 377 |
| postgres.js pipelined2 (`reserve`) | — | 2.9 / 9.3 / 21.5 | 77 / 122 / 179 | 140 / 154 / 169 |
| postgres.js cte1 (`prepare: true`) | — | 0.5 / 3.0 / 9.2 | 11.5 / 33.5 / 41.9 | 24.5 / 30.1 / 33.0 |

### M2: chat send throughput under pool limit (RTT 20 ms, 200 concurrent senders, 8 s)

| Variant | Pool 10: sends/s (p50 ms) | Pool 15: sends/s (p50 ms) |
|---|---|---|
| today11 | **50** (6,107) | 50 (4,131) |
| seq7 | 75 (3,889) | 95 (2,631) |
| merged3 | 149 (1,566) | 200 (1,074) |
| pipelined2 | 196 (1,157) | 284 (753) |
| **cte1** | **341** (620) | **542** (385) |
| postgres.js pipelined2 | 87 (3,144) | 114 (2,172) |

### M3: prepared vs unnamed, RTT 0, 40 concurrent, pool 10 (CPU bound)

| Variant | ops/s | p50 ms |
|---|---|---|
| cte1 unnamed | 1,225; 1,501 | 30.1; 26.1 |
| cte1 named prepared | 4,104; 4,096 | 8.8; 9.2 |

### M4: WebSocket servers, equal JSON protocol

Setup: 5,000 sockets (2,500 pairs), server pinned to 1 core, 3 client
processes on the other 3 cores, chat-sized frames (376 B out). Two rounds; the
second `ws`/Node 22 run failed to record, so it has one sample. **Above about 10k msgs/s the
client processes saturate**, so latency at 10k/20k reflects the load
generator, not the server. Server CPU and memory are the reliable signals.

| Server | Connects/s | Server CPU for 5k connects | RSS per socket | Heap+ext per socket | CPU @2.5k msg/s | CPU @~9-10k msg/s | p50 / p99 @2.5k (ms) |
|---|---|---|---|---|---|---|---|
| ws, Node 22 | 1,669 | 850 ms | 8.4 KB | 3.4 KB | 15% | 33% | 1.1 / 56 |
| ws, Node 24 | 727-1,423 | 690-720 ms | 11.3-12.4 KB | 3.5 KB | 12-15% | 12-27%* | 2.6-76 / 72-518* |
| uWS, Node 22 | 1,050-1,318 | 190 ms | 2.7-2.8 KB | 0.5 KB | 6-7% | 12-14% | 2.5-7.8 / 42-160 |
| uWS, Node 24 | 928-1,167 | 190 ms | 1.3-1.5 KB | 0.5 KB | 6-8% | 12-16% | 2.5-15 / 177-456 |
| Bun.serve 1.3.11 | 907-1,186 | 390-480 ms | 2.6-2.8 KB | 0.9 KB | 7-8% | 10-14% | 0.8-2.9 / 48-101 |

\* The second `ws`/Node 24 round delivered only 6,966/s at the 10k target
(client-bound), so its CPU and latency are not comparable. Connects per second
are client-bound for every server.

### M5: encoding and serialization (ops/s, encode + decode round trip)

| Event (JSON bytes → msgpack / CBOR) | Node 22 JSON / msgpackr / cbor-x | Node 24 | Bun 1.3.11 |
|---|---|---|---|
| avatar_moved (231 → 207 / 208) | 448k / 221k / 197k | 439k / 256k / 263k | 668k / 115k / 85k |
| message_received (376 → 354 / 355) | 233k / 169k / 123k | 383k / 137k / 211k | 371k / 113k / 105k |
| thread_listed, 20 threads (22,606 → 20,559 / 20,597) | 10.0k / 3.5k / 1.5k | 7.0k / 3.5k / 3.0k | 9.0k / 2.0k / 1.5k |

Response serialization, JSON.stringify vs fast-json-stringify (ops/s): thread
list (20) on Node 22 13.5k vs 6.5k, Node 24 11.5k vs 8.0k, Bun 17k vs 6.5k;
message envelope on Node 22 682k vs 936k, Node 24 815k vs 730k, Bun 1.52M vs
836k.

### M6: Bun compatibility smoke test (real server, in-memory repositories)

`bun apps/server/src/index.ts` with `BLUMI_AUTH_REPOSITORY=memory`: `/health`
returned 200 and `/ready` returned 200. An upgrade to `/ws` without a ticket
returned an **empty reply** under Bun versus **`HTTP/1.1 401 Unauthorized`**
under Node 22 (`node --import tsx`, same tree).

### Harness numbers reused (companion run, read-only)

These come from the transport engineer's harness on the same machine (runs in
scratch `runs/*.json`), 5,000 users / 500 rooms / 500 HTTP pairs at +20 ms:

- Pool 10 sustained 406-408 round trips/s; pool 40 sustained 1,618.
- In-memory: 5,000 sockets used 48% of one core including client threads,
  about 5-6 KB heap per socket.
- One pair at +20 ms: room chat acknowledgement 130 ms, HTTP chat 196 ms,
  end-to-end 216-282 ms.
