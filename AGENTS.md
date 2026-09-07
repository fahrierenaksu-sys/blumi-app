# Blumi Engineering Instructions

## Repository Truth Comes First

Always inspect the actual repository before making technical assumptions.

Package versions, native configuration, existing contracts, tests, and repository code are the source of truth.

When framework or library behavior may have changed, use the official documentation matching the version actually installed in this repository.

Do not follow documentation for an older hardcoded version.

For Expo, React Native, React, Reanimated, Worklets, or other rapidly changing dependencies:

1. Read the installed version from the repository.
2. Consult the matching current official documentation.
3. Do not rely on outdated implementation patterns from previous framework versions.

---

## Product

Blumi is a React Native / Expo social application with a premium 2.5D chibi avatar and room experience.

The application shell remains React Native / Expo.

The room and avatar experience must feel naturally integrated into the Blumi application rather than behaving like a separate fullscreen game.

---

## Architecture Priorities

When engineering decisions conflict, use this priority order:

1. Preserve the recognizable Blumi chibi visual identity.
2. Preserve existing user inventory, purchases, rooms, and persisted data.
3. Preserve backend authority over ownership and economy.
4. Achieve premium avatar animation and room interaction quality.
5. Scale cleanly to hundreds of cosmetics and furniture items.
6. Maintain strong mobile performance.
7. Prefer incremental migration over destructive rewrites.
8. Reuse good existing domain logic.
9. Avoid unnecessary engine complexity.

---

## Avatar V3 Direction

The approved target direction is a premium rigged 2.5D avatar system.

Primary architecture:

* Spine Professional skeletal avatars
* 8 logical movement/facing directions
* approximately 5 authored canonical views where appropriate
* weighted mesh deformation for clothing where visually useful
* subtle secondary motion
* reusable skeletal animations
* explicit mirror-safety metadata

Do not continue expanding the legacy frame-by-frame PNG motion system as the long-term avatar architecture.

Do not redesign the Blumi chibi character merely to simplify implementation.

The existing Blumi character identity is the visual reference.

---

## Room V3 Direction

Preserve useful existing RoomWorld concepts such as:

* walkable geometry
* furniture footprints
* blockers
* seating metadata
* approach points
* exit points
* room persistence

Evolve them into RoomWorld V3 rather than rewriting them blindly.

Furniture interactions should become data-driven through reusable Interaction Rigs / Sockets.

Avoid hardcoded behavior tied to specific furniture IDs.

React Native Skia may be introduced incrementally where it provides measurable rendering or performance value, including:

* contact shadows
* masks
* foreground occlusion
* deterministic depth composition
* ambient effects
* texture atlases
* lightweight shader effects

Do not rewrite the entire renderer merely to adopt Skia.

---

## Cosmetic Identity

Blumi should converge toward one canonical cosmetic identity.

The same semantic cosmetic ID should flow through:

Shop
→ Purchase
→ Inventory
→ Wardrobe
→ Avatar
→ Room
→ MiniRoom
→ Remote Participant

Avoid creating separate long-term identities for the same cosmetic in different presentation systems.

Compatibility adapters may exist temporarily during migration.

---

## Backend Authority

The backend remains authoritative for:

* inventory
* purchases
* coins
* cosmetic ownership
* furniture ownership
* persisted avatar loadout
* persisted room state

Never trust visual state, realtime state, or client claims as proof of ownership.

---

## Migration

Never perform a big-bang rewrite without verified necessity.

Prefer:

legacy production
→ additive V3 contracts
→ compatibility adapters
→ feature-flagged V3
→ validated migration
→ legacy removal

Do not break existing stored rooms, inventories, or avatar loadouts.

Do not remove V2 until V3 passes its acceptance criteria.

---

## Performance

Do not drive skeletal animation through React state updates every frame.

Do not send per-frame animation or rendering data through the JavaScript/native bridge.

Prefer persistent runtime state, cached assets, stable references, worklets/UI-thread execution where appropriate, and minimal bridge traffic.

Preserve reduced-motion accessibility behavior.

Measure performance rather than guessing.

---

## Content Quality

Premium cosmetics must not silently ship with visibly incomplete motion or interaction coverage.

Build toward formal validation for:

* rig compatibility
* slot correctness
* required authored views
* mirror policy
* clipping
* seated appearance
* cosmetic compatibility
* remote avatar parity

Preserve and improve the existing promotion/quarantine approach.

---

## Agent Behavior

Inspect before assuming.

Prefer repository evidence over guesses.

When current external behavior matters, verify it using official primary documentation.

For routine implementation decisions, make reasonable assumptions and continue without repeatedly asking for confirmation.

Do not stop after every ordinary step to ask whether to continue.

Ask for clarification only when an unresolved decision could:

* materially change product behavior
* destroy or migrate user data
* introduce a significant external cost
* contradict a locked product requirement
* require an irreversible architectural choice

If existing repository guidance conflicts with actual installed versions or current repository architecture, identify the conflict explicitly and follow repository truth plus current official documentation.

Do not silently introduce Unity, Unreal, Filament, Cocos, Defold, Rive as the primary avatar runtime, or another standalone game engine without first demonstrating a verified blocker in the approved architecture.

---

## Testing

Run tests appropriate to the risk and scope of each change.

Prioritize meaningful coverage for:

* persistence compatibility
* migration
* ownership
* canonical cosmetic mapping
* furniture interaction transforms
* realtime avatar state
* asset validation

Do not create tests that merely duplicate trivial implementation details.

Do not claim completion while relevant typecheck, lint, build, or test failures caused by the change remain unexplained.

---

## Core Principle

Build toward:

ONE CHARACTER RIG
ONE CANONICAL COSMETIC ID
ONE WORLD MODEL
MANY OUTFITS
MANY ANIMATIONS
MANY INTERACTIONS

The result should feel like the existing Blumi chibi artwork came alive inside a premium 2.5D social world.

Preserve the product identity.

Replace the technical limitations.
