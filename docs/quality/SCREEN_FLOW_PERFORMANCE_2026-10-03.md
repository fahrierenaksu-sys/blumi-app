# Screen flow performance — 2026-10-03

Checkout: `/Users/evrenevren/blumison`. Scope: Shop, Wardrobe, Discovery and Inbox/Chat. This report records implementation and executable evidence; it does not certify native frame rate or memory use.

## Scope and status

| Flow | Implemented behavior | Tested evidence | Native verified |
| --- | --- | --- | --- |
| Shop | Visited Avatar/Home category shelves survive switching, bounded to two recent categories per mode. Initial entry mounts the chosen shelf only. Current catalog/ownership inputs still flow into retained shelves. Repeated active selections do no work; rapid batched selections keep the final request. Hidden shelves cannot receive touches, accessibility focus, reselect events or purchase-flight registrations. | Combined focused run 70/70; latest derived suite 33/33 includes one additional prior-visit reveal regression (71 distinct checks across the runs, no combined 71-check rerun claimed). Scoped ESLint and mobile typecheck passed. | Open |
| Wardrobe | Visited category shelves and their pages survive return visits. Two initial pages are prepared while subsequent batches remain bounded. Hidden shelves stop interacting and announcing page changes. Current inventory and preview inputs remain live. Rapid selections keep the last request; stale fade completions cannot replace it. | Final retention/transition run 11/11; existing screen 22/22 and catalog model 8/8. Seven changed TS/TSX files passed scoped ESLint. Behavior regressions cover category retention, selection bursts, hidden callbacks and whole-page restoration. | Open |
| Discovery | Existing candidate/card inputs preserve identity when a later page appends. Unchanged cards are memoized. Blocked/seen/pending/quota filters remain current; candidate reuse and local filters reset across account/source changes. | Worker reported 227/227, no failures or skips; confirmed in `/tmp/blumi-discovery-performance-final.log` (150 + 5 + 72). | Open |
| Inbox/Chat | Hidden Inbox does no timestamp refresh on another page's foreground event. Focus updates timestamps immediately; cancelled generations cannot reschedule. Offline press-in prefetch failures are handled without delaying navigation. Selected chat history merges already-sorted recent/retained windows without reallocating and re-sorting the entire selected timeline twice. | Chat runner 456/456, no failures or skips, in `/tmp/blumi-chat-performance-tests-2026-10-03.log` (329 + 124 + 3). Latest focused Inbox/merge run 28/28 in `/tmp/blumi-chat-final-parity-tests-2026-10-03.log`. | Open |

Implemented and Tested are separate from Native verified, User approved and Production ready. No new visual approval or production-readiness claim follows from these checks. Physical-device FPS, native frame-time distribution, decoded-image/RAM footprint and low-memory behavior remain Open.

Existing Chat history caching, session isolation, first-six-conversation idle warmup and store snapshots were preserved. No additional native chat routes were retained. Cached presentation never becomes evidence of ownership, permissions or read receipts.

## Orchestration actually used

The conductor coordinated six delegated responsibilities with separate ownership:

1. Shop implementation and behavior checks.
2. Wardrobe implementation and behavior checks.
3. Discovery implementation and behavior checks.
4. Inbox/Chat implementation and behavior checks; this evidence report.
5. Independent adversarial review of correctness, stale callbacks and isolation.
6. Native validation and Metro/Simulator provenance checks.

No model selection claim is recorded. The native agent verified Simulator/Device Hub access and prepared isolated demo Metro on port 8083 without dotenv plus a Debug Simulator build under `/tmp/blumi-perf-simulator-build`; it did not complete the changed screen flows. The user subsequently deferred Simulator testing to their own later session. The task's Metro stopped with exit 0 and its build was interrupted with exit 143 (`BUILD INTERRUPTED`); other chats' Metro instances were preserved. Logs remain in `/tmp/blumi-perf-simulator-build`. Native verified remains Open/user planned; JS bundle preparation and interrupted native compilation do not pass that gate.

## Review findings and fixes

Independent review found and checked these additional failure modes:

- Interrupted Shop/Wardrobe horizontal paging could restore a fractional offset. Restored pages now round and clamp to available whole pages; callbacks from hidden shelves are guarded.
- Comparing a tap only with committed selection lost the final A in an A → B → A burst before React committed. Desired-selection refs and deferred-setter behavior tests cover both flows.
- A delayed Shop deep-link content-size callback after catalog shrink could use a previous offset. The native jump now derives from the clamped current page.
- A Shop page reveal pending from a previous visit could restore an old target after return. Page selection, reselect or a new native drag cancels that pending reveal; a lifecycle regression exercises hide/resume and each interrupt.
- Wardrobe fade completion and already-queued page announcements could outlive the current category. Generation checks and active-shelf refs prevent stale work.
- Hidden Inbox foreground events rebuilt all row time/accessibility labels. Focus/foreground gates and cancelled timer generations remove that work.
- Inbox press-in warmup dropped a rejecting promise. The handler catches the optional prefetch failure and navigation remains immediate.

The independent reviewer completed the final pass with no unresolved actionable findings: consolidated focused checks 83/83, followed by latest Shop lifecycle 3/3 plus manual-drag intent checks and Wardrobe category-array reuse 1/1 plus burst/current-entitlement checks. The reviewer inspected hidden interactions/accessibility, thumbnail registration, whole-page restoration, latest tap/deep-link intent, Discovery safety/quota/account scope and Chat chronology/ACK/dedup/focus/rejected-prefetch behavior. Targeted diff checks were clean. This does not prove that no future performance issue exists, and native observations remain Open.

## Chat parity and measurement limits

Permanent behavior regressions cover canonical equal-time ordering, local/ACK render aliases and duplicate pinned invitation last-record behavior. Existing hook tests cover disconnected cached ranges, paging, clock skew, pending-only history and account resets. An additional synthetic comparison matched the previous implementation in 100 scenarios with excluded/cached messages, local aliases, timestamp ties and duplicate invitations.

The synthetic Node benchmark used 5,000 cached messages, warmed functions and six alternating batches of 30 builds. Before the final empty-stream early returns, the expanded 1,000-row median was 9.74 → 6.23 ms; the initial 20-row median was noisy and increased from 3.19 → 4.11 ms. Results are in `/tmp/blumi-chat-window-benchmark-2026-10-03.json`. Host load varied substantially. The latest code has not been remeasured with that benchmark. Neither number is a Simulator/phone FPS result, and no measured first-entry gain is claimed.

## Reproduction and remaining gates

Run each independently from the checkout root; read its result before dependent work:

```sh
node apps/mobile/scripts/run-chat-tests.mjs
```

```sh
node apps/mobile/scripts/run-discovery-tests.mjs
```

```sh
npm --workspace @blumi/mobile run test:shop-preview-assets
```

```sh
node --import tsx --test apps/mobile/src/features/shop/screen/shopDerivedModels.test.ts apps/mobile/src/features/shop/screen/shopScreenModel.test.ts apps/mobile/src/features/shop/screen/useShopPurchaseActions.test.ts apps/mobile/src/screens/CosmeticShopScreen.test.mjs
```

```sh
npm --workspace @blumi/mobile run test:wardrobe
```

```sh
node apps/mobile/scripts/run-avatar-v2-tests.mjs
```

```sh
node --import tsx --test apps/mobile/src/features/avatarV2/wardrobe/wardrobeCatalogRetention.test.ts apps/mobile/src/features/avatarV2/wardrobe/wardrobeCatalogTransitionModel.test.ts
```

```sh
npm --workspace @blumi/mobile run typecheck
```

```sh
npm --workspace @blumi/mobile run lint
```

The conductor's final whole-tree mobile typecheck passed with exit 0 and no diagnostics against the latest source (`/tmp/blumi-screen-flow-final-typecheck.log`). Final whole-tree mobile lint also exited 0: zero errors and two duplicate-import warnings confined to concurrent `miniRoomSceneStore.ts` work. The earlier three-warning run additionally contained a hook warning subsequently fixed by that other owner; neither run is a warning-free whole-tree result. Final diff check passed. Existing package scripts were not changed; the Wardrobe regression belongs to the existing avatar runner.

The conductor confirmed these completed broad checks, each with exit 0 and no test failures/skips:

| Check | Result | Evidence |
| --- | --- | --- |
| Theme | 25/25 | `/tmp/blumi-screen-flow-theme.log` |
| Accessibility | 1/1 | `/tmp/blumi-screen-flow-accessibility.log` |
| Session | 489/489 (305 + 184) | `/tmp/blumi-screen-flow-session.log` |
| Navigation | 290/290 (174 + 116) | `/tmp/blumi-screen-flow-navigation.log` |
| Latest compiled worklet closures, after final source edits | 5/5 | `/tmp/blumi-screen-flow-final-worklets.log` |
| Latest published catalog + Shop derived + Wardrobe retention/transition | 51/51 | `/tmp/blumi-screen-flow-final-retention.log` |

For broad gate reproduction, use the existing `test:theme`, `test:accessibility`, `test:session` and `test:navigation` workspace commands separately. The final worklet/retention checks are supporting behavior and release-boundary evidence, not native rendering proof.

Native follow-up is user planned and is not requested now. Later checks against the verified served checkout:

| Flow | Manual check for the later user session |
| --- | --- |
| Shop | Alternate Avatar/Home rapidly 6–7 times; repeat the active tab; return to a previously scrolled category; check that the final tab, selected product and current owned/buy state agree. |
| Wardrobe | Alternate categories/sections rapidly; interrupt a horizontal swipe; return and confirm a whole page with matching dots, current equipped item and current lock state. |
| Discovery | Swipe through several cards and a next-page load; return to the flow; confirm no blank/duplicate cards and that blocks, quota and account changes still apply. |
| Inbox/Chat | Open a warmed conversation, return and reopen; scroll older history; background and resume on another page; try offline opening without an unexpected error or delayed navigation. |

Also inspect large text, Reduce Motion and loading/empty/error/offline states. Actual FPS and memory measurements remain Open until collected; this matrix itself is not evidence of a completed check.

## Changed-file boundary and rollback

Owned performance files:

- Shop: `apps/mobile/src/screens/CosmeticShopScreen.tsx`; `apps/mobile/src/features/shop/screen/ClosetBrowser.tsx`, `shopScreenStyles.ts`, `useShopCatalogProducts.ts`, `shopDerivedModels.test.ts`, new `shopRetainedShelfModel.ts`.
- Wardrobe: `apps/mobile/src/screens/WardrobeV2Screen.tsx`; `apps/mobile/src/features/avatarV2/wardrobe/WardrobeCatalogCard.tsx`, `WardrobeCatalogList.tsx`, `useWardrobeCategoryMotion.ts`, `wardrobeCatalogModel.ts`, `wardrobeCatalogTransitionModel.test.ts`, new `wardrobeCatalogRetention.test.ts`; its registration in `apps/mobile/scripts/run-avatar-v2-tests.mjs`.
- Discovery: `apps/mobile/src/features/demo/SwipeableDiscoverCard.tsx`; `apps/mobile/src/features/discovery/DiscoveryDeckView.tsx`, `discoveryCandidateModel.ts`, `screen/useDiscoveryDeck.ts`, `screen/useDiscoveryDeck.test.ts`, `screen/useDiscoveryFilters.ts`, `screen/useDiscoveryFilters.test.ts`.
- Inbox/Chat: `apps/mobile/src/screens/InboxScreen.tsx`, `InboxScreen.test.mjs`; `apps/mobile/src/features/inbox/useInboxClock.ts`, `useInboxClock.test.ts`; `apps/mobile/src/features/chat/thread/chatThreadOpeningModel.ts`, `chatThreadOpeningModel.test.ts`.
- Evidence: this report.

No runtime artwork bytes, asset resolver paths, semantic item IDs, published-item receipts or receipt-bound catalog records changed within this scope. Concurrent room-editor and MiniRoom changes belong to other work and are explicitly excluded from this report and its rollback boundary.

Rollback means reversing only these owned hunks and associated regression/runner registration after inspecting the current diff. Preserve all unrelated changes; do not use a broad reset, restore, clean or whole-file replacement. No commit, push, deployment, publication or release is reported by this document.

## Official guidance used

- [React Native: Optimizing FlatList Configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration): memoized rows and stable render callbacks avoid needless row work. Larger windows trade memory for fewer blank areas; larger batches can occupy JS and delay taps. Clipping can hide transformed/positioned content on iOS. These tradeoffs were treated separately from actual frame-rate evidence.
