# Test audit 2026-10-02: summary

`findings.json` holds the per-file verdicts (18 chunks, 809 files). This page summarises what the cleanup did with them. The policy it applied is in `docs/quality/ENGINEERING_RULES.md` ("Test policy").

## Verdicts

| Verdict | Files | Meaning |
|---|---|---|
| KEEP_SAFETY | 224 | Guards a strict rule: security, privacy, money and ownership, user data and stable IDs, release safety |
| KEEP_BEHAVIOR | 165 | Tests real behaviour through the public surface |
| KEEP_FREQUENT_BUG | 69 | Guards a bug class that happened more than once (races, account leaks, lost messages, dead gestures) |
| TRIM | 152 | Behaviour test with implementation pins mixed in; the pins were removed |
| REWRITE | 49 | Right intent, wrong method; replaced by a behaviour test, a pure model or a tree-wide guard |
| REMOVE | 150 | Pins implementation text, copy, pixels, counts, SQL or file names, or covers dead code |

## What changed

- **Test files deleted: 171** (140 mobile, 31 server). This is the REMOVE files plus REWRITE files whose content moved into a new test. Eleven test-only helper scripts went with them (native UI runner and helpers, bundle-size runner, Workbench fixture runner, male rig thumbnail runner, room V3 alpha script).
- **Test files changed: 189** (trims and in-place rewrites across mobile, server, packages, scripts and tools).
- **New tests and guards:**
  - Server: `migrationLedger.test.ts` with `db/migrations.applied.json` (replaces 17 per-migration regex tests); auth, mini room and connection repository contracts that run on memory and on real PostgreSQL; `disposablePostgres.ts`, so writing tests run only inside the disposable gate.
  - Mobile tree-wide rules: no `useNativeDriver: false`, no PanResponder, no unguarded per-frame UI-to-JS hop, no React setter in a gesture frame, `usePreventRemove` for exit guards, accessible role and name on every pressable and input, gesture and scroll frame work behind a threshold, shared room never reads personal room state, Home Studio QA stays behind its module routing.
  - Mobile models pulled out of screens so they can be tested by behaviour: MiniRoom composer, Discover filter hydration and refresh, showcase authorization, room setup placement feedback, onboarding step handlers, sheet exit, bottom nav order.
  - Behaviour tests for session mutation isolation, shop purchase actions, notification response routing, partner block wiring, copy locale parity, the starter avatar catalog, and Reduce Motion on pressed controls.
  - Release guard: preview and production builds also refuse plural `candidates/` imports. `scripts/automation/local-backup.test.mjs` now runs in `npm run verify`.
- **Config:** mobile lint no longer enforces `react/display-name` and `react/no-unescaped-entities`; `noUnusedParameters` is off. Dead media-mode and voice branches left `mobile-release-config.cjs` (the voice-flag refusal stays).
- **`apps/mobile/package.json` scripts changed** (native fingerprint changes, so OTA stays blocked until the next native build): `test:launch-config`, `test:bundle-size` and `test:workbench` removed; deleted files dropped from `test:theme`, `test:accessibility`, `test:layout`, `test:onboarding-navigation`, `test:room-hydration`, `test:shop-preview-assets`, `test:performance-assets` and `test:wardrobe`.

## What was kept on purpose

- Everything that guards security, privacy, money, ownership, user data, stable IDs and release safety: shop receipts and hash locks, the media-package build guard, candidate-asset guard, auth and ban checks, account isolation, crash and analytics privacy, migration immutability.
- The approved palette tokens (`mobile-theme-scope`), because the drawn look is owner-approved.
- Tests for repeated bug classes, even where they read source text, until a behaviour test replaces them.
- One server case differs from its verdict: a failure after the chat-path room claim leaves one durable room that a retried accept returns, because `decideChatInvite` has no rollback by design.

## Production code left test-only or unused

Listed for a separate cleanup, not deleted here: `chatMessageEditPolicy.ts`, unused moderation queue helpers, several repository methods only tests call, the voice-only media revocation path and the lobby invite path; on mobile, many `roomV3*` pilot modules, `RoomDebriefScreen`, `livekitRoomLifecycle`, `roomStudioPlacement`/`Presentation`, onboarding motion and asset gates, and dead exports in onboarding, discovery, shop, referral and config modules; `parsePublicProfileCard` and `resolveSelectedPublicPrompt` in contracts.
