# Blumi server

Locally the server exposes the HTTP API on port `4000` and the realtime
WebSocket service on port `4100`. With `NODE_ENV=production` both share `PORT`
unless `REALTIME_PORT` is set. It shares contracts and domain logic from the
repository workspaces under `packages/`.

## Local development

From the repository root, install dependencies and copy
`apps/server/.env.example` to an ignored local environment file. Start the
server with the root `dev:server` command. The example configuration uses the
in-memory repositories and development providers, so PostgreSQL is not required
for the first local run.

QA authentication is deliberately disabled in the committed template. When it
is enabled locally, the server enforces development mode, loopback hosting, the
in-memory auth repository, a valid E.164 phone number, and a six-digit code.

## PostgreSQL

Set `BLUMI_AUTH_REPOSITORY=postgres` and provide `DATABASE_URL`, then run the
root database migration command before starting the server. Migration files are
kept in `db/migrations` and execute in filename order.

Production configuration (`NODE_ENV=production`) is fail-closed. Startup
requires:

- PostgreSQL: `DATABASE_URL` (the repository defaults to `postgres`; `memory`
  is rejected) and `BLUMI_OTP_HMAC_SECRET` (at least 32 characters);
- `BLUMI_PUSH_PROVIDER=expo` (the default, `development`, is rejected) and
  `EXPO_PUSH_ACCESS_TOKEN`;
- `BLUMI_ADMIN_SIGNING_KEYS` and `BLUMI_ADMIN_ACTIVE_KID`;
- `BLUMI_TRUST_PROXY` (on Railway `100.64.0.0/10`);
- unless `BLUMI_DEPLOY_ENV=staging`, the app-link identities
  `BLUMI_APPLE_APP_ID` (`TEAMID.com.blumi.mobile`) and
  `BLUMI_ANDROID_SHA256_CERT_FINGERPRINTS`. An unset `BLUMI_DEPLOY_ENV` counts
  as production. With `staging`, startup instead requires
  `REVENUECAT_PURCHASE_ENVIRONMENT=sandbox`, even when payments are off, and
  the app-link routes are not served unless both identities are set;
- RevenueCat server credentials, unless `BLUMI_PAYMENTS_ENABLED=0` (the
  first-release setting).

Live voice is disabled in code: `BLUMI_VOICE_ENABLED=1` is rejected and
LiveKit credentials are not read. Firebase phone sign-in reads
`FIREBASE_PROJECT_ID` and the service-account secret. Never place any of these
values in this repository.
