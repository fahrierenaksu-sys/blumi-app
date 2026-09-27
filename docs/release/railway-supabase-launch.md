# Blumi staging and production release

The source of truth for the API service is `.railway/railway.ts`. The API and
WebSocket share Railway's `PORT`. The service stays awake because the process
also runs outbox/deletion workers. Railway's `Wait for CI` is enabled by the
GitHub source check-suite setting; the `Verify` workflow must pass on `main`.
Railway configuration is not applied by a Git push alone: review
`railway config plan` in each environment before applying it. Do not put
provider keys, `DATABASE_URL`, or private data in IaC, GitHub Actions, EAS
public variables, or a mobile bundle.

## Environment separation

| | Staging | Production |
| --- | --- | --- |
| Runtime | `NODE_ENV=production`, `BLUMI_DEPLOY_ENV=staging` | `NODE_ENV=production`, `BLUMI_DEPLOY_ENV=production` |
| Purchases | RevenueCat `sandbox` | RevenueCat `production` |
| Database | Independent Supabase project/session pooler 5432 | Independent Supabase project/session pooler 5432 |
| Mobile | EAS preview, separate HTTPS/WSS origin | EAS production, fixed HTTPS/WSS origin |

Never point both Railway environments at the same database or RevenueCat
webhook destination. The existing local `DATABASE_URL` has **17 accounts and
61/63 migrations** as of 2026-09-27. Its role as development, staging, or
production is not established; treat it as protected. The local public-schema
archive and restore proof are in `~/BlumiReleaseBackups/` with owner-only
permissions. That archive is an application-schema snapshot, **not** a full
Supabase platform backup. Upgrade the public production Supabase project to a
plan with managed backups and test a managed restore before taking payments.

## Railway service

1. Create/link the Blumi Railway project. Configure isolated `staging` and
   `production` environments; apply the IaC file to each only after reviewing
   its plan for unintended removals. Do not set `REALTIME_PORT`: the production
   default shares `PORT` with HTTP. Keep `sleepApplication=false` and one
   replica until fanout and worker concurrency have been load-tested.
2. In each environment's Railway secret variables, set `DATABASE_URL`,
   `BLUMI_OTP_HMAC_SECRET`, `FIREBASE_PROJECT_ID`,
   `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, `EXPO_PUSH_ACCESS_TOKEN`,
   `LIVEKIT_URL` (WSS), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
   `BLUMI_ADMIN_SIGNING_KEYS`, `BLUMI_ADMIN_ACTIVE_KID`,
   `BLUMI_APPLE_APP_ID`, `BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS`,
   `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_PROJECT_ID`,
   `REVENUECAT_WEBHOOK_SIGNING_SECRET`, and
   `REVENUECAT_COIN_PRODUCT_ID_MAP`. Give each environment distinct values
   where the provider supports it. Production-mode startup now rejects missing
   RevenueCat server configuration and rejects sandbox purchases outside
   staging. Only a TLS-protected session pooler or direct connection may be
   used because migrations use session advisory locks and realtime uses
   `LISTEN/NOTIFY`.
3. Provision a public Railway staging domain. Check `/health` and `/ready`
   separately. Railway's `/ready` healthcheck covers activation; add an
   independent recurring monitor because Railway healthchecks do not continue
   after deployment. Record the deployed commit and rollback deployment ID.

## Database change order

1. Confirm the intended Supabase project/environment and current migration
   IDs/checksums. Do not infer it from `.env.local`. Take a fresh managed backup
   plus a PostgreSQL 17 compatible public-schema archive, verify its SHA-256,
   and restore it into an isolated PostgreSQL 17 database. On plain PostgreSQL,
   create `anon` and `authenticated` as `NOLOGIN` roles before applying Blumi
   migrations; Supabase already supplies them.
2. Run the current migration runner **once** against the staging database. It
   must apply exactly `062_firebase_action_challenges.sql` and
   `063_firebase_user_deletion_outbox.sql` when starting from the observed
   61-migration state. Rerun to prove zero new applications and require schema
   readiness PASS. Validate Firebase challenge/deletion flows in staging.
3. Only after the production backup and staging evidence, run the same
   one-shot migration against the classified production database. A failed
   migration stops rollout. Deploy the matching API commit and require `/ready`
   to return 200. Do not use automatic pre-deploy migration for the initial
   rollout. Schema rollback is not automatic: restore the verified backup to a
   *new* database or apply a reviewed forward repair; switch the service only
   after data and compatibility checks. Keep the previous Railway deployment.

## Mobile and provider gates

- Link a real EAS project. `apps/mobile/app.config.js` fails preview/production
  configuration without `extra.eas.projectId`, which Expo Push needs. Set the
  EAS preview/production public API/WSS URLs, Sentry DSN, PostHog host/key,
  and RevenueCat iOS/Android **public** SDK keys in their respective EAS
  environments. Never put RevenueCat server keys or webhooks in EAS public
  variables. Configure APNs/FCM credentials and test a real token on two
  devices.
- Create a managed LiveKit Cloud project and configure its WSS URL and server
  keys in Railway. Verify room invitation, join/reconnect, local and remote
  voice, and initial mute/off on two accounts.
- Connect Apple and Google store products to RevenueCat. Use sandbox only in
  staging, verify signed webhook delivery, purchase, duplicate delivery,
  cross-account rejection, refund, and restore. Production uses live product
  IDs and a separate webhook endpoint/secret. Verify Firebase Phone Auth on
  real devices and monitor SMS usage.
- Before public release, pass Node 22 `npm run verify`, TestFlight and Play
  internal builds, backup restore, native room/purchase/push flows, external
  uptime checks, cost alerts, privacy/store metadata, and a documented
  rollback drill. A passing build is not evidence that the external flows ran.

## Current local evidence and open external gates (2026-09-27)

- Latest end-to-end `npm run verify` on this checkout exited 0 under Node
  22.22.2, matching `.nvmrc`; source/release checks, package builds, typecheck,
  lint, workspace tests, the isolated PostgreSQL migration gate, release
  dependency audit, and Expo Doctor completed. Expo Doctor reported 21/21.
  The shell's default Node is still 20.20.1, so select 22.22.2 before local
  verification. This proves code and disposable-database behavior only, not
  native, device, or external-provider behavior.
- The Operations Center's focused tests passed 3/3; its snapshot is refreshed
  from the local Git worktree on each request. Provider statuses remain a
  dated manual snapshot, not live monitoring. The recurring Codex check-in was
  canceled at the user's request on 2026-09-27; no background watcher is
  active.
- Fresh Expo iOS export completed with 4,284 modules and 1,081 assets (55 MB
  export). Inspection found onboarding artwork still imported from candidate
  paths, while the arrival and profile-reaction manifests state
  `runtimePromoted: false` and `userApproved: false`; the welcome-home cottage
  has no approval manifest. The export is not native or device proof. The
  preview/production app config now fails closed until candidate imports are
  moved out of release source after the appropriate visual and approval gates.
- The Blumi Operations Center is a read-only dashboard built from the launch
  control's status table. It exposes no provider secrets, account controls, or
  live provider telemetry; external status remains explicitly unverified.
- The Operations Center is not an admin console. The server has scoped APIs for
  reports and account recovery, but no web UI for them or for changing user
  limits. Any operator UI needs separate authentication, least privilege, and
  auditable actions.
- Dependency audit passes with time-limited advisory exceptions. In particular,
  GHSA-w5hq-g745-h8pq remains present transitively, but the inspected ngrok and
  gaxios consumers use only buffer-free UUID v4; the advisory concerns v3/v5/v6
  caller-provided buffers. This is a documented exception, not a patched package.
- PostgreSQL isolated gate: 17 suites, fresh 63 migrations and idempotent reruns
  passed after disposable Supabase role bootstrap.
- Existing protected Supabase database: read-only inspection found 17 accounts,
  61 migrations; 062/063 have **not** been applied there. A SHA-256 checked
  public-schema archive restored into PostgreSQL 17 with 17 accounts. The two
  new migrations and schema readiness passed on that disposable restore.
- Railway account/project, separate Supabase staging/production identities,
  managed production backup, EAS project link, LiveKit/Expo Push/RevenueCat
  credentials, native devices, store accounts, production domain, and external
  uptime/cost monitoring still require real external setup and evidence.
