---
name: blumi-character-asset-production
description: Produce, revise, review, or promote Blumi character bases, male or female hair, wardrobe, hands, shoes, animation, and 2.5D rigs. Use for visual fit, style continuity, pose coverage, runtime integration, or asset QA; do not use for ordinary non-avatar UI work.
---

# Blumi Character Asset Production

Deliver character assets that preserve Blumi's sweet chibi identity, fit the current canonical base, survive every supported pose, and enter the application only after explicit visual and native acceptance.

## Non-negotiable outcome

The head, neck, body, hair, clothes, hands, and shoes must read as one character drawn by one artist. Judge the equipped full character at native application scale; do not approve isolated transparent layers because they look attractive alone.

Keep the existing face, expression, proportions, softness, palette behavior, outline language, and chibi charm unless the user explicitly approves a redesign. Fix local discontinuities without drifting into a different character family.

## Storage boundary

Perform all production outside the application repository in:

`/Users/evrenevren/BlumiArtWorkbench/`

Create a dated and versioned directory for each task, for example:

```text
BlumiArtWorkbench/
  2026-09-08-male-hair-v2/
    brief/
    references/
    sources/
    candidates/
    evidence/
    rejected/
    approved-source/
    manifest.json
```

Keep prompts, references, editable masters, generation outputs, scripts, contact sheets, QA renders, discarded variants, and provenance there. Never make the application import from the Workbench.

Only copy these into the repository after acceptance:

- optimized final runtime assets;
- required catalog, resolver, and presentation wiring;
- runtime metadata actually consumed by the app;
- focused integration tests that protect identity and routing.

Deleting the Workbench must not break the application or Store build. Do not place production leftovers in the repository and rely on `.gitignore` as the primary separation method.

## Execution model

Use the current active Codex model for the complete workflow unless the user explicitly requests delegation. Do not block production on a named model, spawn extra reviewers by default, or imply that another model reviewed work when it did not.

Keep three explicit phases in the same task:

1. **Brief:** freeze base measurements, source hashes, product identity, method, gates, evidence, and stop conditions.
2. **Production:** execute only that brief in the Workbench and produce reproducible candidates and evidence.
3. **Quality review:** stop editing, compare the result against the frozen brief and real full-character evidence, and return `PASS`, `BLOCKED`, or `OPEN` with concrete reasons.

The same active model may perform all three phases, but it must report this honestly as an internal review. It cannot call that review independent. User approval and current native runtime verification remain separate promotion gates.

## One-current-brief rule

Exactly one versioned art-direction brief is active for a production task. Older briefs and reviews are history unless the current brief explicitly incorporates them.

The brief must state:

- task scope and excluded scope;
- canonical base asset paths, dimensions, anchors, and hashes;
- semantic product IDs and preserved design tokens;
- reference images and known rejected attempts;
- permitted edit regions and invariants;
- selected method and why it can pass every applicable gate;
- required deliverables and evidence;
- objective acceptance checks;
- stop condition and materially different fallback method.

Do not begin production from a screenshot when the canonical transparent base or layer exists. A screenshot may be visual feedback, not the source geometry.

## Preflight

Before generating or editing:

1. Inspect the active repository, installed runtime, real catalog entries, resolvers, motion sources, and current base.
2. Inspect `git status`; never overwrite unrelated work.
3. Locate prior manifests, user feedback, approved references, and rejected methods in the Workbench.
4. Hash the exact inputs and record product IDs, pose IDs, canvas, anchor, alpha bounds, and layer order.
5. Render the current full character in the affected real combinations to establish the baseline.
6. Define the smallest production unit that can be reviewed honestly.

Repository truth and the user's latest feedback override stale manifests. Never inherit approval after a source, base, resolver, or hash changes.

## Method selection

Choose the method that directly addresses the geometry and style problem with the fewest destructive transforms.

Act as a creative problem solver within the frozen identity and runtime constraints. Do not treat the current tool or technique as the solution by default. Generate a small set of genuinely different viable methods, eliminate any method without a direct path through the applicable quality gates, and select the strongest remaining option by expected fit, style fidelity, editability, reproducibility, speed, and runtime cleanliness.

- Generate or redraw against the canonical base when the silhouette, volume, or garment construction is wrong.
- Use a bounded local paint/edit when the underlying design is correct and only a small seam, color, alpha edge, or contact needs repair.
- Use an editable raster or vector master when repeatable pose derivatives are required.
- Use deterministic scripts for validation, packaging, hashes, and repeatable exports, not as a substitute for art judgment.
- Reuse an approved source across static motion only when the layer is intentionally rigid and its anchor remains correct.

Do not repeatedly crop, squeeze, warp, recolor, or patch a method family already rejected by review. At the first `BLOCKED`, stop production, preserve the evidence, and require a new brief with a materially different method. If no automated method can satisfy the gates, use `MANUAL_MASTER_REQUIRED` rather than producing more weak variants.

Once evidence identifies the best method, execute it decisively. Avoid parallel candidate floods and long chains of nearly identical revisions. Produce the smallest complete comparison that can expose failure, review it against the full character, then either promote the successful method across the bounded batch or stop and pivot.

## Visual, pose, and combination gates

Before writing the brief, producing a candidate, or reviewing it, read [references/quality-gates.md](references/quality-gates.md). Apply the sections relevant to the asset type and record every applicable critical gate in the evidence package. A single critical failure blocks promotion.

## Evidence package

Create hash-bound evidence for each candidate:

- input and output paths with SHA-256 hashes;
- tool/model identity and settings that are actually available;
- prompt or edit description;
- canonical base and product IDs;
- canvas, alpha bounds, anchors, and layer order;
- transparent layer preview;
- full equipped character on light and dark backgrounds;
- native-size view and focused contact crops;
- required pose/motion contact sheet;
- tested combinations and runtime resolver result;
- review status and the actual reviewing model or user;
- user approval status;
- open native, device, performance, or release gates.

Use structured status values: `CANDIDATE`, `BLOCKED`, `OPEN`, `INTERNAL_REVIEW_PASS`, `NATIVE_VERIFIED`, `USER_APPROVED`, and `PROMOTED`. Tests may support a status but cannot invent visual acceptance.

## Acceptance sequence

Use this order:

1. Current frozen production brief.
2. Bounded production output in the Workbench.
3. Separate internal quality review: `PASS`, `BLOCKED`, or `OPEN` with concrete evidence.
4. User-visible comparison or contact sheet and explicit user approval.
5. Copy only accepted optimized runtime files into the application.
6. Add minimal resolver/catalog/presentation wiring and meaningful tests.
7. Verify Shop and Wardrobe, then equipped Room and MiniRoom behavior in the current iOS Simulator build.
8. Verify motion, transitions, combinations, remote parity, and applicable performance.
9. Stage an exact allowlist; inspect the staged diff before any authorized commit or push.

Do not mark an asset production-ready because a file exists, a script passes, a board looks attractive, or a package was installed.

## Promotion and rollback

Preserve semantic IDs and user ownership. Prefer versioned runtime filenames and atomic resolver changes. Never mix a new base with an incompatible old garment set in a user-visible loadout.

Keep the prior accepted runtime version available until the replacement is verified. Promotion must be reversible by a narrow resolver/asset change. Candidate, evidence, generation, and rejected directories must not enter the production bundle.

Before an authorized asset commit or push:

1. List the exact files intended for delivery.
2. Confirm every runtime asset is actually referenced and every reference resolves.
3. Confirm no Workbench, candidate, QA-only, secret, cache, or editor-backup file is staged.
4. Run focused asset integration tests, TypeScript, lint, and the repository-required push gate.
5. Verify the remote commit after push.

## Required report

Finish with:

- what was produced and what changed in the application;
- exact internal review and user-approval status;
- native surfaces and poses verified;
- tests and commands that passed;
- files promoted versus files retained only in the Workbench;
- remaining `OPEN` or `BLOCKED` gates;
- commit and remote branch only if an authorized push occurred.
