# Chat and main-tab transition performance

Snapshot: 2026-10-03

Scope: swiping into and out of Inbox, opening a conversation, and entering My Room. Work starts from fetched `origin/develop` at `5acf7d55` on `codex/chat-transition-performance`. This is a local implementation and evidence record, not a release approval.

## Observed problem

The supplied 34-second recording shows the JS overlay falling to approximately 8 FPS around the second conversation opening and approximately 39 FPS in a conversation with room invitation cards. The visible memory reading rises from approximately 0.82 GB to 1.14 GB, then falls. These observations identify stressful flows; they do not establish a memory leak or isolate a single cause. No personal conversation content is copied into this report.

## Changes and reasons

- Inbox subscribes to its thread list, load state, and unread counts instead of every chat-store notification. History prefetch, send state, and unrelated receipts no longer redraw its rows.
- Semantically unchanged server thread/message/receipt replies preserve record and array identities. Changed content, participants, read state, and account resets still invalidate the relevant views.
- Cold message history is published as soon as its request finishes. Invitation history continues independently, with session/request guards and deduplication intact.
- Optional Inbox history warming runs in cancellable idle batches after the first visible frames. Pressing a row still warms that conversation immediately; blur/background/unmount cancel queued work.
- Main-tab warming and screen module preloading pause while a detail screen is open. Module evaluation runs one screen per idle slot and checks the existing pager movement signal before starting. A synchronous evaluation already underway cannot be interrupted.
- The bottom bar keeps one React identity across tab selections instead of remounting its animations and badges.
- My Room ownership input arrays have stable content keys. Unchanged decoration no longer creates a local edit, reconstructs the visible scene, or restarts storage work. Removing actual ownership still removes inaccessible placements. External decoration input is copied at publication.
- Chat's first list batch accounts for the minimum height of invitation scenes, rather than treating each as a short message. The subsequent list window and render batches are bounded to reduce retained native rows and uninterrupted JS work. Short text conversations retain viewport coverage. Native fast-scroll/large-text coverage remains part of verification.

Gesture worklets, spring curves, character artwork, cosmetic IDs, assets, release receipts, and backend ownership decisions are unchanged. The native keyboard implementation is not replaced or disabled.

## Evidence

Implementation and lifecycle regression tests execute production modules through the repository's hook harness. This harness verifies subscriptions, referential stability, cancellation, ownership, and event behaviour; it does not prove concurrent rendering, native paint timing, or device FPS.

Measured hook/store regressions with synthetic data:

| Scenario | Before | After |
| --- | --- | --- |
| Six history replies with no visible Inbox change | Six additional Inbox renders | Zero additional Inbox renders |
| Identical 100-message reply | Zero message objects retained | All 100 objects, array and selected-thread snapshot retained |
| Identical thread-list reply | Selected-thread snapshot replaced | Selected-thread snapshot retained |

Initial-pass validation on Node 22.23.3 (the follow-up results below supersede the chat total):

- Chat runner: 289 compiled tests and 57 hook tests passed (346 total).
- Navigation runner: 174 compiled/guard tests and 90 hook tests passed.
- Room persistence runner: 25 compiled and 27 hook tests passed; the final strengthened provider lifecycle file passed 24/24, including the added ownership/copy regression.
- Layout tests: 96/96 passed. Theme, import, engineering, and worklet guards: 25/25 passed.
- Mobile TypeScript: passed. Full mobile lint: zero errors; three existing warnings in unchanged MiniRoom files remain.
- Independent adversarial review: no actionable P1/P2 finding; 55 hook/pager regressions and the final 34 coordinator tests passed independently.
- Final diff whitespace check: passed. Mobile package scripts, dependencies, native fingerprint configuration and runtime image bytes are unchanged.

The conductor handled video examination, scope, integration, list batching, final review and checks. Three bounded agents implemented chat, navigation and room fixes; another agent independently reviewed the diff. No character-production skill or art authoring was performed because this patch changes consumers, scheduling and store/persistence invalidation, not character assets or their renderer.

## Native and release limits

The initially installed Simulator binary lacked the current `react-native-keyboard-controller` module and failed before the requested routes. Local Debug native builds succeeded, including the normal signing build, and the updated binary was installed. This confirms compilation, not route behaviour or smoothness.

The owner explicitly took over native inspection during this task. Requested-route FPS, fast-scroll fill rate, large-text, keyboard and Reduce Motion verification remain Open; no native performance result is inferred. The temporary local-only Metro configuration used during setup was replaced with the project's ordinary `npm run dev:mobile` configuration for the owner's inspection. No live database or external account changes were made by this task.

Release-device FPS, long-session texture/memory behaviour, and production loading latency require their own measurements. React Native documents that development mode has significant JS overhead: [Performance Overview](https://reactnative.dev/docs/performance). List batch/window sizing also trades responsiveness and memory against fill rate: [Optimizing FlatList Configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration).

## Rollback and status

All changes are reviewable against `5acf7d55`. No commit, push, merge, deployment, EAS build, OTA update, or published-asset change has been performed. Rollback is a narrow revert of these source/test changes; persisted inventories, loadouts, and rooms retain their existing schema and IDs.

- Implemented: source changes present locally.
- Tested: the checks above passed, with the existing lint warnings recorded.
- Native verified: Open; owner is inspecting the requested flows.
- User approved: no acceptance of measured performance has been inferred.
- Production ready: Open.

## Earlier follow-up: bounded opening history and instant delivery

The owner reported that conversation entry still produced a large JS drop and asked to load fewer old messages on entry. Native observation remains with the owner. This earlier message-history stage changed only client behaviour and tests. Its 403-test total and invitation API limitation are superseded by the bounded-invitation stage below.

- Default production first-page requests now ask for the newest 20 messages instead of accepting the server's default 50. Explicit custom limits and older-page cursors retain their contracts. Older pages use the displayed, confirmed server boundary and the shared 20-message limit.
- Long cached conversations construct an initial combined window of 20 messages/invitation rows before grouping and date formatting. A 200-message actual-store regression confirms that only the latest 20 enter the opening timeline, while all 200 remain cached. Failed/pending local rows remain reachable; new arrivals grow the open window so that reading history does not lose its oldest visible row.
- An authoritative latest page records stable server message ids separately from realtime arrivals. A disconnected old cache segment cannot be mistaken for contiguous history merely because a single realtime message or optimistic ACK overlaps the latest page. Actual store/coordinator regressions reset stale history to the newest 20 and page from that page's displayed boundary. Overlapping authoritative pages preserve a previously expanded view. A confirmed empty latest page preserves the existing merged-cache behaviour; this patch does not introduce deletion or cache pruning.
- An older-page response must be confirmed before the visible window expands. Failed, empty, unconfirmed, late-account, late-thread and replaced-cursor responses cannot expose disconnected cache. Already shown ACKs do not count as additional older rows. Invitation-only and local-only windows can reveal cached older rows without inventing an HTTP message cursor.
- Canonical timestamps and message/invitation ids decide chronology. Optimistic aliases retain only React row identity. An ACK retained outside the connected visible history does not become an older-page cursor until its intervening server page is shown. Equal-time reverse arrivals, middle arrivals below a future-clock optimistic row, and historical messages with stable local aliases have executable regressions.
- Optimistic publication still precedes the HTTP send; retry keeps the original idempotency key. HTTP/realtime ACK ordering, duplicate confirmations, rapid identical sends, HTTP timeout after realtime confirmation and stale-account replies run through actual production store/coordinator/realtime modules. Local presentation time stays beyond the latest known row when a device clock is behind, so the new send is at the inverted list's newest edge; the ACK uses the authoritative server timestamp. Receipt/delivery changes in another conversation remain isolated.
- Unchanged thread delivery selectors reuse their result. Typing subscribes to the relevant partner state. Read focus and receipts follow actual displayed incoming rows and foreground focus; cached refresh work waits for the push transition to settle.
- Older history is absorbed into the existing entrance bookkeeping without replaying arrival animations or haptics. Gesture worklets, motion specifications and runtime artwork remain unchanged.

At this earlier stage, the invitation GET endpoint returned all durable invitations without server pagination or LIMIT. Only their initial render window was capped. The bounded-invitation stage below implements the additive server/client contract that was missing here. Lightweight cache/local-id scans and invitation deduplication still inspect cached data; the expensive grouping, date formatting and row models operate on the opening window.

The room/performance agent measured the date/grouping model on Node using 15 warm samples and reported these median CPU times:

| Synthetic daily rows | Before | After |
| --- | --- | --- |
| 100 | 2.577 ms | 0.278 ms |
| 1000 | 24.177 ms | 2.089 ms |

These are CPU-only model measurements, not native FPS, network latency or cold Intl startup measurements. Native smoothness, fast scrolling, keyboard, Reduce Motion and real-device performance remain Open.

Final follow-up validation on Node 22.23.3 after the pending-only window and timezone memo fixes:

- Full chat runner: 302 compiled/guard tests and 101 hook tests passed, 403 total; zero failures, skips or cancellations. The command exited 0. Log: `/tmp/blumi-chat-performance-frozen-final-20261003.log`. The earlier 401-test run predates the final two regressions and is superseded.
- Mobile TypeScript: passed; the command exited 0. Log: `/tmp/blumi-chat-performance-typecheck-final-20261003.log` (no diagnostics).
- Opening/window/sending/canonical chronology focused checks: 54/54 passed. Actual pending-only caches of 20 and 25 rows retain the oldest shown row while a partner's realtime or first-page message grows the visible window to 21; a subsequent invitation grows it to 22. Hidden cached locals are not counted as new arrivals.
- Date/grouping/timezone focused checks: 28/28 passed, including an actual hook regression for changing the device timezone without changing the timeline or delivery getter. These CPU/lifecycle checks do not establish native paint quality.
- The conductor's session runner passed 305 compiled and 171 hook checks (476 total). Theme/engineering guards passed 25/25 and layout checks passed 96/96. Full mobile lint reported zero errors and three existing warnings in unchanged MiniRoom files. Final diff whitespace checks passed.
- Independent review passed the combined 85-test window/model/hook/background scope and re-ran the final opening and row-model hook delta separately: 23/23 passed with zero failures, skips or cancellations. The earlier deep core review covered 118 checks. The reviewer found no concrete remaining P1/P2 issue in the corrected patch; this is source/test review, not native or measured-FPS verification.

The conductor verified that the ordinary Metro process serves the current `blumison/apps/mobile` checkout. This earlier stage had no commit, push, server deployment, API/schema change or published-asset modification. Native verification remained with the owner.

## Current follow-up: bounded invitation HTTP history and compact cards

The owner requested that invitation HTTP cost also be addressed. The current checkout now contains an additive, backward-compatible invitation paging contract and its mobile integration. This stage changes query validation and server reads; it adds no database migration, media feature, cancellation policy or deployment.

- The mobile client explicitly requests `limit=20` for recent invitations and requests older pages only when the user asks. The server selects a chronological, exclusive-before page by timestamp and canonical invitation id, limits database rows before hydration/JSON construction, and returns the next history cursor separately from active context. Existing unparameterized callers retain the legacy full-list response.
- A page contains at most 20 history invitations plus at most two actionable pending/live accepted contexts outside that page. Those ancient active contexts are pinned as additional bounded opening rows so that they remain visible and accessible. A 200-invitation actual store/coordinator/opening/sending regression shows 20 recent rows plus two active cards on the first frame and pages older invitation-only history without any message request. Active and exact-target records never become the invitation history cursor.
- Bounded latest refreshes merge status changes without deleting previously loaded invitation history. Authoritative page membership stays separate from realtime arrivals and targeted notification lookups. Disconnected latest pages reset the invitation history window; account/thread changes and replaced cursors cannot revive stale pages. Realtime cancel/accept and room closure update the active context independently.
- Message and invitation history page independently. An empty or failed message page does not block a successful invitation page, and an invitation failure does not block messages. Expanding one facet cannot reveal an unconfirmed disconnected range in the other; the regression includes a stale previously fetched message page whose original reveal was dropped. Empty, failed or late replies cannot expand an unverified range.
- An old notification outside the latest page performs one exact, thread-scoped lookup instead of walking all history. Authorized terminal missing/forbidden responses settle the request. Stale-session cancellation stays retryable. A same-account message reconnect does not cancel an independent exact invitation lookup; newer realtime decisions win its reply, and an exact accepted publication fences out an older in-flight latest refresh.
- Recognized legacy server replies are supported without another full fetch: the client validates raw thread/id/time boundaries, establishes canonical equal-time ordering, honors `before` and exact target locally, and normalizes only the selected 20 records plus at most two live contexts. Tests cover 1000 ended invitations, ancient live context, three older pages, reordered timestamp ties, old exact targets, foreign threads, duplicate/malformed records and cancellation. Legacy response parsing and raw selection still inspect the full received payload; bounded live HTTP traffic requires the new server code to be deployed.
- Newest invitations keep the existing full card. Older historical invitations use a small status row without the room scene, layered avatars or gradient subtree. Current pending and server-known live accepted contexts retain the full card. Compact cards preserve the existing busy/disabled states and server-validated actions, including old accepted room entry. New invitations compact the previous card under the same React key without replaying its arrival motion/haptic. Initial list batching treats compact rows as ordinary short rows, preserving viewport coverage.
- Composer busy/ready state reads current active context once an invitation reply is ready, including complete legacy-derived active context. Retained inactive historical records cannot leave a stale pending/room-ready state. Before the first reply, cached behaviour remains available. Timeline cards and notification actions keep their historical data; this is a display-context selector, not a client access decision.

The conductor reported a synthetic JSON comparison of the full versus bounded invitation envelope:

| Synthetic response | Records including active context | Serialized bytes |
| --- | --- | --- |
| Full legacy history | 1002 | 346748 |
| Recent page and active context | 22 | 7725 |

This is local JSON payload evidence, not production latency, native FPS or memory profiling. Loaded cache membership still uses lightweight scans; only expensive row grouping/formatting and scene construction are bounded. The current patch does not claim constant-time total window work.

Final current validation on Node 22.23.3:

- Invitation integration focused scope: 119/119 passed, zero failures/skips/cancellations, exit 0. Log: `/tmp/blumi-invite-focused-context-frozen.log`.
- Full chat runner: 326 compiled/guard tests, 122 hook tests and three room-door flight tests passed, 451 total; zero failures/skips/cancellations, exit 0. Log: `/tmp/blumi-invite-full-chat-final.log`. This supersedes the prior 450-test run and the earlier 403-test stage.
- Mobile TypeScript: exit 0 with no diagnostics. Log: `/tmp/blumi-invite-mobile-typecheck-final.log`. Theme/import/engineering/worklet guards: 25/25 passed, exit 0. Log: `/tmp/blumi-invite-theme-final.log`.
- Full mobile lint passed with exit 0: zero errors and four warnings in unchanged MiniRoom files. The final composer-context files passed focused lint with zero errors/warnings and exit 0. Logs: `/tmp/blumi-invite-mobile-lint-frozen.log`, `/tmp/blumi-invite-context-lint-final.log`.
- Independent review ran the frozen nine-file integration scope: 118/118 passed; the final context-only selector delta passed 4/4. No concrete remaining P1/P2 finding was identified. Separate metadata regression tests passed 8/8; compact card/model checks passed 8/8; the new API adversarial file passed 8/8.
- The server worker/conductor reported 28/28 real repository contract checks (14 memory and 14 disposable PostgreSQL), 107 shared-contract checks, 33 authentication/route-schema checks and server TypeScript exit 0. These use a throwaway local PostgreSQL cluster and do not write to the live database.
- Final whitespace check passed. `apps/mobile/package.json` has no diff; new tests are registered in the existing chat runner.

This phase used bounded mobile implementation, server repository/contract work, compact-card work, metadata/API test support and independent review under the conductor's frozen ownership. Concurrent unrelated shop/asset and flight test changes were preserved; they are not attributed to this invitation patch. Mobile package scripts/native fingerprint settings, character artwork and gesture/motion specifications were not changed by this stage.

- Implemented: bounded invitation API/server/client, older/exact lookup paths and compact historical cards are present locally.
- Tested: final post-context local behavioural and contract checks above passed.
- Native verified: Open, explicitly assigned to the owner. No native/FPS result is inferred from tests, CPU timings or payload size.
- User approved: measured smoothness and release approval have not been inferred.
- Production ready: Open. The additive server change has not been deployed; older deployed servers still send their full legacy JSON even though current client selection/rendering is bounded.

No commit, push, live database write, server deployment, OTA/EAS publication or published-asset modification was performed. The changes remain a reversible source/test diff with existing durable records and stable ids intact.
