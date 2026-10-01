# Blumi threat model — 2026-09-30

Scope: the Blumi mobile client (`apps/mobile`), the Fastify API and realtime
server (`apps/server`), their data stores and third-party services, as present
on branch `claude/busy-cray-dl5wvr` on 2026-09-30. Code evidence only: nothing
here is deploy, device or penetration-test evidence. Fixes described as
"this wave" are **Implemented, Tested** on the branch and live only after an
authorised deploy (see `docs/quality/ENGINEERING_AUDIT_2026-09-30.md`).

Method: data-flow decomposition into trust boundaries, then STRIDE per
boundary (Spoofing, Tampering, Repudiation, Information disclosure, Denial of
service, Elevation of privilege). Every mitigation cites the code that
implements it. Anything not cited is a residual risk.

## 1. Assets

| Asset | Where it lives | Why it matters |
|---|---|---|
| Session tokens (bearer) | Mobile SecureStore (`apps/mobile/src/features/session/sessionStorage.ts`); server stores only SHA-256 hashes in `blumi_sessions` (`apps/server/src/auth/authStore.ts` `hashSessionToken`) | Full account access for up to the token lifetime |
| Phone number (login identity) | `blumi_accounts.phone_number` | PII; the only sign-in factor |
| Firebase uid binding | `blumi_accounts.firebase_uid` (migration 068) | Ties the account to one Firebase phone identity |
| Private chat and room text | `blumi_chat_messages`, mini-room tables | Private member content |
| Match, block and report graph | match, connection and safety tables | Social and safety data; blocks protect members |
| Inventory, coins, purchases, loadouts, rooms | economy, commerce and room tables | Server-authoritative value (`AGENTS.md` invariants) |
| Moderation state | `blumi_accounts.moderation_*`, moderation queue | Enforces bans and suspensions |
| Admin credentials | HMAC admin tokens (`apps/server/src/admin/adminTokenService.ts`), legacy admin key | Operator access to users, recovery and moderation |
| Service secrets | Railway variables: `DATABASE_URL`, `BLUMI_OTP_HMAC_SECRET`, Firebase service account, RevenueCat webhook secret and API key, Expo access token | Compromise of any one widens the blast radius |

## 2. Actors

- **Member** — a signed-in person using the app as intended.
- **Malicious member** — a signed-in person abusing features (harassment, spam, scraping, economy abuse).
- **Anonymous network attacker** — can call public endpoints and replay captured traffic.
- **Token thief** — holds a stolen bearer or refresh token (device malware, backups, logs).
- **Phone-number taker** — controls a recycled, ported or SIM-swapped number of an existing member.
- **Compromised third party** — Firebase, RevenueCat, Expo, Supabase or Railway account or infrastructure.
- **Insider/operator** — holds admin tokens or Railway/Supabase access.

## 3. Trust boundaries and data flows

```
 Mobile app ──HTTPS──▶ Railway edge proxy (100.64.0.0/10) ──▶ Fastify API ──▶ PostgreSQL (Supabase)
     │                                                     │  ▲
     │──WSS (30 s single-use ticket)────────────────────▶ Realtime server (same process)
     │                                                     │
     └──Firebase Phone Auth (SMS) ─▶ Firebase ─ID token──▶ API (firebase-admin verifyIdToken)
 RevenueCat ──signed webhook──▶ API          API ──▶ Expo Push service ──▶ APNs/FCM
```

| # | Boundary | Crossing |
|---|---|---|
| B1 | Mobile ↔ API | Untrusted client input; bearer tokens |
| B2 | Mobile ↔ Realtime | Long-lived WebSocket; client events |
| B3 | API ↔ PostgreSQL/Supabase | Server-only credentials; Supabase API roles present |
| B4 | Mobile/API ↔ Firebase | Phone verification; ID tokens |
| B5 | RevenueCat ↔ API | Purchase webhooks and API reconciliation |
| B6 | API ↔ Expo Push | Notification payloads and push tokens |
| B7 | Railway (edge + runtime) | Proxying, variables, deploys, logs |
| B8 | Operator ↔ Admin API | Privileged actions |

## 4. Threats and mitigations per boundary

Status column: **Mitigated** (control in code and tested), **Partial**,
**Open**.

### B1 — Mobile ↔ API

| STRIDE | Threat | Existing mitigations (code) | Status |
|---|---|---|---|
| S | Stolen or replayed session token | Tokens are random (`createSessionToken`), stored hashed (`hashSessionToken`), sent only as `Authorization: Bearer` (`apps/server/src/routes/routeHelpers.ts` `readBearerToken`). **This wave:** refresh rotation with reuse detection — presenting an already-rotated token after a 30 s grace window deletes the whole session family and publishes a realtime revocation (`apps/server/src/auth/authRepository.ts` `planSessionRotation`, `rotateSession`; `apps/server/src/db/postgresAuthRepository.ts` `rotateSession`; `apps/server/src/auth/authService.ts` `refreshSession`). Absolute 90-day family lifetime (`SESSION_FAMILY_MAX_LIFETIME_MS` in `apps/server/src/auth/authStore.ts`). Tests: `apps/server/src/auth/sessionSecurity.postgres.test.ts` (in-memory and PostgreSQL) | Mitigated for refresh; Partial for access tokens (see R1) |
| S | Recycled or taken-over phone number signs into the previous owner's account | Phone proof comes from Firebase (`apps/server/src/auth/firebaseAuth.ts`, `verifyIdToken(idToken, true)` checks revocation). **This wave:** the verified Firebase uid is bound on first completion and must match afterwards; a mismatch returns `409 ACCOUNT_RECOVERY_REQUIRED` and queues a manual review in the existing recovery path instead of issuing a session (`apps/server/src/routes/authRoutes.ts`, `apps/server/src/account/accountRecoveryService.ts`). Legacy accounts bind on next sign-in; a completed phone change clears the binding. Tests: `sessionSecurity.postgres.test.ts`, `apps/server/src/routes/firebaseAuthRoutes.test.ts` | Partial (see R2) |
| T | Tampered or oversized request bodies | Handlers parse with zod contracts (`packages/contracts/src/api/CoreApiSchemas.ts`, `apps/server/src/routes/authRequestSchemas.ts`, `safeParse` in route modules); public text passes `assertPublicTextAllowed` (`apps/server/src/safety/publicTextFilter.ts`). Global request-schema enforcement is a separate wave-2 workstream (audit §"Findings re-checked", 10E) | Partial |
| T | Client-claimed ownership (items, coins, rooms) | Backend is authoritative (`AGENTS.md`); purchases verified server-side (`apps/server/src/commerce/revenueCatPurchaseVerifier.ts`) | Mitigated |
| R | Member denies a harmful action | Reports and moderation queue persisted (`apps/server/src/safety/moderationQueue.ts`); admin actions audited (`blumi_admin_user_audit`, migration 064) | Partial (no member-action audit log) |
| I | PII in logs and errors | Error handler logs only an error kind (`apps/server/src/server.ts` `registerErrorHandler`, `apps/server/src/operations/safeErrorLog.ts`); account export excludes secrets (`authService.exportAccountData`) | Partial (see R5) |
| I | Blocked or restricted members reading data | Moderation gate on authenticated routes: `resolveBearerSession` returns 403 `ACCOUNT_BANNED`/`ACCOUNT_SUSPENDED`; **this wave** applied it to `PATCH /v1/users/me`, `PUT /v1/users/me/avatar`, `PATCH /v1/users/me/onboarding` (F-05, `apps/server/src/routes/userRoutes.moderation.test.ts`) | Mitigated after deploy |
| D | Brute force and floods | Global `@fastify/rate-limit` 100/min (`server.ts` `registerProductionMiddleware`), per-route limits on auth and recovery routes, shared per-account budget (`apps/server/src/operations/sharedRateBudgetHook.ts`), OTP send/verify limits (`authService.ts`). **This wave:** `trustProxy` restricted to Railway's `100.64.0.0/10` so limits key on the real client (F-07, `server.ts`, `apps/server/src/operations/trustedProxyClientIp.test.ts`) | Mitigated (production variable still to set, see R7) |
| E | Unfinished accounts using product features | `resolveProductSession` requires completed onboarding (`routeHelpers.ts`) | Mitigated |
| E | Staging personas acting in production | **This wave:** `applyTestPersonaPolicy` resolves no persona when `BLUMI_DEPLOY_ENV=production` (`apps/server/src/chat/testPersonaPolicy.ts`, F-06) | Mitigated after deploy |

### B2 — Mobile ↔ Realtime

| STRIDE | Threat | Existing mitigations (code) | Status |
|---|---|---|---|
| S | Socket opened with a stolen or long-lived credential | Upgrade uses a hashed, single-use ticket with a 30 s default TTL (max 60 s) (`apps/server/src/realtime/realtimeTicketService.ts`, `realtimeTicketStore.ts`, migration 038) | Mitigated |
| S/E | Socket outlives sign-out, deletion, ban or token theft | Per-socket authorization re-checks session family and moderation (`authService.isRealtimeSessionAllowed`); **this wave** a 2 s positive-decision cache with immediate invalidation on in-process revocation signals (`apps/server/src/realtime/realtimeAuthorizationCache.ts`, `apps/server/src/auth/realtimeAccessRevocation.ts`). Refresh-token reuse now publishes the same signal | Mitigated in-process; ≤ 2 s across instances |
| I | Lobby presence leaking online members (including blocked) | **This wave:** public lobby retired with a deny-all presence policy (`apps/server/src/realtime/realtimePresencePolicy.ts` `isRealtimePresenceRoomAllowed`), per-recipient snapshots without blocked users, mini-room reactions refused after end or block (F-08, `apps/server/src/realtime/legacyLobbyRetirement.test.ts`) | Mitigated after deploy |
| T | Malformed or oversized events | `maxPayload` limit (`apps/server/src/realtime/realtimeServer.ts`); router switches on known event types (`realtimeRouter.ts`) | Partial (no schema validation per event, audit 10E) |
| D | Slow consumers or fanout floods | Connection leases (migration 067); fanout/slow-consumer work is a separate workstream | Partial |

### B3 — API ↔ PostgreSQL / Supabase

| STRIDE | Threat | Existing mitigations (code) | Status |
|---|---|---|---|
| E/I | Supabase `anon`/`authenticated` roles reading tables through the Data API | Migrations revoke table, sequence and function privileges from `PUBLIC, anon, authenticated`; the PostgreSQL gate asserts it from empty and on rerun (`scripts/security/postgres-gate.mjs`) | Mitigated |
| T | SQL injection | Parameterised `pg` queries throughout `apps/server/src/db/*` | Mitigated |
| T | Lost updates and races on value | Row locks and advisory locks on critical paths (sign-in per phone, phone change per account, **this wave** session family rotation per family) | Mitigated for reviewed paths |
| D | Binary starting against an older schema | `/ready` reports 503 while any packaged migration is missing or its checksum differs (`apps/server/src/operations/schemaReadiness.ts`, wired in `apps/server/src/config.ts`), so the platform health check keeps the new binary out of rotation | Mitigated (depends on the Railway health check) |
| I | Database credential exposure | Only in Railway variables; not in code | Partial (see R6) |

### B4 — Mobile/API ↔ Firebase

| STRIDE | Threat | Existing mitigations (code) | Status |
|---|---|---|---|
| S | Forged or replayed ID token | `firebase-admin` `verifyIdToken(idToken, true)` (signature, audience, revocation); `phone_number` and `auth_time` required (`firebaseAuth.ts`); sensitive actions need a fresh challenge bound to the session and `auth_time` (`consumeFirebaseActionChallenge`) | Mitigated |
| S | Different Firebase user for an existing phone | **This wave:** uid binding and recovery routing (see B1) | Mitigated for uid change; see R2 |
| S | Revoked Blumi session silently re-created from the device's Firebase refresh token (`/v1/auth/firebase/complete` accepts any valid ID token, and the Firebase SDK mints new ones without an SMS) | **2026-10-01:** after refresh-token reuse (`AuthService.subscribeSessionReuse`) and after a `ban` resolution (`adminRoutes.ts` `onUserBanned`), the server calls `firebase-admin` `revokeRefreshTokens(uid)` for the bound uid (`apps/server/src/auth/firebaseSessionRevocation.ts`, wired in `server.ts`, best effort after the commit, no ids logged). Existing ID tokens then fail `verifyIdToken(idToken, true)` (their `auth_time` is before `tokensValidAfterTime`), so only a new SMS verification signs in. Every `verifyIdToken` call site (`authRoutes.ts`, both in `userRoutes.ts`) goes through the one verifier, which always passes `checkRevoked`. Account deletion enqueues deletion of the confirming uid or, for an OTP-confirmed deletion, the bound uid (deleting the Firebase user revokes its tokens). Tests: `apps/server/src/auth/firebaseSessionRevocation.test.ts`, `sessionSecurity.postgres.test.ts` | Mitigated (best effort: a Firebase outage at that moment leaves the refresh tokens valid; the failure is logged by error code only) |
| I | Firebase user left behind after deletion | Deletion outbox deletes the Firebase user (`apps/server/src/auth/firebaseUserDeletionWorker.ts`, migration 063), using the bound uid when the deletion was confirmed by OTP; sign-in refused while deletion is pending (`authRoutes.ts`) | Mitigated |

### B5 — RevenueCat ↔ API

| STRIDE | Threat | Existing mitigations (code) | Status |
|---|---|---|---|
| S/T | Forged or replayed webhook | HMAC-SHA256 over timestamp and raw body, 5-minute tolerance, constant-time compare (`apps/server/src/commerce/revenueCatWebhook.ts` `verifyRevenueCatWebhookSignature`) | Mitigated |
| T | Sandbox purchases credited in production | Purchase environment gate (`apps/server/src/commerce/purchaseEnvironment.ts`, `config.ts`) | Mitigated |
| E | Credit to the wrong account; refunds not reversed | Webhook reversal kind exists; unmatched-account and refund handling is open (audit 10J) | Open; payments are off (`BLUMI_PAYMENTS_ENABLED=0`) |

### B6 — API ↔ Expo Push

| STRIDE | Threat | Existing mitigations (code) | Status |
|---|---|---|---|
| I | Private content in push payloads or on the lock screen | Notification policy and preferences (`apps/server/src/notifications/notificationService.ts`); `notificationIsolation.test.ts` | Partial (payload PII review open, audit 10N) |
| S | Push token registered to another account | Device registration requires a bearer session and validated body (`apps/server/src/routes/notificationRoutes.ts`) | Mitigated |
| D | Expo outage or throttling | Outbox with retries (`apps/server/src/notifications/notificationOutboxWorker.ts`) | Mitigated |

### B7 — Railway

| STRIDE | Threat | Existing mitigations (code) | Status |
|---|---|---|---|
| S | Client IP spoofing through `X-Forwarded-For` | Trust only `100.64.0.0/10` (`BLUMI_TRUST_PROXY`, `.railway/railway.ts`, F-07) | Mitigated on staging; production environment not created |
| T | Unsafe deploy order (binary before migration) | Schema readiness gate (B3); release runbook `docs/release/RELEASE_CAPTAIN_WORKFLOW.md` | Partial (ordering is a manual gate) |
| I | Secrets in logs | Safe error logging (B1) | Partial |

### B8 — Operator ↔ Admin API

| STRIDE | Threat | Existing mitigations (code) | Status |
|---|---|---|---|
| S/E | Stolen admin credential | Scoped, expiring HMAC tokens with constant-time verification (`adminTokenService.ts`); legacy key only when explicitly allowed (`adminRoutes.ts`) | Partial (see R8) |
| R | Unattributed admin action | Recovery and user actions record operator and token IDs (`accountRecoveryService.ts` `resolve`, migration 064) | Mitigated |

## 5. This wave's session and identity controls

Values and rationale (implemented in `apps/server/src/auth/authStore.ts`):

- **Token TTL 30 days** (unchanged). Mobile refreshes within 24 h of expiry
  (`apps/mobile/src/features/session/sessionRefresh.ts`
  `shouldRefreshSessionSoon`).
- **Reuse grace window 30 s** (`SESSION_REFRESH_REUSE_GRACE_MS`). A rotated
  token may be presented again for 30 s; the server issues a fresh successor
  and supersedes the one issued before, so exactly one token of the family
  stays live. It covers a retry after a lost response or a quick relaunch.
  Before this change a rotated token failed immediately, so a lost response
  already signed the member out; the grace window only relaxes that. Mobile
  deduplicates concurrent refreshes (`createSessionRefreshCoordinator`), so a
  normal client never presents a rotated token.
- **Reuse outside the grace window** (or of a parent whose successor was
  already used) deletes every token in the family and publishes
  `{ kind: "user" }` on the realtime revocation channel. The response stays
  `401 Sign in again to continue.` **Since 2026-10-01** it also revokes the
  bound Firebase user's refresh tokens (`revokeRefreshTokens`), because the
  Firebase SDK on the same device could otherwise mint a fresh ID token
  without an SMS and `/v1/auth/firebase/complete` would issue a new family.
  `verifyIdToken(idToken, true)` rejects ID tokens minted before the
  revocation. The member (and the thief) must verify the phone by SMS again.
  The same revocation runs after an administrator bans an account.
- **Absolute family lifetime 90 days** (`SESSION_FAMILY_MAX_LIFETIME_MS`):
  three sliding windows, so an active member re-verifies the phone at most
  once per quarter. The last token's expiry is capped at the family end.
  Families created before migration 068 are anchored on their next rotation.
- **Firebase uid binding**: bound on the first verified completion; a
  different uid for the same phone, or a uid already bound to another
  account, returns `409 ACCOUNT_RECOVERY_REQUIRED` and queues a pending
  request in the manual recovery queue. Operators resolve it through
  `/v1/admin/account-recovery`.

## 6. Residual risks and owners

| ID | Risk | Why it remains | Owner | Next step |
|---|---|---|---|---|
| R1 | A stolen token is usable until the thief or victim refreshes | Access and refresh share one bearer; reuse is detected only at the next refresh (sliding 30 days). Correction 2026-10-01: before that date, detected reuse did not end the attacker's access if they also held the device's Firebase refresh token, because a silently minted Firebase ID token re-created a session through `/v1/auth/firebase/complete`; reuse (and a ban) now revokes the bound Firebase user's refresh tokens (B4). Residual: revocation is best effort after the commit, accounts with no bound uid (legacy, not yet re-verified) have nothing to revoke, and a Firebase outage at that moment leaves the Firebase tokens valid | Server auth owner | Consider a short-lived access token plus refresh token split (W3); add a retry queue for failed Firebase revocations if R3 security events show failures |
| R2 | Recycled numbers are only partly covered | Firebase keeps the same uid for a phone number, so a recycled number usually yields the **same** uid; the binding catches uid changes (deleted/re-created Firebase user, project change), not every recycled number | Owner (product decision) + server auth owner | Evaluate re-verification after long inactivity or a second factor; add an operator rebind action (today a rebind is a reviewed `firebase_uid = NULL` update) |
| R3 | Reuse detection and revocation are not logged as security events | No security event sink exists | Server auth owner | Add structured, PII-free security events |
| R4 | Cross-instance realtime revocation takes up to 2 s | Revocation signal is in-process only (`realtimeAccessRevocation.ts`) | Realtime owner | Accept or add a shared invalidation bus |
| R5 | Phone numbers and IDs can appear in request URLs and access logs | Listed in audit 10I ("PII in request URLs") | Server owner | Move identifiers out of paths/queries; review log redaction |
| R6 | Single shared database credential with broad rights | Supabase/Railway configuration, not code | Deploy owner | Least-privilege role for the app; rotate on staff change |
| R7 | Production environment variables not created (`BLUMI_TRUST_PROXY`, deploy env) | Production environment does not exist yet | Deploy owner | Set before first production deploy |
| R8 | Legacy admin key path still available when allowed | Backward compatibility | Operations owner | Retire the legacy key |
| R9 | Report/block abuse limits and realtime event schema validation | Audit 10I / 10E open items | Trust & safety / server owners | Wave 2 |
| R10 | Refund and unmatched-account webhook handling | Audit 10J | Commerce owner | Before enabling payments |
| R11 | Moderation phone bans (migration 069) are kept indefinitely and depend on one secret | A banned account that is deleted or changes number leaves an HMAC of the freed number (`blumi_moderation_phone_bans`) so the number cannot sign up again unbanned. Records stay until an administrator deletes them (no admin route); rotating `BLUMI_OTP_HMAC_SECRET` makes every record unmatchable; a banned user with a different number is not caught | Trust & safety + server auth owner | Decide a retention period and an admin removal action; document secret rotation. See [`MIGRATION_069_NOTE.md`](../release/MIGRATION_069_NOTE.md) |

## 7. Deploy note for this wave

Migration `apps/server/db/migrations/068_session_reuse_detection_and_firebase_uid.sql`
is additive (nullable columns, a partial unique index). It must be applied to
the Supabase database **before** the binary that uses it (`/ready` stays 503
until it is applied), and only with the owner's approval. The previous
binary ignores the new columns, so the migration is safe to apply first.
Rollback of the binary does not require rolling back the migration.

Migration `apps/server/db/migrations/069_moderation_phone_bans.sql` (one new
table for moderation phone bans) is **not applied**. It follows the same order:
apply before the binary that ships it, whose `/ready` answers 503 without it.
See [`MIGRATION_069_NOTE.md`](../release/MIGRATION_069_NOTE.md).
