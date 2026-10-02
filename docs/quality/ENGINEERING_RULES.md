# Blumi engineering rules

This file is not a style guide. Architecture, libraries and approach are your call. It lists what the automated guards enforce, so a red test doesn't surprise you, plus a few engineering facts the code doesn't make obvious. `AGENTS.md` has the strict rules.

## Ratchet: `apps/mobile/scripts/mobile-engineering-rules.test.mjs`

This test runs in `npm --workspace @blumi/mobile run test:theme`, which is part of `npm test`. It scans every non-test `.ts`/`.tsx` file under `apps/mobile/src`.

| Guard | What fails |
|---|---|
| Mobile HTTP only through `requestJson` (deadline, abort, error mapping) | Any raw `fetch(` |
| Injected fetchers run inside `requestJson` | `await fetcher(` outside `features/network/apiClient.ts` and `features/inventory/economyApi.ts`. A direct call once left room invites busy forever |
| No per-frame JS loops | Any `requestAnimationFrame(` or `setInterval(`, even when it isn't animation, outside `features/roomV2/editor/useRoomEditorStageLayout.ts`. Drive motion on the UI or native thread |
| Reduce Motion from the shared store | An `AccessibilityInfo` reduce-motion query or listener outside `ui/animations.ts` |
| Reduce Transparency from the shared store | `isReduceTransparencyEnabled` or `reduceTransparencyChanged` outside `ui/reduceTransparency.ts` and `ui/reduceTransparencyStore.ts` |
| File size | More than 800 newlines in one file, unless the file is in the oversized allowlist, whose caps may only shrink. Generated catalogs and asset manifests count too, so split them or generate them outside `src` |
| Worklet default parameters | A `'worklet'` function whose default parameter names an identifier. Resolve the default in the body |
| `react-hooks/exhaustive-deps` | Any suppression. The limit is 0. Fix the dependencies, or use `useEffectEvent` for values an effect reads but must not react to |

The allowlists in that file are the tolerated debt and may only shrink (exceptions: see `AGENTS.md`).

## Other guards that can surprise you

`test:theme` also runs these:

- `mobile-import-boundaries.test.mjs`
  - `src/config` never imports `features`, `screens` or `navigation`, and `src/ui` never imports `screens` or `navigation`.
  - `src/ui` → `src/features` imports are checked against a baseline. A new import fails, and so does a removed one until you delete its baseline line.
- `mobile-worklet-closure.test.mjs` compiles worklets with the real Babel and Worklets plugin.
  - A worklet sees only the names it captures in its body or receives as parameters, which is why default parameters break.
  - It may call only other worklets or UI-thread APIs (Reanimated, Worklets, Gesture Handler), and it reaches JS through `scheduleOnRN`.
  - Violations crash only on the device ("Property … doesn't exist"). Plain node tests can't see them.
- `mobile-ui-thread-motion-contract.test.mjs` pins specific surfaces to UI-thread motion, each with a non-moving Reduce Motion path.
- The theme-scope and icon-contract tests pin the approved palettes and require Ionicons instead of text glyphs.

Elsewhere (mobile paths are relative to `apps/mobile`):

- Route params carry serialisable data only, never functions or class instances (`src/navigation/routeParamsSerialisable.test.mjs`).
- `src/features/session/accountSwitchIsolation.test.ts`: module-level stores and caches are keyed by account and reset on account switch. Cached data once leaked between accounts.
- The `crashPrivacy` and analytics allowlist tests: crash reports carry only the allowlisted route-name tag, and analytics carry no IDs or personal data.
- `src/features/shop/shopReleaseCatalog.test.ts` (`test:shop-preview-assets`): every published item's runtime files are SHA-256 bound to its receipt.
  - Changing a published item's art bytes, or the resolvers that point at them, fails until the owner approves a new receipt.
  - `docs/quality/SHOP_CATALOG_PUBLICATION_2026-09-30.md` is hash-locked too.
- `apps/mobile/app.config.js` runs build-time guards:
  - Every build fails if a camera, audio, WebRTC or LiveKit package appears in the dependencies or the lockfile.
  - Preview and production builds also fail on imports from a `*candidate/` path.
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
- Repositories have an in-memory and a PostgreSQL implementation. Every method must exist in both and be covered by the shared suite in `apps/server/src/db/repositoryContract.ts`. The two have drifted before.
- Demo and test-persona behaviour is gated by build flags and the deploy environment, never by heuristics. A demo session once restored in a production build.
- Inbound realtime events are parsed with the zod schemas in `packages/contracts`, and the platform-independent client is `packages/realtime-client`. Fan-out limits are in `docs/quality/REALTIME_LIMITS_2026-09-30.md`.
- New binaries refuse an old schema through `/ready`. A migration listed in `OPTIONAL_READINESS_MIGRATIONS` (`apps/server/src/operations/schemaReadiness.ts`) ships with a runtime probe that keeps its feature off, so that binary may deploy first. Examples are in `docs/release/MIGRATION_068_RUNBOOK.md` and `MIGRATION_070_RUNBOOK.md`.
- The migrator bounds lock waits with `BLUMI_MIGRATION_LOCK_TIMEOUT_MS`.
- Server tests run through `apps/server/scripts/run-server-tests.mjs`.
