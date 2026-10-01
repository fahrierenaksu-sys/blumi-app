# Realtime transport and capacity (2026-10-01)

Scope: the WebSocket transport (server `apps/server/src/realtime/*`, the
`@blumi/realtime-client` package, the mobile realtime lifecycle), connection
setup, database pool settings, and a local load harness. Chat persistence,
MiniRoom room rules, notifications and discovery are owned elsewhere; findings
for them are proposals below, not changes. Status: **Implemented and Tested
locally.** No native, device, staging or production evidence.

Target from the owner: 5,000 connected users, 500 simultaneous MiniRooms
(1,000 people walking and chatting), on the current zero-extra-cost setup: one
Railway replica (europe-west4) and Supabase Free (eu-west-1, about 15-25 ms
round trip, default node-postgres pool of 10 with one connection held by
LISTEN).

## 1. What changed

| Area | Before | After |
|---|---|---|
| Dead-socket detection (server) | ping every 30 s, terminate after a missed pong: 30-60 s | ping and a `realtime.heartbeat` beacon every 15 s; any inbound frame also counts; terminated after one silent interval: 15-30 s |
| Dead-socket detection (phone) | none: a half-open socket (Wi-Fi to cellular, NAT timeout) looked connected until the OS gave up | after the first beacon, no frame for interval + 10 s (25 s) closes with 4000 and reconnects at once; checked again on foreground |
| Background / sign-out | close without a code | close 1000 with a reason; the server releases the socket at once |
| Reconnect | 0.5-1 s, then up to 30 s, then 60 s forever | first retry 0-1 s (full jitter), 0-5 s after a server-wide close (1001/1012/1013); then 1-2, 2-4, 4-8, 7.5-15 s; slow retries at most 30 s apart |
| Server shutdown | sockets closed without a code; one cleanup transaction per socket | 1012 so phones spread their first retry; one batched cleanup |
| Socket close | a 6-round-trip cleanup transaction per closed socket (30,000 round trips when 5,000 sockets drop together) | in-memory state (MiniRoom motion) released at once; leases removed after a 50 ms window, one statement per 100 sockets |
| Resync after reconnect | thread list + the open conversation | also every cached conversation whose latest message changed while offline (at most 5) |
| Authorization per event | cache TTL 2 s, two sequential queries per miss, checked per inbound event and per recipient | primed by the upgrade's own ticket check, refreshed for all sockets by a batched sweep, dropped at once on revocation (also from other instances), TTL 60 s backstop, never past the session's own expiry |
| Authorization sweep | 2 queries per socket every 30 s (333 queries/s at 5,000) | 2 queries per 500 sockets every 30 s |
| Lease renewal | a 4-round-trip transaction per pong per socket every 30 s (667 round trips/s at 5,000) | one batched statement per 100 due sockets, renewed every 30 s |
| Lease registration | 4 round trips per upgrade | 1 (same lock, one statement) |
| HTTP session lookups | 2-3 lookups (2 queries each) per authenticated request | 1 per request (shared by the request budget and the route); the ticket route reuses it |
| Cross-instance NOTIFY | one `pg_notify` per move, presence event and chat delivery, even with one instance | skipped while no other instance announces itself on the control channel |
| Delivery fan-out | every send scanned all sockets and encoded JSON per socket | per-user index; one encoding per event |
| Inbound budgets | moves had their own quota; everything else shared one budget and closed the socket (4429) | per class: motion (unchanged), transient (dropped), chat (refused with `CHAT_MESSAGE_NOT_SENT`, closed only far above a human rate), control (as before) |
| Upgrade limit | 40 attempts per address per 10 s (refuses carrier-NAT users after a deploy) | 100 failed authentications and 2,000 attempts per address, 10 upgrades per account, per 10 s |
| Reconnect storms | unbounded setup work queued in the pool | load shedding: ticket requests and upgrades share half the pool; the rest get 503 with Retry-After and back off |
| MiniRoom access re-check (miniRooms) | every 10 s the move that found it due waited for two queries | re-checked in the background, and on a timer while the room is occupied, so a move after a quiet minute does not wait either; never trusted past 60 s; invalidation unchanged |
| DB pool | node-postgres defaults (10, idle 10 s, wait forever), no `error` listener | explicit and configurable; 30 s idle, 10 s connection wait, keepalive, idle-error listener; optional LISTEN URL |

## 2. Capacity model

Database ceiling. With `P` pooled connections and round trip `R` between the
server and the database (pooler included), at most `P / R` statements per
second complete: 10 / 20 ms = **500 round trips per second**. Statement time is
small next to `R` (0.01-0.3 ms here, see `pg_stat_statements` below).

Round trips per operation, counted by the harness on a local PostgreSQL 16
(one pair or 200 idle sockets, no injected latency; before = `08d6a18`):

| Operation | Before | After |
|---|---|---|
| MiniRoom move (warm room) | 0.75 (a `pg_notify` per move, a session check every 2 s per socket) | 0 (a `pg_notify` only while another instance is announced) |
| Idle connected socket | 0.18 per second (lease transaction per pong, sweep per socket) | 0.0015 per second |
| Room chat message | 16.9 | 12.4 |
| HTTP chat message (send and delivery) | 18.3 | 16.1 |
| Reconnect: ticket request / upgrade with lease | 8 / 7 | 4 / 4 |
| Reconnect storm, all round trips / users (1,000 users, includes the first thread list and work still queued) | 118-130 | 13.7 |
| Closed socket cleanup | 6 | 5 per 100 sockets |
| MiniRoom access re-check | 2 per active room every 10 s | unchanged, off the move path |

The 5,000-user arithmetic at 20 ms with a pool of 10 (500 round trips per
second):

- **5,000 connected, idle:** before about 900 round trips per second (more
  than the whole pool, so the database was saturated by idle phones alone);
  after about 7.
- **500 MiniRooms moving:** 0 for the moves; the access re-check of 500
  active rooms costs 100 per second (proposal 5 below: 33 at 30 s).
- **Chat:** what is left (about 390 per second) carries about **27 chat
  messages per second** at today's 12-16 round trips per message. The
  harness's target load (500 rooms chatting every 5 s and 500 HTTP pairs every
  10 s, 127 messages per second) needs about 1,900 per second: four times the
  pool. This is the bottleneck, and it is the chat pipeline, not the
  transport.
- **Reconnecting 5,000 phones** (deploy): 5,000 × 13.7 = 68,500 round trips,
  at least 137 s of the whole pool at 500 per second (34 s with a pool of 40).
  Load shedding keeps the queue bounded while it happens; phones that are back
  work normally.
- **Free fixes, combined:** chat at about 5 round trips per message
  (proposal 1) and the transaction pooler with a pool of 40 (section 5) give
  127 × 5 + 100 + 7 ≈ 750 round trips per second against a ceiling of 2,000.
  Either one alone is not enough for the full target chat rate: chat at 5 on a
  pool of 10 needs 750 against 500; today's chat on a pool of 40 needs 2,000
  against 2,000.

CPU and memory are not the limit: 5,000 sockets with the full target load
used 48 % of one core and about 6 KB of heap per socket on the in-memory run.

## 3. Measurements

Local harness (section 8) on a 4-core Linux container: the real server and
`@blumi/realtime-client` in worker threads, local PostgreSQL 16 behind a TCP
proxy adding the round trip. Not Railway, not Supabase, not a phone. Latency
is client send to partner receive, in ms (p50 / p95 / p99). "Before" is
`08d6a18` with the same harness.

**A. One pair, nothing else running.**

| DB round trip | Move before | Move after | Room chat p50 | HTTP chat p50 |
|---|---|---|---|---|
| 0 ms | 1.2 / 2.5 / 3.2 | 1.1 / 1.5 / 2.2 | 9.5 → 9.6 | 15.5 → 13.9 |
| 20 ms | 1.0 / 87 / 91 | 1.1 / 1.5 / 1.7 | 217 → 216 | 368 → 282 |
| 30 ms | 1.0 / 127 / 131 | 1.0 / 1.5 / 2.0 | 318 → 318 | 539 → 417 |
| 90 ms | 1.0 / 188 / 369 | 1.0 / 1.2 / 1.8 | 920 → 919 | 1,561 → 1,193 |

Moves no longer wait for the database at any round trip. A room chat message
is about 10.6 sequential round trips and an HTTP chat message about 14 (was
18): chat latency is the chat pipeline's round trips times the distance to
the database (proposal 1).

**B. 1,000 users, 100 rooms, 100 HTTP chat pairs, +20 ms, pool 10.**

| | Before | After |
|---|---|---|
| Move | 1,083 / 30,063 / 46,570; 4,387 of 5,768 never arrived | 0.5 / 0.8 / 1.7; all 5,800 arrived |
| Room chat | 4,548 / 51,813 / 53,318; 90 of 1,100 arrived in the window | 5,690 / 11,698 / 11,783; 927 of 1,100 |
| HTTP chat | all 500 sends failed | 7,647 / 14,244 / 14,933; no failures |
| All connected | 220 s | 58 s |
| Deploy restart, all back | 334 s | 63 s |
| Network drop, all back | 290 s | 62 s |
| Pool queue (mean waiting) | 1,259 | 248 |

At 1,000 users chat alone (25 messages per second × 12-16 round trips) fills
the pool, so chat still takes seconds; everything else is fast.

**C. 5,000 users, 500 rooms, 500 HTTP pairs, in-memory repositories** (the
transport and CPU without the database).

| | Before | After |
|---|---|---|
| Move | 1.4 / 44.9 / 310 | 0.4 / 1.2 / 21.6 |
| Room chat | 1.4 / 57.4 / 335 | 0.7 / 1.5 / 20.7 |
| HTTP chat | 3.4 / 64.5 / 588 | 2.0 / 3.1 / 51.9 |
| Deploy restart, all back | 96 s | 6.9 s (first retries spread over 0-5 s) |
| CPU, event-loop delay p99 | 62 % of a core, 7.1 ms | 48 %, 2.0 ms |

**D. 5,000 users, 500 rooms, 500 HTTP pairs, +20 ms** (the owner's target).
Before: after five minutes only 237 of 5,000 phones had connected; the run
was stopped.

| | Pool 10 | Pool 10, network drop | Pool 40 (transaction pooler) |
|---|---|---|---|
| All connected | 238 s | 243 s | 85 s |
| Move | 0.4 / 2.3 / 1,593 | 0.4 / 1.6 / 1,630 | 0.5 / 3.4 / 43 |
| Room chat | 19,358 / 46,664 / 52,550; 274 of 5,500 | 21,099 / 48,426 / 52,171 | 9,849 / 21,177 / 21,728; 3,605 of 5,500 |
| HTTP chat | all 2,500 sends failed (pool queue thousands deep) | all failed | 12,398 / 22,690 / 24,173; 1,322 failed |
| All back after the storm | 326 s | 326 s | 90 s |
| Database round trips per second | 408 (queue mean 3,522) | 409 | 1,618 (queue mean 2,122) |

With the full target chat load the database is saturated in every
configuration (section 2). The move p99 on pool 10 came from rooms whose
avatars had stood still for over a minute while 5,000 phones connected: the
first move waited for a forced access check behind the queue. Occupied rooms
are now re-checked on a timer (commit `e8847d5`); the runs in table E use it. Sockets stay up
during the load (no unexpected closes, no 4429). In the network-drop run 99
reconnected sockets were closed with 1011 when their authorization check could
not reach the saturated database (fail closed, as designed).

**E. Projections on the final code** (5,000 users, 500 rooms, 500 HTTP pairs,
+20 ms; the chat rate is scaled so the database demand matches a scenario).

| | Today: pool 10, 21 messages/s | Chat fix load¹ on pool 10 | Chat fix load¹ on pool 40 |
|---|---|---|---|
| Move | 0.5 / 3.6 / 51 | 0.8 / 12,402 / 16,308 | 0.5 / 1.4 / 17 |
| Room chat | 7,396 / 11,337 / 11,502 | 25,910 / 48,805 / 50,255 | 216 / 290 / 385 |
| HTTP chat | 9,344 / 14,629 / 14,665 | 19,967 / 28,988 / 31,278; 740 of 1,000 failed | 282 / 378 / 484; none failed |
| All connected | 335 s | 347 s | 85 s |
| Round trips per second (pool queue) | 406 (281) | 374 (1,995) | 910 (1.4) |

¹ 50 messages per second at today's 12-16 round trips each: the same database
demand as the full target of 127 messages per second at about 5 round trips.
Per-message latency with a real 5-round-trip pipeline would be lower still.

Conclusion: on the current pool of 10 at 20 ms, moves stay instant (p99 51 ms
with the timer re-check) but chat already queues for seconds at about 20
messages per second. The owner's target is met in the harness only with both
free changes: the chat round-trip reduction (proposal 1) and the transaction
pooler with a pool of 40 (section 5). Past saturation (middle column) moves
also degrade, because access re-checks time out and the 60 s bound fails
closed.

**Security.** "revocations travel between instances and close the user's
socket within a second" (`realtimeServer.transport.test.ts`) and the existing
sign-out and moderation tests pass with the event-driven cache; see section 4.

## 4. Security of the event-driven authorization

The 2 s TTL bounded every unannounced change to 2 s but cost two queries per
socket every few seconds. The new design keeps the same guarantees where they
matter and states the bound for the rest:

- **Revocations the server performs are immediate on this instance.** Sign
  out, account deletion, phone change, refresh-token reuse and moderation
  resolution already publish an in-process revocation after commit. The cache
  drops the user's decisions, marks the user with a revocation stamp (a check
  that started earlier can never store its answer), and every socket of the
  user is re-checked and closed with 4403. Measured: a revoked socket closes
  within one database round trip, well under 1 s
  (`realtimeServer.transport.test.ts`, "revocations travel between instances
  and close the user's socket within a second"; the existing sign-out and
  moderation tests still pass).
- **Other instances learn it at once too.** The revocation is published on
  the `blumi_realtime_control` channel; each instance invalidates and
  re-checks its sockets. Payloads are strictly decoded (`kind` and a bounded
  `userId` only); a forged notification can only cause extra checks.
- **The upgrade primes the cache with a stricter check.** A ticket is consumed
  only for an unexpired, unrotated token of an eligible, unrestricted account;
  that implies the family check. A revocation between the observation and the
  upgrade discards the priming. A primed decision never outlives the token's
  own `expires_at`.
- **Unannounced changes** (a family reaching `expires_at`, a manual database
  edit, a lost notification) are bounded by the 60 s TTL for sockets that send
  or receive, and by the 30 s batched sweep for every socket. Session expiry is
  exact: decisions are capped at the family's latest `expires_at`.
- **Failure stays closed.** A failed batched sweep closes nothing at once (a
  database blip must not disconnect everyone), but no decision is renewed, so
  the first event after the TTL needs a check and a failing check closes with
  1011. Tests: "a failed sweep closes nothing at once, and the next check after
  the TTL fails closed", "an expired session family cannot receive a private
  event", "realtime closes the socket when authorization becomes unavailable".

Blocks are not part of session authorization; block decisions are checked by
chat delivery and MiniRoom access as before (and invalidate the room cache).

## 5. Supabase Free sizing

Repository evidence: production uses the Supavisor **session** pooler on port
5432 (`docs/release/railway-supabase-launch.md`, `MIGRATION_068_RUNBOOK.md`);
the real `DATABASE_URL` was not read.

Supabase limits below are from Supabase's documentation for the Free plan
(Nano compute) and must be confirmed in the dashboard (Database → Settings →
Connection pooling) before changing anything: about 60 direct database
connections, a pooler pool size of 15, and 200 pooler client connections.

- **Session pooler (today).** Each client connection holds one database
  connection for its lifetime, so the server's pool, the migrator and any
  admin session must fit in the pool size (15). Keep `BLUMI_DB_POOL_MAX` at 10
  (today) or raise it to at most 12. Ceiling at 20 ms: 10 / 0.02 = 500 round
  trips per second (12: 600).
- **Transaction pooler (free option, needs the owner).** Port 6543 shares
  database connections per transaction, so the server pool can grow to 40 or
  more within the 200-client limit; database connections are busy only for a
  statement's execution, not for the round trip. Ceiling at 20 ms with 40:
  **2,000 round trips per second, four times today**, at no cost. The code is
  ready: the only session state outside transactions is realtime LISTEN (now
  configurable with `BLUMI_DB_LISTEN_URL`, pointed at the session pooler) and
  the migrator's session lock (migrations always use the session pooler, as
  the runbook already requires). Cursors run inside transactions; node-postgres
  uses unnamed prepared statements. Owner steps: in Railway set
  `DATABASE_URL` to the 6543 URL, `BLUMI_DB_LISTEN_URL` to the 5432 URL and
  `BLUMI_DB_POOL_MAX=40`; verify on staging first (`/ready`, a chat send, a
  MiniRoom move, `pg_stat_activity` on the session side shows one LISTEN
  connection). Not done here: production variables were not changed.
- The direct connection is IPv6-only on Free (the IPv4 add-on is paid), so it
  is not an option.
- Region: europe-west4 (Netherlands) to eu-west-1 (Ireland) is about 15-25 ms.
  Every query on the hot path pays it, so round trips matter more than query
  time. A Supabase project in a region nearer to the Railway service would
  lower it without cost but needs a data migration; owner decision.

## 6. Proposals outside this change (owners decide)

Measured with `pg_stat_statements` in the harness; see section 3.

1. **Chat delivery round trips (chat owner).** Measured: 12.4 round trips
   per room chat message and 16.1 per HTTP chat message. Per message in the
   5,000-user run: 4.8 block lookups, 3.3 thread reads and 3.1 participant
   reads, plus persist, outbox claim, outbox completion, push-device lookup and
   test-persona lookup. Passing the thread and the block result down, one
   block query per pair, an in-memory test-persona set and skipping the
   push-device lookup when no push is due would bring it to about 5. This is
   the largest remaining load and, with the transaction pooler, what the
   5,000-user target needs (section 2).
3. **Fail-closed checks under saturation (server).** When the pool is
   saturated, background checks time out after the 10 s pool wait: MiniRoom
   access past its 60 s bound then holds a move, and a socket's authorization
   past its TTL closes it with 1011, which adds reconnects. Both are the
   intended fail-closed behaviour; keeping the pool below saturation (item 1
   and the transaction pooler in section 5) is the remedy, not loosening
   them.
4. **Global HTTP rate limit (server).** `@fastify/rate-limit` allows 100
   requests per minute **per address** on every route except those that set
   their own. Behind a carrier NAT, a few dozen active phones exhaust it.
   Proposal: key authenticated requests by session (the shared per-user budget
   of 100 per minute already exists) and keep a higher per-address ceiling for
   unauthenticated routes. The realtime ticket route is fixed here.
5. **MiniRoom access re-check (MiniRoom owner).** Changed here minimally
   (background re-check, 60 s stale bound) because it was on the move path; the
   owner may prefer a longer re-check interval (invalidation is event-driven),
   which would also cut its steady load (500 rooms × 2 queries every 10 s =
   100 round trips per second).
6. **Multi-instance MiniRoom state.** Motion state is per process; peer
   discovery keeps cross-instance delivery correct, but presence snapshots
   would diverge with two replicas. Not needed for one replica.
7. **LISTEN on its own connection (server, small).** Without
   `BLUMI_DB_LISTEN_URL` the LISTEN connection is taken from the shared pool;
   under saturation it waited behind the queue and timed out after a restart
   in the harness. With one replica nothing is lost (local delivery does not
   use it); with two it would delay cross-instance delivery. Setting
   `BLUMI_DB_LISTEN_URL` (even to the same session URL) already isolates it,
   at the cost of up to two more pooler connections.

## 7. zod 4 and TypeScript 7 (assessment only, not done)

zod 3.25.76 is used by `packages/contracts` (realtime and API schemas),
`apps/server` and `apps/mobile`: 19 non-test files import it, with 52 `z.infer`
uses, 26 `z.ZodTypeDef` uses, 15 `.strict()`, 10 `.refine()`, 4
`.superRefine()`, 3 `z.record()`, 2 `z.preprocess()`.

- What breaks: `z.ZodType<Output, z.ZodTypeDef, Input>` becomes
  `z.ZodType<Output, Input>` (all 26 `satisfies` checks in
  `ServerEventSchemas.ts` and friends); single-argument `z.record(value)` needs
  a key schema; `.strict()`/`.superRefine()` still work but are deprecated
  (`z.strictObject`, `.check`); error formatting (`.format()`, issue shapes,
  `message` vs `error` parameters) changed, which matters because
  `parseServerEvent` reports `issuePaths` and some routes map zod errors.
- Path: zod 3.25 already ships the v4 API under `zod/v4`, so the migration can
  go file by file inside the current major, starting with
  `packages/contracts`, with the contract tests (`ServerEventSchemas.test.ts`,
  route schema tests) as the safety net, then switch the dependency to 4.x.
- Gain: faster parsing and smaller mobile bundles (zod 4 and `zod/mini`).
  Risk: medium; mostly typing and error-shape changes; one to two days with
  the existing tests. Wire formats do not change.

TypeScript 7 (the native port) is not a patch:

- `moduleResolution: "Node"` (node10) in `tsconfig.base.json` is deprecated in
  6.0 and removed in 7.0; ten mobile test runners pass `--ignoreDeprecations
  6.0`; `packages/contracts` still pins a local TypeScript 5.9. All need
  `node16`/`bundler` resolution first, which changes how extensionless relative
  imports and `exports` maps resolve.
- `typescript-eslint` and other tools use the TypeScript JavaScript API, which
  the native compiler does not provide in its first releases, so lint would
  break; Expo and Metro only strip types and are unaffected.
- Recommendation: first move to `moduleResolution: "bundler"` (mobile) and
  `node16` (server and packages) on TypeScript 6, remove the deprecation
  overrides, then try `tsgo` for type checking only.

`@types/node` 26 targets Node 26 APIs while the runtime is Node 22
(`engines`); it should follow the runtime major, not the latest.

## 8. Running the harness

Local only. It refuses production settings and non-loopback databases,
creates and drops its own database, and never logs message bodies.

```sh
npm run build:packages
# in-memory repositories (transport and CPU only)
node --expose-gc --import tsx apps/server/scripts/realtime-load/harness.ts \
  --repo memory --users 5000 --rooms 500 --dm-pairs 500 --duration-s 60 --storm
# local PostgreSQL 16 (not as root) with 20 ms injected round trip and pool 10
node --expose-gc --import tsx apps/server/scripts/realtime-load/harness.ts \
  --repo postgres --admin-url postgresql://USER@127.0.0.1:PORT/postgres \
  --db-rtt-ms 20 --pool-max 10 --users 5000 --rooms 500 --dm-pairs 500 \
  --duration-s 60 --connect-rate 60 --storm
```

Options: `--users-per-address N` simulates carrier NAT, `--storm-kind drop`
cuts every socket without a close frame (an edge proxy or network drop; the
default `restart` is a deploy-style restart), `--move-interval-ms`,
`--room-chat-interval-ms`, `--dm-interval-ms`, `--workers`, `--out file.json`.
Clients run the real `@blumi/realtime-client` (reconnect policy, liveness,
validated events) in worker threads; the server is wired as in `src/index.ts`.
The database proxy delays each direction by half the round trip. Enable
`pg_stat_statements` in the local cluster for the per-statement table.
