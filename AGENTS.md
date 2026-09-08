# Blumi Project Instructions

This file is the repository-wide operating contract for AI agents. Follow the current user request first, then this file, then any narrower `AGENTS.md` closer to the files being changed.

## Product

Blumi is a React Native and Expo social application with a premium, soft 2.5D chibi avatar and room experience. Use **Blumi** publicly; keep DateVibe names only where technical compatibility requires them.

The approved social loop is:

`mutual match -> text chat -> optional chat-initiated room invitation -> shared room`

Shared-room text is durable. Live voice is optional and starts muted/off. Profile photos, photo sharing, GIFs, video, camera flows, video calls, and voice messages are outside scope unless the user explicitly changes it. The room and avatar must feel native to the mobile application, not like a separate fullscreen game.

## Decision order

When requirements compete:

1. Follow the user's latest explicit instruction.
2. Preserve the recognizable Blumi chibi identity and approved product behavior.
3. Preserve user inventory, purchases, rooms, loadouts, persisted data, and stable IDs.
4. Keep ownership, economy, and persistence server-authoritative.
5. Prefer a small verified change and reversible migration over a broad rewrite.
6. Protect native quality, accessibility, performance, security, and privacy.

Never redesign the character, change the product loop, or add a new runtime merely because it is easier to implement.

## Repository truth

Inspect the active checkout before planning or editing. Current code, installed packages, native configuration, tests, runtime behavior, and the user's latest decisions outrank folder names, old reports, screenshots, memory, or remote history.

- `apps/mobile`: Expo and React Native client.
- `apps/server`: backend services.
- `packages/contracts`: shared boundary contracts.
- `packages/domain`: shared domain rules.
- `packages/realtime-client`: realtime client behavior.

Do not infer the Expo SDK from this checkout's directory name. Read `apps/mobile/package.json`; it currently declares Expo SDK 57. For Expo, React Native, React, Reanimated, Worklets, or another fast-moving dependency, verify the installed version and consult matching official documentation.

Before editing, read the relevant implementation and tests, inspect `git status`, locate the real runtime resolver and persistence boundary, and preserve unrelated dirty or untracked work.

## Product and architecture invariants

The backend is authoritative for inventory, purchases, coins, cosmetic and furniture ownership, persisted avatar loadout, persisted room state, and access decisions. Never treat UI, cache, realtime presence, or visual state as proof of ownership. Validate external input, keep secrets out of code, and avoid private content in logs, analytics, errors, snapshots, and notifications.

One semantic cosmetic ID must flow through:

`Shop -> Purchase -> Inventory -> Wardrobe -> Avatar -> Room -> MiniRoom -> Remote Participant`

Use compatibility adapters during migration; do not create permanent parallel identities for the same item.

The current production avatar uses layered PNG assets and existing motion contracts. Maintain it for live fixes without expanding frame-by-frame PNG animation as the long-term architecture. Avatar V3 is an additive premium 2.5D skeletal direction based on Spine Professional, reusable animation, canonical views, explicit mirror safety, and weighted clothing deformation where it adds visible value. Preserve the existing chibi design and canonical IDs.

Do not introduce Rive, Unity, Unreal, Cocos, Defold, Filament, or another primary runtime without an explicit user decision supported by a verified blocker and migration evidence. Do not remove V2 until the replacement passes native, compatibility, persistence, migration, and performance gates.

Evolve RoomWorld concepts such as walkable geometry, footprints, blockers, seating, approach and exit points, sockets, depth, and persistence. Prefer data-driven interaction rigs over furniture-ID conditionals. Add React Native Skia only in measured, incremental slices. Do not drive animation through React state or the JS/native bridge every frame. Preserve Reduce Motion.

## Character and cosmetic production

The original sweet chibi identity is locked. Every hair, garment, hand treatment, and shoe must be designed for the current canonical base so the character reads as one drawing. A code test cannot approve visual quality.

For any character, hair, wardrobe, cosmetic-fit, animation, or rig task, use the repository skill:

`$blumi-character-asset-production`

Its detailed rules cover the external Workbench, frozen production briefs, source locks, anatomy and fit gates, native evidence, promotion, and stop conditions. Use the current active Codex model unless the user explicitly requests delegation; do not make a named model a standing blocker.

The non-negotiable storage boundary is:

- Production sources, prompts, editable masters, experiments, rejected candidates, QA renders, temporary scripts, and provenance stay under `/Users/evrenevren/BlumiArtWorkbench/`.
- This repository receives only user-approved optimized runtime assets, required production wiring, runtime metadata actually consumed by the app, and meaningful integration tests.
- Deleting `BlumiArtWorkbench` must never break an application build or Store release.

Candidate and quarantine assets must not resolve in production. Preserve product IDs and entitlements when artwork changes.

## Implementation workflow

Work autonomously through the requested scope. Ask only when an unresolved choice would materially change product behavior, migrate or destroy data, incur meaningful cost, contradict a locked requirement, or create a difficult-to-reverse architecture decision.

Be solution-oriented. Do not stop at describing a defect, repeating a plan, or producing more diagnostics after the root cause is known. Turn evidence into a concrete fix, carry the fix through its relevant checks, and present a reviewable result. When the first approach fails, identify why it failed and choose a materially better method instead of polishing the same failure.

Use creative engineering judgment inside the locked product boundaries. Compare viable methods by expected visual or product gain, implementation cost, reversibility, runtime risk, and proof quality. Prefer the simplest method that can meet every acceptance gate. Prototype uncertain ideas in a bounded and disposable form, keep experiments out of production paths, and promote only the proven result.

For code changes:

1. Find the root cause and smallest coherent boundary.
2. Add a failing regression test first when executable behavior changes and a meaningful test is feasible.
3. Implement the narrow fix without rewriting unrelated code.
4. Run focused tests plus relevant TypeScript and lint checks.
5. Inspect the final diff and verify the real runtime surface when visuals or interaction changed.
6. Report the change, evidence, and open gates precisely.

Keep momentum proportional to uncertainty: investigate broadly only until the decision is clear, then execute narrowly and quickly. Reuse verified measurements, manifests, utilities, and prior lessons. Do not repeat searches, generations, full test suites, or approval questions without new evidence or a changed condition.

Prefer immutable state/domain updates, explicit errors, validated boundaries, stable IDs, and existing project patterns. Do not manufacture tests for trivial constants or raster pixels. The 80% coverage target applies to changed executable logic where coverage is meaningful.

Useful root commands:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run verify`
- `npm run doctor`

Choose checks based on risk. Run the broad release gate at the appropriate phase instead of repeatedly running it without new evidence.

## Native evidence

iOS Simulator at supported phone dimensions is the primary truth for changed mobile UI. Code review, TypeScript, snapshots, contact sheets, web previews, bundle checks, and successful compilation do not prove native visual or interaction acceptance.

Verify the real route and state from the current Metro-served checkout. Check relevant primary, loading, empty, error, disabled, offline, large-text, and Reduce Motion states. For avatar assets, verify Shop, Wardrobe, Room, MiniRoom, supported motion states, relevant combinations, scale, anchors, clipping, and transitions. Report unavailable physical-device and performance evidence as open.

## Git and delivery

Assume the worktree contains valuable unrelated work.

- Never use `git add .`, `git add -A`, broad restore, reset, clean, or checkout over unrelated files.
- Stage an explicit reviewed file allowlist.
- Before commit, inspect `git diff --cached --name-status`, `git diff --cached --check`, and the staged diff.
- Use conventional commits: `<type>: <description>`.
- Do not commit, push, open a PR, publish, deploy, merge, purchase, or modify third-party state without user authorization.
- Once authorized, complete and verify the action without requesting repeated confirmation.
- Keep Workbench files, credentials, caches, build output, generated evidence, and experimental assets out of commits.

An approved asset push contains only final runtime assets and the minimum integration and validation files required by the application. A clean commit does not imply a clean worktree.

## Status and completion

Use these labels accurately:

- **Implemented:** present in the current checkout.
- **Tested:** named automated checks passed.
- **Native verified:** inspected in the current Simulator or device flow.
- **User approved:** explicitly accepted by the user.
- **Production ready:** all required product, security, migration, native, performance, release, and external gates passed.
- **Blocked/Open:** named evidence is missing or a gate failed.

Never collapse these states. “Tested” is not visual approval; “pushed” is not a Store release.

## Guiding principle

- **ONE CHARACTER RIG**
- **ONE CANONICAL COSMETIC ID**
- **ONE WORLD MODEL**
- **MANY OUTFITS**
- **MANY ANIMATIONS**
- **MANY INTERACTIONS**

Make the existing Blumi chibi artwork feel alive inside a polished social application. Preserve the identity; replace the technical limits.
