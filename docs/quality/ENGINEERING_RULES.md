# Blumi engineering rules

Binding for every change, by people and by AI agents. `AGENTS.md` points here.
These rules keep the fixes from the 2026-09-29/30 transformation (security,
correctness, architecture, performance) from regressing. Each rule names how it
is enforced today. Where a rule is not yet enforced by a test, reviewers and
agents enforce it by reading the diff.

A rule may be broken only with a written reason in the commit message and, for
guarded rules, an explicit allowlist change in the same commit. "It was faster"
is not a reason.

## How to add a feature

1. Read the current code and tests for the area first (`AGENTS.md` →
   Repository truth).
2. Put the feature under `apps/mobile/src/features/<feature>/` (mobile) or the
   matching `apps/server/src/<area>/` folder (server). Shared types and wire
   formats go in `packages/contracts`; shared domain rules in `packages/domain`.
3. Split by responsibility, as the decomposed screens do
   (`features/settings`, `features/session/register`, `features/chat/thread`,
   `features/shop/screen`, `features/roomV2/editor`, `features/avatarV2/wardrobe`):
   - `*Screen.tsx`: composition only (layout, wiring hooks to views).
   - `use*.ts` hooks: state, effects, side effects, one concern each.
   - `*Model.ts`: pure functions with node tests (decisions, formatting,
     thresholds). Logic that can be pure must be pure.
   - View components: presentational, props in, callbacks out.
   - `*Copy.ts`: user-facing text, Turkish and English.
4. Write the failing test first, then the code. Add every new test file to a
   runner (`apps/mobile/scripts/run-*-tests.mjs` list or a `test:*` script).
   A test that no runner lists never runs.
5. Run `npm run typecheck`, `npm run lint` and the affected test groups; run
   `npm run verify` before anything reaches `main`.

## Architecture

| Rule | Why | Enforced by |
|---|---|---|
| Production files stay under 800 lines; listed oversized files may only shrink | Large files mixed lifecycle, UI and rules and could not be tested | `mobile-engineering-rules.test.mjs` |
| `ui/` and `config/` never import from `features/`; the allowlist may only shrink | Layer inversions made shared UI depend on product features | `mobile-import-boundaries.test.mjs` |
| `RootNavigator.tsx` declares routes only; app-wide lifecycles live in `navigation/use*.ts` hooks | The navigator was a 1,992-line mix of realtime, chat sync, push and deep links | Review |
| Route params carry serialisable data only, never functions or class instances; screens get callbacks from the owning hook as props | Functions in params break state persistence, deep links and restoration | `routeParamsSerialisable.test.mjs` (type-checks `RootStackParamList`) |
| Deep links arriving before the signed-in stack go through `navigation/pendingDeepLink.ts` | Links were silently dropped before `Main` mounted | `pendingDeepLink` tests |
| One source of truth per piece of state; module stores are keyed by account and reset on account switch | Cached data leaked between accounts | `accountSwitchIsolation.test.ts` |
| Production catalogues are named `*Catalog.ts`, never `*.mock.ts` | Mock names hid real product data | Review |
| One semantic cosmetic ID from Shop to Remote Participant (`AGENTS.md`) | Parallel IDs corrupt inventory | Existing catalog/parity tests |

## Network, realtime and server

| Rule | Why | Enforced by |
|---|---|---|
| Mobile HTTP only through `requestJson` (deadline, abort, error mapping) | Raw fetches had no timeout and inconsistent errors | `mobile-engineering-rules.test.mjs` (no `fetch(`) |
| Inbound realtime events are parsed with the shared zod schemas from `packages/contracts`; the platform-independent client lives in `packages/realtime-client` (the app keeps only React, AppState/NetInfo and ticket wiring) | Shape checks accepted malformed events | `packages/realtime-client` tests |
| Every authenticated server route resolves the session with `resolveBearerSession` | Three profile routes skipped the ban/suspension check | Route tests |
| Routes declare request schemas and keep request validation enforced | Validation was attached but ignored | `routeHelpers` / route tests |
| Every repository method exists in both the in-memory and PostgreSQL implementation and is covered by the shared contract suite | The two implementations drifted (economy replay) | `repositoryContract.ts` suites |
| No N+1 queries: batch lookups; new hot queries get an `EXPLAIN (ANALYZE, BUFFERS)` note | sync-matches and block lists issued one query per partner | Review; `batchedLookups.postgres.test.ts` |
| Realtime fan-out respects the slow-consumer and chunking limits in `docs/quality/REALTIME_LIMITS_2026-09-30.md` | One slow socket could stall a whole instance | Connection manager tests |

## Database and release

| Rule | Why | Enforced by |
|---|---|---|
| Applied migrations are immutable; never rename or renumber (two `032_*`, no `044`) | Checksums gate `/ready` | Migrator checksum check |
| Migrations are additive first; the order is migrate, then deploy; each non-trivial migration gets a runbook with a compatibility matrix (see `docs/release/MIGRATION_068_RUNBOOK.md`) | New binaries refuse an old schema; old binaries must survive a new one | `/ready` schema readiness |
| The migrator bounds lock waits inside each migration transaction (`BLUMI_MIGRATION_LOCK_TIMEOUT_MS`) | A queued `ALTER` blocks every request on that table | `migrateLockTimeout.postgres.test.ts` |
| Supabase Free plan has no platform backup: take and restore-test a PostgreSQL 17 dump before any schema change | A backup that was never restored is not a backup | Runbook |
| Railway does not reliably auto-deploy from `main`; confirm the deployment commit after every merge | A merge once produced no deploy | Runbook |

## Performance and motion

| Rule | Why | Enforced by |
|---|---|---|
| Animation runs on the UI thread with Reanimated shared values; never drive motion through React state or the JS bridge per frame | Per-frame React renders drop frames (known debt: avatar frame ticker, My Room movement) | `mobile-engineering-rules.test.mjs` (no new `requestAnimationFrame`/`setInterval`) |
| Every name a worklet uses must exist on the UI thread: values reach it through the closure (used in the body) or parameters, never through default parameters; a worklet calls only other worklets or UI-thread library APIs (Reanimated, Worklets, Gesture Handler), and reaches JS with `scheduleOnRN` | These fail only on the device ("Property … doesn't exist"); node tests run plain JavaScript. The main-tab pager crashed this way on 2026-09-30 | `mobile-worklet-closure.test.mjs` compiles the app with the real Babel/Worklets plugin and checks each worklet's UI-thread code; `mobile-engineering-rules.test.mjs` |
| Gestures use React Native Gesture Handler with explicit ownership (relations such as `blocksExternalGesture`), not scattered boolean flags | Competing gestures stole touches | Review; gesture tests |
| Reduce Motion is read from the shared store (`ui/animations.ts`), never from a new `AccessibilityInfo` subscription | 30 components each subscribed and flashed motion on mount | `mobile-engineering-rules.test.mjs`, `reducedMotionStore.test.ts` |
| Do not add `react-hooks/exhaustive-deps` suppressions; fix the dependency list or restructure the hook | Suppressions hid stale-closure bugs (48 → 26) | `mobile-engineering-rules.test.mjs` (count may not grow) |
| Lists use `FlatList`/`SectionList` with stable keys and memoised rows | Re-rendering whole lists on each update | Review |
| Performance claims need a before/after measurement on a device | Code review cannot prove smoothness | Review; `AGENTS.md` native evidence |

## Security and privacy

| Rule | Why | Enforced by |
|---|---|---|
| No phone numbers, tokens, message bodies or ids in logs, analytics or crash reports | Privacy and store review | `crashPrivacy` tests, analytics allowlist tests |
| Crash reports carry only the allowlisted route name tag | Route params could leak ids | `crashPrivacy` tests |
| Demo and test-persona behaviour is gated by build flags and deploy environment, never by guesses | A demo session restored in production builds | Session persistence and persona tests |
| Secrets live in environment variables only; never read or print secret values in tooling output | Leaked credentials | Source hygiene gate |

## Tests and process

- Never delete, skip or weaken a test to make a gate pass. Repair it or record
  why it is stale and retire it in a reviewed commit.
- Status labels follow `AGENTS.md`: Implemented, Tested, Native verified, User
  approved, Production ready. Tests passing is not native verification;
  pushing is not a release.
- Commits are small and single-purpose with conventional messages; stage an
  explicit file list.
- Keep `docs/quality/CLOSING_AUDIT_2026-09-30.md` and `LAUNCH_CONTROL.md`
  current when a status changes; a stale "done" is worse than an honest "open".

## Known debt (do not copy these patterns)

- Avatar frame ticker (`RoomAvatarRenderer2D.tsx`) and My Room movement
  (`MyRoomScreen.tsx`) still use JS timers and React state.
- Module stores follow different shapes.
- The files in the oversized and frame-loop allowlists of
  `apps/mobile/scripts/mobile-engineering-rules.test.mjs`.
