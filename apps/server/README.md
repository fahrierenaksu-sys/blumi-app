# Blumi server

The server exposes the HTTP API on port `4000` and realtime WebSocket service on
port `4100` by default. It shares contracts and domain logic from the repository
workspaces under `packages/`.

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

Production configuration is fail-closed for required database, SMS, signing,
media, and commerce credentials. Never place their values in this repository.
