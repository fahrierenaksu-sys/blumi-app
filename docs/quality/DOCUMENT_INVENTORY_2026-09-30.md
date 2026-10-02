# Markdown document inventory — 2026-09-30

Historical record — not an instruction; see AGENTS.md.

Scope: every `*.md` file in the repository, excluding `node_modules`, `.git` and `.claude/worktrees`. Checked on the integration branch `claude/busy-cray-dl5wvr` (merged into the audit worktree) under Node 22.22.2. This is an inventory and verification record; it changes no document. Findings are listed as a checklist at the end. Historical reports are not rewritten.

Method: a script resolved every relative Markdown link, extracted every `npm run X` / `npm --workspace W run X` occurrence and looked the script up in the matching `package.json`, and resolved every backticked repository path. Version claims were compared by hand against `apps/mobile/package.json` and the root `package.json` / `.nvmrc`. Contradictions were found by reading the status statements of each document.

Reference versions (current code): Expo `~57.0.26`, React Native `0.86.3`, React `19.2.3`, Reanimated `4.5.1`, Worklets `0.10.1`, Node `22.22.2` (`.nvmrc`; root `engines` `>=22.22.2 <23`).

## Summary

- 17 Markdown files. By primary class: active instruction 6, user guide 4, status report 4, historical record 1, draft 2, architecture decision 0. Dual-class files (README, DATABASE_RELEASE_RUNBOOK, railway-supabase-launch) are counted under their first-listed class in the table.
- Broken relative links: 0. Missing npm scripts: 0 (one false positive, see V-2). Version mismatches: 0. Contradictions: 4 (C-1 to C-4). Other stale or unresolved references: 5 (C-5, S-1 to S-4).

## Inventory

Class values: AI = active instruction, UG = user guide, AD = architecture decision, SR = status report, HR = historical record, DR = draft. Audience: agent, owner, or both.

| # | Path | Lines | Stated date | Class | Audience | Verification |
|---|---|---|---|---|---|---|
| 1 | `AGENTS.md` | 184 | 2026-09-30 (status bullets) | AI | agent | Links OK. Commands OK. Versions match (SDK 57, RN 0.86, React 19, Reanimated 4). Referenced paths exist. See C-4 (verify description differs from README). |
| 2 | `CLAUDE.md` | 1 | none | AI | agent | One line importing `AGENTS.md`; target exists. |
| 3 | `README.md` | 193 | Current as of 2026-09-30 | UG (+ SR in Release status section) | owner | Links OK. Commands OK (V-2). Versions: SDK 57 and Node 22.22.2 match. Contradiction C-1 at line 191. See C-4. |
| 4 | `apps/mobile/README.md` | 26 | none | UG | both | Links OK (`metro.config.js` exists). Commands OK (`dev:mobile`, `start`, `ios`). SDK 57 and RN 0.86 match. |
| 5 | `apps/server/README.md` | 26 | none | UG | both | No links or npm commands. Mentions `dev:server`, `db/migrations` (exists). Ports 4000/4100 not re-verified here. |
| 6 | `docs/quality/CLEANUP_MANIFEST_2026-09-29.md` | 229 | 2026-09-29 | SR (evidence, action pending) | both | Links OK. Machine list `cleanup-manifest-2026-09-29.json` exists. `archive-verification-2026-09-29.json` (lines 208, 212) does not exist yet by design (owner Mac run). Source-relative paths in lines 74-137 resolve under `apps/mobile/src`. |
| 7 | `docs/quality/ENGINEERING_AUDIT_2026-09-28.md` | 429 | 2026-09-28 | HR (marked historical, line 1) | both | Links OK. Node 22.22.2, Expo 57, RN 0.86 match. `scripts/room-vnext-pilot/` (line 329) no longer exists. Expo Doctor 20/21 then 21/21 is sequential history, not a conflict. |
| 8 | `docs/quality/ENGINEERING_AUDIT_2026-09-30.md` | 159 | 2026-09-30 | SR (current evidence log) | both | Links OK. Node 22.22.2 matches. Referenced source files exist (paths under `apps/mobile/` / `src/`). `apps/mobile/ios/Blumi.xcodeproj` is generated and ignored by design. |
| 9 | `docs/release/APP_STORE_LISTING_DRAFT.md` | 42 | none (status: NOT SUBMITTED) | DR | owner | No links or commands. Undated draft. |
| 10 | `docs/release/APP_STORE_PRIVACY_DRAFT.md` | 51 | 2026-09-28 | DR | owner | Links OK. Path `apps/mobile/ios/Blumi/PrivacyInfo.xcprivacy` (line 50) is generated and untracked, consistent with its own text. |
| 11 | `docs/release/APP_STORE_SUBMISSION_GATE.md` | 57 | 2026-09-28 | SR (checklist, BLOCKED) | owner | Links OK. Node 22.22.2 matches. |
| 12 | `docs/release/DATABASE_RELEASE_RUNBOOK.md` | 120 | 2026-09-28 | AI (runbook; evidence section is SR) | both | Links OK. Latest migration 066/067 in `apps/server/db/migrations` (67 files). Evidence (18 accounts, 65 checksums) matches LAUNCH_CONTROL, disagrees with C-2. |
| 13 | `docs/release/LAUNCH_CONTROL.md` | 156 | Snapshot 2026-09-28; one row 2026-09-30 | SR (owner status snapshot) | owner | Links OK. `ops:center` exists. Node 22.22.2 matches. Contradictions C-2, C-3. Mixed English and Turkish. |
| 14 | `docs/release/RELEASE_CAPTAIN_WORKFLOW.md` | 56 | none | AI (owner/agent workflow) | both | Links OK. Node 22.22.2 matches `.nvmrc`. Line 7 hard-codes `/Users/evrenevren/blumi-sdk54` (C-5). Turkish. |
| 15 | `docs/release/railway-supabase-launch.md` | 140 | 2026-09-27 | UG (deployment guide) + SR (evidence) | both | Links OK. Node 22 matches. Expo Doctor 21/21 matches. Contradiction C-2 (lines 22, 65-66, 133-135). |
| 16 | `.agents/skills/blumi-character-asset-production/SKILL.md` | 171 | none (`2026-09-08-male-hair-v2/` is a folder-name example) | AI | agent | No links to check beyond `references/`, which exists. No npm commands. |
| 17 | `.agents/skills/blumi-character-asset-production/references/quality-gates.md` | 68 | none | AI | agent | No links or commands. |

## Verification results

### Relative links

All relative links in all 17 files resolve. Broken links: 0.

### Commands

Every `npm run X` and `npm --workspace W run X` resolves to an existing script. Missing: 0.

- V-2 (false positive): `README.md:166` shows `SENTRY_DISABLE_AUTO_UPLOAD=true npm run ios` after `cd apps/mobile`. There is no root `ios` script, but `apps/mobile/package.json:13` defines `ios`. The command is correct because of the `cd`.

### Version claims

| Claim | Where | Actual | Result |
|---|---|---|---|
| Expo SDK 57 | AGENTS.md:55, README.md:6/80, apps/mobile/README.md:3/23, audit 09-28:7 | `expo ~57.0.26` | match |
| React Native 0.86 | AGENTS.md:55, apps/mobile/README.md:3/24, audit 09-28:7 | `0.86.3` | match |
| React 19, Reanimated 4 | AGENTS.md:55 | `19.2.3`, `4.5.1` | match |
| Node 22.22.2 | README.md:113, RELEASE_CAPTAIN_WORKFLOW.md:12, SUBMISSION_GATE:12, audits, LAUNCH_CONTROL:57/95 | `.nvmrc` 22.22.2, `engines` `>=22.22.2 <23` | match |
| "Node 20.20.1 login shell default" | LAUNCH_CONTROL.md:95 | machine-local, dated 2026-09-27 | not verifiable, historical |
| Expo Doctor 21/21 | README.md:189, railway-supabase-launch.md:104, audit 09-30:100 | AGENTS/verify pipeline includes doctor | consistent with the latest run |

Version mismatches: 0. (AGENTS.md:47 tells agents not to infer SDK from the `blumi-sdk54` folder name; that is consistent with SDK 57.)

### Contradictions

- C-1 README vs LAUNCH_CONTROL, migration state of the Supabase test database.
  - `README.md:191`: "The protected Supabase database was inspected read-only; migrations 062–063 were not applied to it."
  - `docs/release/LAUNCH_CONTROL.md:7`: "Its 65 applied migration checksums match source, but new integrity migration 066 is not live." and `:17`: "Missing migrations 062/063/064 were then tested on that restored copy and applied to the existing test project".
- C-2 Older release guides vs LAUNCH_CONTROL and runbook, account and migration counts.
  - `docs/release/railway-supabase-launch.md:22`: "17 accounts and 61/63 migrations as of 2026-09-27"; `:133-135`: "17 accounts, 61 migrations; 062/063 have not been applied there".
  - `docs/release/LAUNCH_CONTROL.md:89`: "17 accounts and 61/63 migrations, with migrations 062/063 not applied".
  - Versus `docs/release/LAUNCH_CONTROL.md:7` and `docs/release/DATABASE_RELEASE_RUNBOOK.md:9-13`: 18 accounts, 65 applied migrations, 066 not applied.
  - The 2026-09-27 figures are dated, but `README.md:191` and `LAUNCH_CONTROL.md:89` present them without a date as current.
- C-3 LAUNCH_CONTROL internal, snapshot date and git state.
  - `docs/release/LAUNCH_CONTROL.md:5`: "Snapshot: 2026-09-28", while `:66` carries a 2026-09-30 update and `:65` still says "Checkout `main` dalında ... `167a566c`, `origin/main` ile aynı commit".
  - Versus `README.md:189` and `docs/quality/ENGINEERING_AUDIT_2026-09-30.md:13`: the current work is on `claude/busy-cray-dl5wvr`, not merged to `main`.
- C-4 Description of what `npm run verify` runs.
  - `AGENTS.md:116` lists source hygiene, operations center, workbench tools, audit policy, release infrastructure, package build, typecheck, lint, tests, PostgreSQL gate, release audit, Expo Doctor.
  - `README.md:177` omits operations center, workbench tools, audit policy and release infrastructure. Low severity (README is less complete, not wrong).

### Other stale or unresolved references

- C-5 `docs/release/RELEASE_CAPTAIN_WORKFLOW.md:7` hard-codes the checkout path `/Users/evrenevren/blumi-sdk54`; `AGENTS.md:47` says not to rely on the directory name, and the audit worktrees live elsewhere.
- S-1 `docs/quality/ENGINEERING_AUDIT_2026-09-28.md:329` references `scripts/room-vnext-pilot/`, which does not exist under `apps/mobile/scripts/`. Historical record; leave as is.
- S-2 `docs/quality/CLEANUP_MANIFEST_2026-09-29.md:208,212` reference `docs/quality/archive-verification-2026-09-29.json`; it is a planned artifact of the owner's Mac run and is not yet committed. Expected, but track.
- S-3 `docs/quality/ENGINEERING_AUDIT_2026-09-30.md` coverage row "2, 3" lists the Markdown inventory as in progress; this document delivers it, so the row can be updated to Done.
- S-4 `docs/release/APP_STORE_LISTING_DRAFT.md` has no date, so its freshness against LAUNCH_CONTROL cannot be judged.

## Primary source per topic

| Topic | Primary source |
|---|---|
| Agent rules and product invariants | `AGENTS.md` (`CLAUDE.md` only imports it) |
| Character, hair, wardrobe, rig assets | `.agents/skills/blumi-character-asset-production/SKILL.md` (+ `references/quality-gates.md`) |
| Release readiness and gate status | `docs/release/LAUNCH_CONTROL.md` |
| Release workflow for agents and owner | `docs/release/RELEASE_CAPTAIN_WORKFLOW.md` |
| Staging and production deployment | `docs/release/railway-supabase-launch.md` and `.railway/railway.ts` |
| Database release and migration evidence | `docs/release/DATABASE_RELEASE_RUNBOOK.md` |
| App Store submission proofs | `docs/release/APP_STORE_SUBMISSION_GATE.md` (drafts: listing, privacy) |
| Current engineering audit and evidence log | `docs/quality/ENGINEERING_AUDIT_2026-09-30.md` |
| Previous audit (history only) | `docs/quality/ENGINEERING_AUDIT_2026-09-28.md` |
| Cleanup and archive process | `docs/quality/CLEANUP_MANIFEST_2026-09-29.md` (+ `.json`) |
| Document inventory | this file |
| Local setup and commands | `README.md`; per-package detail in `apps/mobile/README.md`, `apps/server/README.md` |
| Runtime versions | `apps/mobile/package.json`, `package.json`, `.nvmrc` (not prose) |

## Automated gates run

- `npm ci --no-audit --no-fund`: completed.
- `npm run verify:operations-center`: pass (3/3).
- `npm run verify:source-hygiene`: pass (8/8).

## Fix checklist (applied in the docs-resolution commit; S-2 tracking and no-action items remain)

- [x] `README.md:191`: replace "migrations 062–063 were not applied to it" with the dated state from `LAUNCH_CONTROL.md:7` (test project: 65 checksums match, 066/067 not live, 18 accounts on 2026-09-28) or link to it without restating counts. (C-1)
- [x] `docs/release/LAUNCH_CONTROL.md:89`: mark the "17 accounts and 61/63 migrations" sentence as superseded by line 7 and the runbook, or update it to 18 accounts / 65 migrations. (C-2)
- [x] `docs/release/railway-supabase-launch.md:22-23`: add "(superseded 2026-09-28: 18 accounts, 65 migrations, see DATABASE_RELEASE_RUNBOOK.md)". (C-2)
- [x] `docs/release/railway-supabase-launch.md:65-66`: state that 062/063 have since been applied to the test project, and keep the 61-migration case as the generic starting point for other databases. (C-2)
- [x] `docs/release/railway-supabase-launch.md:133-135`: add the same dated supersession note. (C-2)
- [x] `docs/release/LAUNCH_CONTROL.md:5`: update the snapshot line to say the document mixes 2026-09-28 and 2026-09-30 rows, or refresh the date once the rows are reviewed. (C-3)
- [x] `docs/release/LAUNCH_CONTROL.md:65`: update the "Git yayın adayı" row (branch `claude/busy-cray-dl5wvr`, not `main` / `167a566c`) or mark it as a 2026-09-28 observation. (C-3)
- [x] `README.md:177`: align the verify description with `AGENTS.md:116` (add operations center, workbench tools, audit policy, release infrastructure) or point to `AGENTS.md`. (C-4)
- [x] `docs/release/RELEASE_CAPTAIN_WORKFLOW.md:7`: replace the hard-coded `/Users/evrenevren/blumi-sdk54` with "the active checkout (verify `pwd`, `git status --short`, branch)". (C-5)
- [x] `docs/quality/ENGINEERING_AUDIT_2026-09-30.md`, coverage row "2, 3": change Status to Done after this inventory is merged and the checklist is applied. (S-3)
- [x] `docs/release/APP_STORE_LISTING_DRAFT.md:3`: add a preparation date to the Status line. (S-4)
- [ ] Track: commit `docs/quality/archive-verification-2026-09-29.json` from the owner's Mac run before any deletion. (S-2)
- [ ] No action: `ENGINEERING_AUDIT_2026-09-28.md:329` (S-1) is historical; `README.md:166` (V-2) is correct.
