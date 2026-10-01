<p align="center">
  <img src=".github/assets/blumi-cover.svg" alt="Blumi — Start with a conversation. Build a shared world." width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Expo-SDK_57-49334F?style=flat-square&amp;logo=expo&amp;logoColor=white" alt="Expo SDK 57" />
  <img src="https://img.shields.io/badge/React_Native-Mobile-8064B1?style=flat-square&amp;logo=react&amp;logoColor=white" alt="React Native" />
  <img src="https://img.shields.io/badge/TypeScript-Full_Stack-527BA8?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-Persistence-577F8E?style=flat-square&amp;logo=postgresql&amp;logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Stage-Closed_Test_Prep-C66693?style=flat-square" alt="Closed test preparation" />
</p>

<h1 align="center">Meet through personality. Connect through conversation.</h1>

Blumi is an avatar-first social mobile app combining discovery, mutual matching, messaging, and shared virtual rooms. People can express themselves through a character and a personal space, then connect at their own pace.

This repository contains the React Native application, backend API, real-time services, and shared TypeScript packages. **Status: active development and closed-test preparation; not publicly released.**

[Product experience](#product-experience) · [Engineering highlights](#engineering-highlights) · [Release status](#release-status) · [Explore the code](#explore-the-code) · [Run locally](#run-locally)

<br />

<table>
  <tr>
    <td align="center" width="33%">
      <br />
      <img src="apps/mobile/src/features/session/assets/onboarding-wave-v3-runtime/blumi_intro_wave_female_f04.png" width="160" alt="Blumi's smiling female avatar waving hello" />
      <br /><strong>A little personality.</strong><br />
      <sub>Your style. Your character.</sub><br /><br />
    </td>
    <td align="center" width="34%">
      <img src="apps/mobile/assets/brand/blumi-app-icon-1024.png" width="80" alt="Blumi app icon" />
      <br /><br /><strong>Good connections<br />start with a hello.</strong><br /><br />
      <sub>Express yourself.<br />Meet someone.<br />Make room for a connection.</sub>
    </td>
    <td align="center" width="33%">
      <br />
      <img src="apps/mobile/src/features/session/assets/onboarding-wave-v3-runtime/blumi_intro_wave_male_f04.png" width="160" alt="Blumi's smiling male avatar waving hello" />
      <br /><strong>A new possibility.</strong><br />
      <sub>A conversation worth starting.</sub><br /><br />
    </td>
  </tr>
</table>

<p align="center"><sub>Characters from Blumi's onboarding artwork.</sub></p>

<a id="product-experience"></a>

## ✦ Product experience

**Create an avatar → Discover people → Match → Start a conversation → Meet in a shared room**

| 🌷 Make it yours | 💬 Find a connection | 🏡 Share a space |
| :--- | :--- | :--- |
| Build an avatar with clothing and accessories. Decorate a room that expresses your style. | Discover profiles and interests. Start a text conversation after a mutual match. | Send a room invitation from chat. Meet in a shared copy of the host's decor, with optional live voice. |

**Your pace, your boundaries.** Notification preferences, blocking, reporting, account export, and deletion give users control over their experience.

The product centers on avatars, text, and optional live voice. Photos, video calls, and voice messages are outside the current product scope.

<a id="engineering-highlights"></a>

## ◈ Engineering highlights

The implementation focuses on keeping user-visible behavior consistent when requests overlap, connections drop, or background jobs retry.

| Area | Implementation approach |
| --- | --- |
| Account isolation | Session-generation guards prevent delayed responses from a previous account from overwriting the current session. |
| Durable messaging | PostgreSQL transactions and an outbox coordinate message persistence and delivery jobs, with retries and message-ID deduplication. |
| Stable discovery | Server-side candidate snapshots support pagination while decisions and eligibility change; current access checks still apply to each page. |
| Shared room state | Accepted invitations preserve the host's decor so both participants receive the same room data. |
| Service lifecycle | Readiness checks, bounded requests, and graceful shutdown coordinate active work with database closure. |
| Privacy | Generic chat push bodies, telemetry filtering, and streamed account exports reduce unnecessary exposure and memory usage. |

## ⚙ Technology

| Layer | Stack |
| --- | --- |
| Mobile | Expo SDK 57, React Native, TypeScript |
| Backend | Node.js, Fastify, WebSocket |
| Persistence | PostgreSQL, versioned SQL migrations |
| Shared code | TypeScript contracts, domain rules, real-time client |
| Workspace | npm workspaces with a single root lockfile |

<a id="explore-the-code"></a>

## ↗ Explore the code

| Directory | Responsibility |
| --- | --- |
| [apps/mobile](apps/mobile) | Screens, onboarding, avatars, room rendering, and mobile state |
| [apps/server](apps/server) | Authentication, API routes, real-time services, workers, and data access |
| [packages/contracts](packages/contracts) | Shared request, response, and event contracts |
| [packages/domain](packages/domain) | Shared business rules and catalogs |
| [packages/realtime-client](packages/realtime-client) | Real-time client package |
| [scripts/security](scripts/security) | Dependency checks, source hygiene, and isolated PostgreSQL verification |

For a closer look at behavior under failure and concurrency:

- [Account deletion and notification dispatch races](apps/server/src/db/postgresDiscoveryWatchAtomicity.postgres.test.ts)
- [Durable chat delivery and rollback](apps/server/src/db/postgresChatRepository.postgres.test.ts)
- [Discovery pagination across changing eligibility](apps/server/src/matches/postgresDiscoverySnapshots.test.ts)
- [Streaming a 100,000-message account export](apps/server/src/account/accountDataExport.postgres.test.ts)

## Run locally

<details>
<summary><strong>Developer setup — requirements, installation, and local commands</strong></summary>

### Requirements

- Node.js 22.23.3 (`nvm use`, from `.nvmrc`) and npm 10+
- PostgreSQL tools (`initdb`, `pg_ctl`) on `PATH` for full verification
- Xcode and CocoaPods for native iOS development

### Install

```bash
npm ci
cp .env.example .env.local
```

Use the root workspace and lockfile for installation. Do not create separate lockfiles inside workspaces. Local environment files are ignored by Git; use the example files to configure each environment.

The default local server uses in-memory storage and development providers. Configure persistent storage and external integrations separately. Keep real credentials in ignored environment files or a deployment secret manager.

### Start the application

Start the API and real-time server:

```bash
npm run dev:server
```

In a second terminal, start Expo:

```bash
npm start
```

This starts Metro from `apps/mobile` on LAN port `8081` for the native Blumi development client. Install the development build on the phone or Simulator first. The device must be able to reach the development machine and its configured API address.

For a clean Metro cache:

```bash
npm --workspace @blumi/mobile run start:clear
```

To start the development client explicitly:

```bash
npm --workspace @blumi/mobile run start:dev-client
```

For Expo Go demos that do not require the native integrations:

```bash
npm --workspace @blumi/mobile run start:go
```

To build the native iOS app locally:

```bash
cd apps/mobile
SENTRY_DISABLE_AUTO_UPLOAD=true npm run ios
```

</details>

## ✓ Verification

```bash
npm run verify
```

The pipeline is a multi-step release gate; the authoritative list of steps is in the Commands section of [AGENTS.md](AGENTS.md).

The PostgreSQL gate creates a temporary cluster accessible through a local Unix socket. It does not use an existing `DATABASE_URL`. Migrations are tested from an empty database and on a repeated run; missing tools or skipped database tests fail the gate. The cluster is stopped and its generated data removed afterward, while diagnostic logs are retained. Set `BLUMI_PG_KEEP_TEST_DATA=1` only when retaining a test database for investigation.

Installation applies a version-specific React Navigation compatibility patch for the updated `query-string` dependency. Source checks and deep-link regression tests cover this patch.

Automated source checks complement device testing. Real-device audio, push delivery, purchase-provider flows, and file sharing require separate integration validation. Production packaging checks legal configuration before native preparation; preview configuration does not establish production readiness.

<a id="release-status"></a>

## Release status

**Current as of 2026-09-30: not ready for public release.** The latest full `npm run verify` passed on 2026-09-30 on the integration branch `claude/busy-cray-dl5wvr` (not merged to `main`), including package builds, type checks, lint, workspace tests, isolated PostgreSQL migration checks, the release dependency audit, and Expo Doctor (21/21); see the [2026-09-30 engineering audit](docs/quality/ENGINEERING_AUDIT_2026-09-30.md). These checks validate the repository and disposable test database; they do not prove a live deployment or native-device release.

The earlier candidate-import build block is resolved: the owner-approved artwork was promoted to runtime paths and the release candidate-import gate remains in place. Railway and external provider setup, EAS/TestFlight distribution, real-device OTP/push/voice/purchase flows, production backup/restore, and continuous monitoring still need verification. The protected Supabase test database was last inspected read-only on 2026-09-28: 18 accounts, 65 applied migration checksums matching source, and integrity migration 066 not live (this supersedes the earlier 2026-09-27 note that migrations 062–063 were not applied; see [Launch Control](docs/release/LAUNCH_CONTROL.md) and the [database release runbook](docs/release/DATABASE_RELEASE_RUNBOOK.md)).

See [Launch Control](docs/release/LAUNCH_CONTROL.md) for the dated readiness snapshot and [the staging and production guide](docs/release/railway-supabase-launch.md) for the deployment sequence and evidence requirements. Provider and account statuses can change, so recheck those documents before taking release action.
