# Blumi engineering audit — 2026-09-28 (in progress)

This is an evidence log, not a production-readiness certificate. The current
repository is Expo 57 / React Native 0.86, Fastify, PostgreSQL, and shared
TypeScript packages. Kotlin, Compose, and Gradle checks in the audit brief have
no implementation to inspect in this checkout.

## Verified baseline and measurements

- Node 22.22.2: five-workspace `npm run typecheck`, `npm run lint`, and
  `npm run doctor` passed; Expo Doctor reported 21/21 checks.
- Mobile match/room tests: 294/294 passed. Room hydration: 1/1 passed.
  Inventory: 20/20 passed. Avatar test groups and server tests passed in the
  2026-09-28 audit run; 25 server tests were skipped because their environment
  was unavailable. This is not a live PostgreSQL load test.
- An iOS *development-profile export* from the current checkout contained
  1,220 assets, 43,995,775 asset bytes, 13,985,892 JavaScript bytes, and
  58,058,683 total bytes. These are uncompressed export-file sums, not IPA size,
  download size, decoded texture memory, or startup time. The temporary export
  was removed after measurement.
- The booted iPhone 17 Simulator displayed the Shop with its avatar and product
  thumbnails. Its current Metro server was launched from this checkout. No
  frame-time trace or physical-device thermal/battery measurement was captured.

## Implemented fixes and why

1. Room avatar layer rendering: movement recreated layer objects each frame,
   making memoized image layers render despite unchanged image sources. The
   comparator now tracks the displayed frame asset and fit profile; asset,
   animation-frame, or fit changes still update. Pure regression tests cover
   unchanged objects, equipment changes, fit changes, and animation frames.
2. Room furniture rendering: inline per-item callbacks defeated memoization on
   every moving-avatar frame. The renderer now passes stable interaction
   callbacks and binds the item only inside the memoized component. Interaction
   API semantics remain unchanged. TypeScript and the match/room suite passed;
   live furniture tapping still needs route-level native QA.
3. Server idle work: live voice is disabled, yet its no-op revocation dispatcher
   was scheduled every second. The worker now starts only when the three media
   credentials are configured. This removes up to 86,400 no-op timer wakeups per
   server day in the current text-only configuration; it is not a measured
   battery or Railway cost saving.
4. Historical room QA catalog: a partial rollback left 12 references to removed
   Bed v0.23 assets and failed mobile TypeScript. The QA binding now uses the
   existing v0.12 safe asset. No candidate art was created or promoted.
5. Privacy: three room-snapshot render-error paths logged the user ID and raw
   error. They now log only a coarse error type. No snapshot behavior changed.

## Findings still open

- The release guard rejects 29 candidate onboarding/profile image imports.
  Do not disable it or promote unreviewed art to make a test green.
- Some historical Full-Wave tests import absent `art/` and
  `scripts/room-vnext-pilot/` JSON files. This is separate from the production
  rendering path. The missing artifacts must be resolved deliberately, not
  synthesized merely to satisfy a test.
- The initial root `npm test` run exposed stale release-config and Room
  renderer assertions. Those tests now verify the actual fail-closed candidate
  asset gate and the renderer's `onItemLongPressMove` callback. Full
  `npm run verify` passed on 2026-09-28, including PostgreSQL, dependency audit,
  and Expo Doctor 21/21. The 29 candidate imports still block preview and
  production mobile builds; a signed iOS build remains unproven.
- Network-request counts and database query plans were not measured against a
  controlled staging dataset. Inventory hydration has an in-flight coalescing
  mechanism, but this does not establish a request-count or p95 latency claim.
- The development export establishes package composition, not whether the
  1,220 assets are all necessary or when each decoded image enters memory.
  A release-profile binary, Instruments allocations/time-profile, and startup
  trace on a physical iPhone are still required.
- The My Room movement path still updates React state on animation frames.
  Any deeper UI-thread migration needs an interaction/frame-time baseline and
  native QA; lowering its frame rate without such evidence could make motion
  worse.

## Next evidence gate

On the same signed binary and data environment, record cold/warm startup,
Shop/Wardrobe/My Room route-switch frame times and allocations, request counts,
and database p50/p95 plus `EXPLAIN (ANALYZE, BUFFERS)` for hot queries. Compare
against this commit before changing animation architecture, caching policy, or
PostgreSQL indexes. No production data or external service was modified in
this audit run.
