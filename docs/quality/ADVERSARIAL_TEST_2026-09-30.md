# Adversarial test run — 2026-09-30

Owner request: try to break every critical flow (repeat, race, unauthorized,
invalid input, network loss, account switch, stale IDs, duplicate realtime
events), prove impact, search siblings, report gaps honestly. Code under test:
branch `claude/busy-cray-dl5wvr`, starting at `de0b53e`; all fixes below are
merged at `1cf3bcc`. Nothing here is deployed: the live server still runs
`19b6ff3`.

Status words: **PASS** (attack refused, proven by a named test), **FIXED**
(bug reproduced by a failing test, fixed, test now passes), **OPEN** (bug
reproduced; kept as a `todo` test because the fix needs a product or protocol
decision), **NOT TESTED** (not counted as pass).

## Method

- Four parallel test passes, one per domain, each writing reproduction tests
  first. Server attacks used Fastify `inject` with in-memory repositories
  and, for every race, real PostgreSQL through the disposable gate
  (`scripts/security/postgres-gate.mjs`, PostgreSQL 16). Mobile client code
  was attacked through node tests of stores, hooks and the realtime client;
  no device was available.
- Live checks against the deployed API (Railway, `19b6ff3`) were limited to
  unauthenticated probes and read-only database integrity queries. An
  authenticated live pass was started with three synthetic `adv_live_*`
  accounts and sessions inserted into the database; it was stopped before any
  API call, and the synthetic rows were deleted (verified: 0 left, 18 accounts
  total, as before).

## Fixed

| # | Flow | Bug | Proven impact | Fix |
|---|---|---|---|---|
| 1 | Session | Logout racing an in-flight refresh of the same family left the new token alive (PostgreSQL only) | After logout the refreshed token worked on every route and kept realtime access; a stolen token refreshed at logout survives | Logout takes the family lock before deleting (`e2701c7`) |
| 2 | Safety | Room connection "save" had no block check (HTTP and realtime) | A blocked user could still create a connection match and push `connection.matched` to the blocker | Block checked both directions (`43aa9f5`) |
| 3 | Safety | Block landing while an invite accept is in flight | Blocked pair kept an active room with both claims; the accepter got a media token | Re-check after commit and close the room (`f132aa9`) |
| 4 | Discovery | Banned/suspended accounts reachable by id and via Discovery Watch | Profile viewable; a like created a real match if the banned user liked first | Moderation filter in single-profile lookups and watch scan (`ff8c8de`) |
| 5 | Chat, reports | NUL/control characters in message bodies and report notes | PostgreSQL rejected NUL with a raw error → HTTP 500 | Shared control-character check (`4469b21`) |
| 6 | Chat (mobile) | Composer sent multi-line text the server normalises differently | Every multi-line message left a duplicate "sending" bubble forever | Client sends the server-normalised body (`aa66bd0`) |
| 7 | Room decor | Save with a revision when no room exists | HTTP 500 on both backends; layout not saved | Returns the existing 400 "refresh" (`9640ac6`) |
| 8 | Realtime | Per-user event budget reset on reconnect | Each reconnect granted ~60 extra events past the limit | Budget kept until it expires (`d4ed851`) |
| 9 | Realtime | List replies fanned out to all of a user's sockets | With two devices, page k cost 2^(k-1) queries (3 pages: 7 queries) | Reply only to the requesting socket (`d4ed851`) |
| 10 | MiniRoom (mobile) | Message sent into a just-closed socket | Message lost, call reported success, bubble stuck "sending" | Send first, report failure (`84243ee`) |
| 11 | Realtime | `room.leave` without a room id | Server replied with an event the app's own contract rejects | Ignored (`d4ed851`) |
| 12 | Dependencies | `ip-address` ≤10.7.0 (GHSA-j6r3-76f7-8jcv, GHSA-h3mg-xc3c-68pw) via `@fastify/rate-limit` | Advisories published today; release audit failed | Lockfile to 10.7.2 (`1cf3bcc`) |
| 13 | Moderation | Banned member deletes the account (or changes number) and signs up again with the same phone | Ban evaded (`GET /v1/users/me` 200 instead of 403) | Owner decision: a keyed HMAC of the freed number is kept (migration 069, **not applied**); a new account for it starts banned; suspensions not carried (`3891af6`) |
| 14 | Profile | `PATCH /v1/users/me` answered 200 for wrongly typed fields and saved nothing | Client bugs looked like success | 400, no write; `null` still means "not provided", unknown keys ignored (`ceccd7b`) |
| 15 | Profile | No control-character check on display name, bio, prompt answers, interests (code review) | PostgreSQL: NUL → HTTP 500; in memory: stored | Shared control-character check → 400 (`ca91002`) |
| 16 | Economy | Reward coins never paid off a refund debt | Purchases blocked after a refund | Owner decision: every reward repays `coin_debt` first, remainder to coins; atomic in both repositories (`293d497`) |
| 17 | Safety | Blocked user still saw the blocker's thread (list, sync-matches, full message history) | Blocker's name, avatar and history stayed visible | Owner decision: while a block exists in either direction the thread is hidden from both users (lists omit it; its routes answer 404 like a thread you are not in); unblocking restores it with history (`50e5115`) |

Also fixed during integration: a 5 s child-process timeout in the navigation
parser gate that failed on a cold container, and two test harnesses that
missed the now-required `safetyService` after the merge, and a presence
lease test whose 2 s window was too tight for the full PostgreSQL gate
(widened to 6 s; the assertion is unchanged).

## Open (reproduced, `todo` tests, decision needed)

| Flow | Bug | Impact | Decision |
|---|---|---|---|
| Realtime (mobile) | After 10 failed reconnects the client stops forever; banner still says "reconnecting" | Failure hidden; only network change or app restart recovers | Retry policy |
| Realtime (mobile) | Backoff resets on every open; accept-then-close loops reconnect every 0.5–1 s | Reconnect storm against a limiting server | Retry policy |
| Chat (mobile) | Stale thread-list page applied after `chat.thread_created` | New match disappears until refresh | Revision numbers in list replies |
| Chat (mobile) | Lost HTTP response: history reload shows the message twice, once failed | Retyping sends a real duplicate | Reconcile by client id |
| MiniRoom | In-room messages have no client id or acknowledgement | Lost frame = permanent "sending", no retry | Protocol change |

Found by code review only, not reproduced: the MiniRoom
composer clears the text even when the send failed; a well-formed fake
realtime ticket costs one database delete and is not rate-limited before
authentication.

## PASS (attack refused, with tests)

- **Economy:** same purchase 2× and 20× concurrently (one charge, PostgreSQL
  and in-memory); many purchases above balance (never negative); unknown,
  wrong-category, retired, wrong-gender, free, malformed items; client price,
  grants and foreign `userId` ignored; daily reward 20× concurrently (one
  grant, one ledger row); RevenueCat webhook replays, refunds and cross-account
  transactions; payments-off path refuses unsigned/guessed secrets.
- **Equip and room:** unowned/foreign/malformed loadouts, stale and future
  revisions, 20 concurrent saves with one revision (one write); decor with
  unowned furniture, duplicate instances, out-of-range positions, 61 items,
  2 MB body (413).
- **Discovery and chat:** self/unknown likes; 20 concurrent likes; 10
  concurrent reciprocal likes (one match, one thread); sends into foreign
  threads; forged sender ids; 20 concurrent sends with one client id (one
  row, one outbox job, one delivery); same client id with another body (409);
  forged cursors; read-receipt leakage.
- **Invites and rooms:** accept/cancel by the wrong party, duplicate invites,
  10 concurrent accept+decline (one outcome), accept after expiry, joining
  foreign rooms.
- **Auth and sessions:** refresh 2× and 20× concurrently, across devices,
  after grace, after logout/deletion/ban; concurrent deletions; foreign
  deletion confirmations; concurrent Firebase uid binding; realtime tickets
  (reuse, expiry, forgery, revocation, 20 parallel upgrades on one ticket);
  all 13 admin routes with missing/expired/foreign/unsigned/wrong-scope tokens.
- **Cross-account sweep:** all 96 routes classified in
  `adversarialRouteMatrix.test.ts` (fails when a new route is not classified);
  account B's token against account A's ids refused everywhere.
- **Hostile bodies:** wrong types, nulls, 900 KB strings, 50k arrays,
  5000-level nesting, `__proto__`/`constructor`, malformed JSON, text/plain on
  every body route: no 5xx, no pollution, no state change.
- **Mobile:** account switch leaves no threads, drafts, unread counts, query
  cache or refresh hand-off from the previous account; 50 connect/drop cycles
  and 100 session restarts leave no listeners, sockets or timers; 40-client
  reconnect storm is spread by jitter; duplicate, delayed and reordered
  messages and receipts, and HTTP/realtime double delivery, dedupe correctly.

## Live checks (deployed `19b6ff3`)

| Check | Result |
|---|---|
| All 74 routes without a token and with a garbage token | PASS: 401 on member routes; public routes as designed; retired routes 410. Logout with a garbage token returns 204 (idempotent) |
| Public recovery request with an empty body | PASS by design: always 202, creates nothing without a Firebase-verified token (anti-enumeration) |
| Rate-limit bypass with rotating spoofed `X-Forwarded-For` over one connection | PASS: 6th request 429 (limit 5 / 5 min) |
| Body validation before authentication on 3 routes | Observation: unauthenticated requests get 400 instead of 401 on `active-room/leave` and Firebase challenge/reauth; no data exposure |
| `/.well-known/apple-app-site-association` and `assetlinks.json` | 404: universal links are not served (release item) |
| Read-only integrity audit (28 queries) | PASS: no negative coins or debt, duplicate items, duplicate or self matches, threads with ≠2 participants, messages from non-participants, duplicate client messages, control characters, orphan sessions/inventories/decor, active rooms between blocked users, stale participants, stuck outboxes, expired leases/presence/tickets |
| Equipped avatar items owned | PASS: 64 equipped items, all owned |
| Placed room furniture owned | NOT TESTED: no furniture placed in the live data |

The live server does not have fixes 1–11 yet; for example a NUL byte in a
chat message is expected to return 500 there until the next deploy.

## Not tested

- Real device behaviour: iOS background/foreground, socket loss on cellular,
  the pager's UI-thread AppState handling, real `bufferedAmount` under load.
- Authenticated attacks against the live API (stopped; see Method).
- Account deletion racing a purchase on PostgreSQL; RevenueCat reconcile with
  a live verifier; push-token takeover on `/v1/devices`; the ordering of push
  device removal and session revoke on mobile sign-out.
- Load: no test exceeded 50 parallel requests; reconnect storms and fanout
  limits are tested at unit scale only.

## Verification at `1cf3bcc` (Turkish locale)

Full `npm run verify` steps passed through the PostgreSQL gate: 3,538 passed,
0 failed, 107 skipped (PostgreSQL-only cases inside normal suites, run by the
gate), 10 todo (the open bugs above). The release audit then failed on the new
`ip-address` advisories; after the lockfile fix the audit passes, the server
suite passes (764 passed, 0 failed, 5 todo) and Expo Doctor is 21/21.
