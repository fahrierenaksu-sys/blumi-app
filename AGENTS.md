# Blumi

## How to work

The owner trusts your judgement and wants your best work, not cautious work. Act as the lead engineer and product designer: find and build the best current architecture, technology, design and workflow for the owner's goals, including root-level rewrites when they are worth it. Choose your own process, tools, tests and subagents.

The avatar and home (room) system is explicitly open. Its renderer, rig, animation, room model, interaction design and tooling may be redesigned or replaced (Skia, Spine, Rive, 3D, a new runtime, or something better) if the result is better. One exception: the room's fixed camera angle and shell geometry are the owner's chosen direction (see Facts); build on them instead of replacing them. Prototype on a branch or behind a flag and bring bold proposals with trade-offs, costs and a migration path; ideas and builds need no permission. The owner is needed only at ship time: for a visible change to the characters' drawn look, and for new receipts when a published item's runtime files change.

Only the **Strict** sections are hard limits. Everything else here is information you could not find on your own.

## Product

Blumi is an Expo / React Native social app built around sweet 2.5D chibi avatars and their rooms.

- Loop: mutual match → text chat → optional room invitation sent from the chat → shared room (MiniRoom) with durable text chat.
- The first release is text-only. There is no voice infrastructure, and voice is off in code (the server refuses `BLUMI_VOICE_ENABLED=1`; `useMiniRoomMedia` returns `voiceAvailable: false`), and the deployed environment sets `BLUMI_PAYMENTS_ENABLED=0`.
- `apps/mobile/app.config.js` refuses to build if camera, audio, WebRTC or LiveKit packages are installed (`scripts/mobile-no-media.cjs`). Profile photos, photo sharing, GIFs, video, calls, voice messages and any app sound (room music, footsteps) are out of scope. Do not propose them.
- The owner approved the characters' drawn look (face, proportions, outline, palette). How they are rendered, rigged, animated and placed in rooms is yours to improve.

## Strict: never lose work

- Never delete, rewrite or force-push commits that exist anywhere but your own unpushed branch. That means no `push --force`, no amend or rebase of pushed commits, and no deleting other people's branches. Fix mistakes with new commits.
- Never discard work you did not create. Run `git status` first, because the tree may hold the owner's or another agent's changes. No `git reset --hard`, `git clean`, `git checkout -- .`, `git restore .` or `git stash drop` over them.
- Stage an explicit file list, never `git add .` or `-A` (`.claude/worktrees/` is ignored only by a local exclude). Read `git diff --cached` before you commit.
- Resolve merge conflicts hunk by hunk, with a three-way view.
  - Never take a whole file from one side (`--ours`, `--theirs`, `git checkout <branch> -- <file>`).
  - Never let a merge or a "restore" delete files the other side added. Check who added them with `git log --diff-filter=A -- <path>`.
  - Afterwards, diff the result against both parents and run typecheck plus the affected tests before you commit the merge.
- Run `git fetch` before comparing branches, judging what is merged or picking a base, because local refs go stale. Base new branches and agent worktrees on a freshly fetched `origin/develop` and confirm it (`git merge-base --is-ancestor origin/develop HEAD`). Worktrees have silently started from `main` before.
- Commit finished work early and often, without asking, especially before long background jobs or when you are low on budget, because the cloud container restarts and kills them.
- Push only when the owner says so in the current conversation ("push at"), to any branch, `develop` and your own work branch included. If unpushed work is at risk, say so and ask.

## Strict: production, money and data

Get an explicit yes from the owner in the current conversation before any of these:

- pushing or merging to `main` (the release branch; CI and Railway build from it, and TestFlight builds from it when started by hand);
- a Railway deploy, redeploy or variable change, an EAS build or submit, a TestFlight upload, an OTA publish or an App Store submission;
- `npm run db:migrate` or any SQL write or DDL against a real database (`.env.local` can point at production);
- buying anything (plans, or licences such as Spine Pro) or changing third-party account state;
- shipping a visible change to the characters' drawn look. Show visuals first.

These rules protect the data:

- One live backend and one database exist: Railway environment `production` (service `blumi-app`, test traffic, `NODE_ENV=production`, `BLUMI_DEPLOY_ENV=staging`) on Supabase Free (PostgreSQL 17, no PITR, no staging database).
  - Live Railway variables are set in the dashboard. `.railway/railway.ts` (service `blumi-api`, staging and production) is not applied and does not match the live service, so never apply it without reconciling first.
  - The server refuses to start under `NODE_ENV=production` unless `BLUMI_TRUST_PROXY` is set (`100.64.0.0/10` on Railway).
  - Simulator and QA sessions hit this database. Run locally with `BLUMI_AUTH_REPOSITORY=memory`. Against the live database use the owner's existing test accounts, and never seed, bulk-create or delete data there.
- Before a schema change on it, take a PostgreSQL 17 dump and prove it restores. Migrations are additive and backward compatible. Migrate first, then deploy, unless the migration is listed in `OPTIONAL_READINESS_MIGRATIONS`. The procedure is in `docs/release/DATABASE_RELEASE_RUNBOOK.md`.
- Applied migrations in `apps/server/db/migrations` are immutable because their checksums gate `/ready`. Never edit, rename or renumber them. Two files share prefix `032` and there is no `044`. A new migration takes the number after the highest existing file (`071` next). Never fill the `044` gap or reuse a prefix.
- Preserve user data and stable IDs.
  - Each cosmetic or furniture item keeps one canonical ID through Shop → Purchase → Inventory → Wardrobe → Avatar → Room → MiniRoom → remote participant.
  - Never rename, reuse or fork an ID or entitlement when art or runtime changes. Hide an item with `RETIRED_AVATAR_ITEM_IDS` instead of deleting it.
  - A new avatar or room system must migrate existing inventories, rooms and loadouts without loss.

## Strict: security and privacy

- The server alone decides coins, purchases, inventory, ownership, loadouts, room state and access. Client, cache, realtime or visual state never proves ownership.
- Secrets live only in environment variables. Never print secret values, read them into output, or commit them, `.env*` files or credentials.
- Keep phone numbers, tokens, message bodies and user or room IDs out of logs, analytics, crash reports, notifications, error responses, docs, commits, test fixtures, snapshots and chat replies. Use counts or redacted values.
- Admin and operator tools use an identity separate from app accounts, least privilege, short-lived access and an audit log, and start read-only.
- Never claim an approval the owner did not give. Paid shop items become publishable only through owner-approved receipts in `packages/domain/src/release/blumiR1ReleaseCatalog.json`. Never add or reissue a receipt without the owner.

## Strict: conventions

- Use conventional commits (`<type>: <description>`), one purpose per commit, ending with the attribution footer your harness supplies.
- `apps/mobile/package.json` scripts are part of the native fingerprint (`runtimeVersion.policy: fingerprint`), so editing one blocks OTA updates until a new native build exists. Put a new mobile test in an existing `apps/mobile/scripts/run-*.mjs` runner (its group need not match; add the file to the runner's tsc list where it has one). Change the scripts, including the inline test groups, only together with a planned native build.
- Never delete, skip or weaken a test, or grow a ratchet allowlist, just to get a green gate. If an exception is really justified, change the allowlist in the same commit and give the reason.
  - Tests guard the strict rules (security, privacy, money, user data, release safety) and bugs that keep coming back; everything else is tested by behaviour. Do not add tests that pin implementation text, copy, pixels or counts; a rule that must hold everywhere becomes one tree-wide guard. Older source-text tests that remain pin today's code, not requirements: when you replace that code, replace them in the same commit with behaviour tests that keep their intent. That is not weakening a test. See `docs/quality/ENGINEERING_RULES.md`.
- The owner is non-technical and writes in Turkish. Reply in Turkish, in plain words. When the owner has to run something, give one command, wait for its output, then give the next. Never combine a check with a write that depends on its result.
- Report status honestly with these labels: Implemented, Tested, Native verified, User approved, Production ready, Open. The release ledger also uses External verified, Blocked and Waiting on user. Passing tests are not native verification, and a push is not a release.

## Facts you cannot infer

Branches and release:

- `develop` is the integration branch that every agent merges into, and `main` is the release branch.
  - CI (`verify.yml`) runs on pushes to `main` and on PRs.
  - Railway builds the API from `main` but has not reliably auto-deployed, so check which commit is actually live.
  - TestFlight (`apps/mobile/.eas/workflows/testflight.yml`) starts by hand only.
- Codex works on the owner's Mac (`codex/*` branches; it has the iOS Simulator and the art Workbench). Claude works in a Linux cloud container (`claude/*` and `worktree-*` branches) with no Simulator. Native visual checks happen on the Mac or the owner's phone. Until then, report them as Open.
- Develop OTA updates are manual only. EAS Update accepts at most 1,000 assets; the iOS bundle has 888 since room motion frames that no receipt binds were packed into atlases (`apps/mobile/scripts/build-room-motion-atlases.mjs`, run it after adding room motion art). A new native module (for example Skia) needs a new TestFlight build. See `docs/release/OTA_AND_TESTFLIGHT.md`.
- Status and backlog: `docs/release/LAUNCH_CONTROL.md` is the release ledger, and the operations-center gate parses its table, so keep the column layout. `docs/quality/SESSION_INVENTORY_2026-10-01.md` is the newest full backlog. Dated docs are snapshots, and current code wins.

Avatar and room (current state, not a mandate):

- The production avatar is `avatarV2`: layered PNGs with the fit baked in, drawn on every surface by one renderer, `RoomAvatarRenderer2D`. Room code lives in `roomWorld`, `roomV2`, `roomStudio` and `miniRoom`. `lobby` is the retired public lobby.
- The room's fixed camera angle and shell geometry (`room_v2_shell_blumi_world_v1`, 1254×714, `roomV3ShellProductionContract.ts`) are the owner's chosen look, but they do not fully work yet: furniture placement, avatar depth and movement inside that angle. Develop the room system specifically for this angle.
- No Skia, Spine, GL or 3D dependency is installed, and nothing forbids one. Adding a dependency, native or not, is your call. Only the EAS/TestFlight build that ships a native one, or a paid licence, needs the owner's yes.
- Prior research is input, not a decision. `docs/quality/ROOM_AVATAR_VISUAL_DIRECTION_2026-10-01.md` measured why room motion feels artificial. Its backlog items are VIS-01..13 in the session inventory.
- Art sources, masters and QA renders live outside the repo in the Workbench, `/Users/evrenevren/BlumiArtWorkbench/`, on the owner's Mac. The cloud container has only a stub.
  - EAS and the cloud have no Workbench, so an app import from it breaks the build. Only runtime files the app actually uses go into the repo.
- Preview and production builds fail on any import from a `*candidate/` path (`scripts/mobile-release-assets.cjs`), and quarantined item IDs are filtered out of the room catalog. Published shop items are hash-locked: `shopReleaseCatalog.test.ts` fails if their runtime bytes or `docs/quality/SHOP_CATALOG_PUBLICATION_2026-09-30.md` change.

Engineering guards that fail tests are listed in `docs/quality/ENGINEERING_RULES.md`. Read it before a large mobile change so a ratchet doesn't surprise you.

## Commands

Scripts are in the root and workspace `package.json` files, and `npm run verify` is the full release gate. The PostgreSQL gate (`verify:postgres`) builds a throwaway cluster, never uses `DATABASE_URL`, and refuses to run `initdb` as root.

## Skills

Project skills go in `.agents/skills/<name>/SKILL.md`, which Codex reads. Claude Code discovers only `.claude/skills/<name>/`, so expose each skill there too, with a symlink or a copy. Keep every skill under 150 lines and add one only for a repeated, project-specific workflow.

## Keeping this file useful

Keep this file under 150 lines. Add an instruction only if the model cannot know it or keeps repeating the same mistake without it, and delete instructions that stop being true.
