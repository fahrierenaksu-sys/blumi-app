# Blumi engineering rules

This file is not a style guide. Architecture, libraries and approach are your call. It lists what the automated guards enforce, so a red test doesn't surprise you, plus a few engineering facts the code doesn't make obvious. `AGENTS.md` has the strict rules.

## Test policy

Tests exist for two reasons:

1. To guard the strict rules: security, privacy, money and ownership, user data and stable IDs, and release safety (build guards, receipts, migrations).
2. To catch bugs that have really happened more than once (races, account leaks, lost messages, dead gestures, per-frame renders).

Everything else is tested by behaviour: call the function, mount the hook or hit the route, and check the outcome. Do not add tests that pin how code is written: regexes over a source file, exact copy or translations, pixel values, colours outside the approved palette, file names, call or query counts, or exact SQL. When a rule must hold everywhere, write it as one tree-wide guard (below), not as a pin on one file. The 2026-10-02 cleanup that applied this policy is summarised in `docs/quality/test-audit-2026-10-02/README.md`.

## Ratchet: `apps/mobile/scripts/mobile-engineering-rules.test.mjs`

This test runs in `npm --workspace @blumi/mobile run test:theme`, which is part of `npm test`. It scans every non-test `.ts`/`.tsx` file under `apps/mobile/src`.

| Guard | What fails |
|---|---|
| Mobile HTTP only through `requestJson` (deadline, abort, error mapping) | Any raw `fetch(` |
| Injected fetchers run inside `requestJson` | `await fetcher(` outside `features/network/apiClient.ts` and `features/inventory/economyApi.ts`. A direct call once left room invites busy forever |
| No per-frame JS loops | Any `requestAnimationFrame(` or `setInterval(`, even when it isn't animation, outside `features/roomV2/editor/useRoomEditorStageLayout.ts`. Drive motion on the UI or native thread. A renderer that must own its loop can join the allowlist with frame-time evidence |
| Reduce Motion from the shared store | An `AccessibilityInfo` reduce-motion query or listener outside `ui/animations.ts` |
| Reduce Transparency from the shared store | `isReduceTransparencyEnabled` or `reduceTransparencyChanged` outside `ui/reduceTransparency.ts` and `ui/reduceTransparencyStore.ts` |
| JS-driver animation | Any `useNativeDriver: false`. Animate transform and opacity on the native driver or with Reanimated |
| PanResponder | Any `PanResponder`, `panHandlers` or `GestureResponderHandlers` in code. Gestures use Gesture Handler with worklet callbacks; PanResponder handlers spread onto a Pressable shipped dead drags twice |
| UI-thread hops per frame | A `scheduleOnRN` or `runOnJS` inside a `useFrameCallback` callback, a gesture `onUpdate`/`onChange`/`onTouchesMove` callback or a `useAnimatedReaction` reaction that is not guarded by a comparison with the previous value (an enclosing `if`, or an earlier `if (...) return`). An unguarded hop renders React on every frame |
| React setters in gesture frames | A `set…(` call inside a gesture `onUpdate`/`onChange` body outside `scheduleOnRN`. It renders React per frame |
| Exit guards | `addListener("beforeRemove")` with `preventDefault()` outside the debt list (`useShopCombinationSession.ts`). Use `usePreventRemove`; the bare listener lets the iOS swipe pop the page while JS keeps the route |
| Worklet default parameters | A `'worklet'` function whose default parameter names an identifier. Resolve the default in the body |
| `react-hooks/exhaustive-deps` | Any suppression. The limit is 0. Fix the dependencies, or use `useEffectEvent` for values an effect reads but must not react to |

The allowlists in that file are the tolerated debt and may only shrink (exceptions: see `AGENTS.md`).

## Other guards that can surprise you

`test:theme` also runs these:

- `mobile-import-boundaries.test.mjs`
  - `src/config` never imports `features`, `screens` or `navigation`, and `src/ui` never imports `screens` or `navigation`.
  - The shared room (`features/miniRoom`, `MiniRoomScreen`) never imports the viewer's personal room provider or storage.
  - Home Studio QA bitmaps stay inside `features/roomStudio`, and the QA screen is imported only through the Metro-routed QA module (`scripts/homeStudioQaModuleRouting.test.mjs` checks the release routing).
- `mobile-worklet-closure.test.mjs` compiles worklets with the real Babel and Worklets plugin.
  - A worklet sees only the names it captures in its body or receives as parameters, which is why default parameters break.
  - It may call only other worklets or functions from packages in `UI_SAFE_PACKAGES` (today Reanimated, Worklets, Gesture Handler), and it reaches JS through `scheduleOnRN`. When you add a UI-thread library such as Skia, add it to that list in the same change.
  - Violations crash only on the device ("Property … doesn't exist"). Plain node tests can't see them.
- `mobile-theme-scope.test.mjs` pins the approved palette tokens (owner-approved look).

`test:accessibility` runs `mobile-accessibility-baseline.test.mjs`: every `Pressable`, `TextInput` and `FieldInput` in a non-test `.tsx` under `src` needs an accessible role and name.

`src/ui/gestureFrameWork.test.mjs` (`run-navigation-tests.mjs`): drag and scroll frame callbacks never call JS work unless a threshold check guards it, and the app root mounts the Gesture Handler root view.

Reduce Motion behaviour is tested where it lives: `src/ui/reducedMotionStore.test.ts` and `src/ui/springPressScale.test.ts` (a pressed control does not move under Reduce Motion).

Elsewhere (mobile paths are relative to `apps/mobile`):

- Route params carry serialisable data only, never functions or class instances (`src/navigation/routeParamsSerialisable.test.mjs`).
- `src/features/session/accountSwitchIsolation.test.ts`: module-level stores and caches are keyed by account and reset on account switch. Cached data once leaked between accounts.
- The `crashPrivacy` and analytics allowlist tests: crash reports carry only the allowlisted route-name tag, and analytics carry no IDs or personal data.
- `src/features/shop/shopReleaseCatalog.test.ts` (`test:shop-preview-assets`): every published item's runtime files are SHA-256 bound to its receipt.
  - Changing a published item's art bytes, or the resolvers that point at them, fails until the owner approves a new receipt.
  - `docs/quality/SHOP_CATALOG_PUBLICATION_2026-09-30.md` is hash-locked too.
- `apps/mobile/app.config.js` runs build-time guards:
  - Every build fails if a camera, audio, WebRTC or LiveKit package appears in the dependencies or the lockfile.
  - Preview and production builds also fail on imports from a `*candidate/` or `*candidates/` path.
- `npm run verify:source-hygiene`:
  - `.env*` files must stay ignored, except the example templates.
  - All workspaces share the root TypeScript version.
  - `apps/mobile/src` holds no emitted `.js` siblings of `.ts` files.
- `npm run verify:operations-center` parses `docs/release/LAUNCH_CONTROL.md`.
  - The file needs a `Snapshot: YYYY-MM-DD` line.
  - The table between `## At a glance` and `## Work in the right order` must keep exactly the columns Category | Area | Status | What that means | Owner | Next action | Evidence.
- `npm run verify:release-infra` (`.railway/railway.test.ts`) pins `.railway/railway.ts`, including `BLUMI_TRUST_PROXY=100.64.0.0/10` and a Node version equal to `.nvmrc`. That file is not the live Railway configuration (see `AGENTS.md`).

## Server facts

- Every authenticated route resolves the session with `resolveBearerSession`, which runs the ban and suspension check, and enforces its declared request schema. Three profile routes once skipped the check, and a schema was once attached but ignored.
- Repositories have an in-memory and a PostgreSQL implementation. Every method must exist in both and be covered by a shared contract suite (`apps/server/src/db/repositoryContract.ts` and the `*.contract.test.ts` files beside it), which runs against memory in `npm test` and against real PostgreSQL in the gate. The two have drifted before. Do not pin SQL text against a fake pool.
- `apps/server/src/db/migrationLedger.test.ts` checks migration naming (the two `032` files and the missing `044` stay), that every applied migration still matches its sha256 in `apps/server/db/migrations.applied.json` (append an entry when the owner applies a migration), and that pending migrations are additive and closed to the Supabase API roles.
- A test that writes to PostgreSQL uses `apps/server/src/db/disposablePostgres.ts`: it skips unless `BLUMI_TEST_REQUIRE_POSTGRES=1` and asserts a disposable `blumi_gate_*` database. Only `npm run verify:postgres` sets that, so a `DATABASE_URL` that points at the live database is not written by `npm test`. A few older race tests (presence, realtime ticket store, the first notification integration case) still skip only on an empty `DATABASE_URL` and should move to this guard.
- Demo and test-persona behaviour is gated by build flags and the deploy environment, never by heuristics. A demo session once restored in a production build.
- Inbound realtime events are parsed with the zod schemas in `packages/contracts`, and the platform-independent client is `packages/realtime-client`. Fan-out limits are in `docs/quality/REALTIME_LIMITS_2026-09-30.md`.
- New binaries refuse an old schema through `/ready`. A migration listed in `OPTIONAL_READINESS_MIGRATIONS` (`apps/server/src/operations/schemaReadiness.ts`) ships with a runtime probe that keeps its feature off, so that binary may deploy first. Examples are in `docs/release/MIGRATION_068_RUNBOOK.md` and `MIGRATION_070_RUNBOOK.md`.
- The migrator bounds lock waits with `BLUMI_MIGRATION_LOCK_TIMEOUT_MS`.
- Server tests run through `apps/server/scripts/run-server-tests.mjs`.
