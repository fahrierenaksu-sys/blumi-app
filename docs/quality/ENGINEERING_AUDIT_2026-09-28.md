# Blumi engineering audit — 2026-09-28 (historical)

> Superseded for current status by [ENGINEERING_AUDIT_2026-09-30.md](./ENGINEERING_AUDIT_2026-09-30.md).
> In particular, the 29 candidate imports noted below were promoted on 2026-09-30.

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
- On 2026-09-29, all five workspace typechecks, mobile lint, and the full
  `npm test` script passed after the warmup source-contract test was updated
  for the current navigation snapshot. Environment-dependent PostgreSQL cases
  inside the normal suite can skip; the separate targeted presence verification
  used a local temporary PostgreSQL cluster and ran 14/14 without skips.
- The same day's source-hygiene suite passed 8/8. Expo Doctor now reports
  20/21: this installed SDK expects `expo ~57.0.26` and `expo-constants
  ~57.0.20`, while this checkout has `.25` and `.19`. This is a patch-version
  alignment gap, not evidence of a runtime crash; upgrade only with lockfile,
  bundle, and native-build compatibility checks rather than changing the
  user's active development binary mid-investigation.
- The full isolated PostgreSQL gate passed after the chat ACK-loss test was
  corrected to dispatch the durable outbox explicitly before simulating a
  later block. Its old indefinite wait assumed best-effort post-ACK fanout
  was synchronous; the production path intentionally acknowledges persistence
  first and has a periodic worker for recovery. The revised targeted chat
  run passed 2/2, and the complete gate passed migrations from empty and
  rerun plus its PostgreSQL test groups. No production database was touched.

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
6. Shared avatar renderer: MiniRoom movement changes only the avatar position
   on many frames, while its selected layer array stays stable. The renderer
   is now memoized so those parent frames do not repeat layer/ticker setup;
   its own animation ticker still updates walking frames. No asset preloading,
   frame-rate cap, cosmetic-ID change, or visual gate was introduced. This is
   a source-level optimization, not a measured FPS claim.
7. Session capability requests: cold account sync and the token-change effect
   could both POST `/v1/capabilities/resolve` for the same active token. The
   registration path could also overlap a later token effect. These paths now
   share an in-flight request per token, then discard it on completion; a
   subsequent request still rechecks the server. Different tokens never share
   a result, and a failed/closed resolution is not cached. The unit tests
   prove the request count for overlapping reads, not a measured live startup
   request count.
8. Server operational logging: provider and database errors can carry
   enumerable account or message fields. A local Pino serialization check
   confirmed that `{ error }` can emit those fields. The request, worker,
   startup, and realtime paths inspected here now emit a fixed error-kind
   label instead of a raw error object. This preserves failure location and
   request correlation but removes stack/detail from these logs; the helper
   has a regression test with synthetic private fields. Other logging paths
   still require a separate audit before claiming complete log hygiene.
9. Cold scene images: the supplied 12.8-second iPhone recording shows the
   Shop avatar's base appearing before its hair and outfit, and the Shop room
   preview similarly filling in after the surrounding UI. These are bundled
   Expo Image sources rendered as separate native images, not an observed
   backend response waterfall. A small best-effort warmup now visits only the
   active front/idle outfit and selected room shell after interactions, one
   image at a time. It never blocks navigation or gates the whole character;
   changing the avatar cancels the remaining old queue. Shop's existing
   product-preview helper now shares the same idle-asset projection. The
   installed iPhone 17 Simulator showed the equipped character on Room,
   Wardrobe, and Shop after the change, but its cache was already warm; this
   is native visual smoke evidence, not a cold-load speed comparison.
   A process restart and fresh Metro load then showed a complete Shop avatar
   and room shell on navigation; however Discover had already displayed this
   avatar and Expo Image's disk cache was retained. That run cannot isolate
   the warmup's contribution or establish a before/after latency improvement.
   The warmup projection itself runs after interactions, not during the first
   React render. Focused warmup/Shop tests passed 5/5; avatar test groups,
   match/room tests (294/294), mobile typecheck/lint and source-hygiene
   (8/8) passed. No candidate asset, cosmetic ID, or inventory state changed.
10. Chat thread page mapping: PostgreSQL already returned all participants in
    one batched read, but the server filtered that full result again for each
    thread. A page of `T` threads and `P` participant rows therefore did
    `T × P` row checks. The mapper now groups participants in one pass and
    looks them up by thread ID. The query count remains two and the public
    response is unchanged. A multi-thread interleaved-participant test and
    the real PostgreSQL pagination test passed; server typecheck and mobile
    lint passed. This is a CPU-allocation improvement, not a measured
    end-to-end chat-list latency claim.
11. Root navigation chat subscription: the navigation root used the full
    `useChatStore()` hook solely for its unread badge. That hook increments
    React state on every chat-store notification and clones thread data on
    each resulting render, including message loading and optimistic-send
    updates that do not change the badge. The root now uses an external-store
    subscription whose primitive snapshot is only the total unread count;
    React can skip its render when that number is unchanged. Inbox, chat and
    room-message consumers keep their existing full subscriptions. The
    chat-store suite (19/19), mobile typecheck and lint passed. This is a
    source-level render-scope fix; native render counts and frame times have
    not yet been measured.
12. Discover prefetch admission: while the production safety list is still
    loading, `LobbyScreen` intentionally exposes no candidate deck. The
    low-deck prefetch effect previously interpreted that temporary empty
    state as depleted supply and could request successive cursor pages before
    the block list was ready. It now waits for the safety list before using
    the three-candidate threshold. The first page query and fail-closed deck
    remain unchanged. A previously failing admission regression now passes
    (7/7 discovery query-option tests); mobile typecheck and lint pass. The
    exact live request reduction depends on network timing and has not been
    measured; production safety-list timing requires a controlled trace.
13. Chat input render scope: the controlled message draft and send-button
    animation now live in a small composer component rather than the entire
    chat screen. Typing therefore no longer changes the parent screen's
    local state or directly rerenders its timeline. The parent still owns
    optimistic sending; the draft clears only after that send is accepted.
    The standard chat suite now includes a source-structure regression and
    executable tests of the actual composer handler: accepted sends clear
    the trimmed draft, rejected sends preserve it, and empty/pending-thread
    submissions do not send. All three checks and the standard chat suite
    pass; mobile lint passes. These handler tests do not mount React or
    measure keystroke-to-paint latency.
    The signed-in Simulator account had no chat thread to exercise, so native
    keyboard/send behavior remains OPEN.
14. Inventory read write-amplification: `economyService.getInventory` now
    returns its freshly read repository record when all starter and legacy
    replacement entitlements are present. Previously it always called
    `ensureInventory`, whose PostgreSQL conflict branch writes even when its
    timestamp is unchanged. Missing/new inventories still use the existing
    atomic union repair; purchase/reward balance mutations remain conditional
    repository operations. No ownership cache was introduced. New regressions
    failed before the fix and pass afterward: two complete reads perform zero
    repairs instead of two, a missing starter is repaired only once, and a
    later balance/debt change is read afresh. The economy service/repository
    suites pass 25/25, including concurrent purchase/reward regressions and
    a SQL-adapter test proving one SELECT and no upsert for a complete record.
    This proves eliminated repository work, not a measured production p95 gain.
15. Session test coverage: `registerLegalContract.test.ts` used the repository
    process working directory even though its runner executes from mobile.
    Its source path is now file-relative, and the two existing assertions are
    included in `run-session-tests.mjs` instead of being silently omitted.
    The standard session package passes 269/269; navigation passes 21/21 and
    domain tests 24/24. No product expectation was weakened. The expanded
    ad-hoc session pass still has ten native-overlay-contract failures;
    generated native code versus maintained plugin intent requires separate
    verification, not deletion of those tests.
16. Economy API deadlines: inventory GET and purchase POST now use the shared
    15-second whole-operation deadline, including body reads. The economy
    adapter preserves strict JSON failure semantics rather than accepting a
    malformed response as inventory. No mutation retry was added. Four stalled
    transport/body regressions failed before the change; all 23 focused
    network/economy checks passed in the worker run. Parent reran the expanded
    standard inventory suite successfully. Queue reconciliation after an
    ambiguous purchase is still in progress; native latency is not measured.
17. Startup session publication: startup profile hydration now commits through
    the existing mutation coordinator, retaining credentials rotated during
    the read. Cleanup invalidates queued persistence and cancels owned refresh
    and profile work. Nine executable effect-body interleaving regressions
    cover recovery, rotation and cleanup; six original failure cases failed
    before the fix. The worker session run passed 278 tests; parent mobile
    typecheck/lint passed. These do not mount React or exercise native storage;
    a native write already issued before cleanup cannot be cancelled.
18. Discovery watch: DELETE uses the shared deadline and accepts empty 204.
    The mutation cancels exact-scope GETs before the write and before publishing
    acknowledgement, then invalidates for authoritative reconciliation. Tests
    exercise obsolete GET completion, overlapping reads, errors and timeouts;
    no write retry occurs. Parent integrated the helper tests into the standard
    discovery runner and reran that runner successfully. Concurrent mutations
    and native interaction remain open; failed reconciliation leaves server
    outcome unknown rather than reporting success.
19. RevenueCat identity: SDK identity changes are serialized and latest intent
    is recorded immediately, so a pending login no longer makes logout a no-op.
    Purchases are blocked during transitions or mismatched identity; a failed
    transition does not poison a later retry. Two races failed as executable
    bridge tests before the fix; failure/retry is also covered. Commerce and
    wallet tests pass 14/14 and now run in the standard inventory gate. Mobile
    typecheck/lint pass. Paid coin packs remain disabled; this is not a native
    store transaction test or proof of cancelling an already-issued purchase.
20. Discovery initial presentation: disabled/Reduce Motion entry animations
    now initialize visible instead of waiting for a passive effect. The card
    memoizes its candidate snapshot by appearance/identity, avoiding resolver
    invalidation from unrelated renders. Its opaque image has an immediate
    opaque existing blush-token fallback and uses Expo Image's memory-disk
    cache with zero transition and fixed cover geometry. The three expression/
    source regressions failed before the fix and now run in the standard
    discovery gate, which passed. No character pixels or cosmetic IDs changed.
    The quota-exhausted Simulator baseline is not evidence for active-card
    paint, cold decoding, native color acceptance or measured smoothness.
21. RoomV2 same-owner refresh: autosave and explicit-save completions now
    compare their captured hydration generation before publishing canonical
    decor, cache metadata, or errors. Obsolete server snapshots remain
    available to the new hydration path, and newer local edits are preserved
    as pending or conflicted drafts rather than silently discarded. The
    standard room-persistence run passed, including 19 provider-lifecycle
    tests covering token rotation, stale save responses, conflict and owner
    switch. This is not a cross-device or native editor verification.
22. Push response replay: notification responses rejected while navigation is
    not ready remain pending and retry on readiness with session/owner checks.
    Cached responses are consumed only after accepted delivery; recent IDs
    are deduplicated and the pending/owner maps are bounded. The standard
    notification suite passed, including executable early-response, replay,
    deduplication and account-switch cases. Native APNs delivery remains open.
23. Presence spot claims: join and move now use the repository's room-scoped
    PostgreSQL transaction lock and recheck occupancy before writing. A
    separate local PostgreSQL verification ran concurrent claims through two
    pools, including a join-versus-move race; the targeted 14/14 tests passed
    with no skips. This closes the confirmed application-path double-claim
    race. The database does not enforce a standalone unique spot constraint,
    so future writers must use the same locked repository path; production
    load behavior has not been measured.

## Findings still open

### Additional parallel-audit findings awaiting integration or evidence

- P1, confirmed request-lifetime gap now bounded by fix 16: a stalled GET
  retained hydration single-flight; a stalled purchase blocked queued
  mutations. Ambiguous purchase failure must not be represented as success or
  blindly retried; authoritative inventory reconciliation remains required.
- P2, confirmed backend work amplification: presence publication checks all
  ordered user pairs and rereads nearby presence per user (six-user probe:
  30 block calls, six nearby reads, one initial snapshot). Discovery enriches
  each public room separately and loads snapshot bodies despite returning
  only metadata (20-profile probe: 20 decor and 20 blob reads). Batch safe
  visibility checks and metadata-only projection; production query cost is
  unmeasured and quota ordering must remain authoritative.
- P2, source-confirmed unbounded request work: discovery page eligibility
  repeats global ranking and refresh deletes expired owner snapshots inside
  a lock; auth and presence reads also run global expiry sweeps. Bounded
  workers/page-local revalidation need synthetic PostgreSQL plan and expiry
  tests before replacing these persistence paths.
- P2, confirmed fanout backlog: `postgresRealtimeFanout` serializes incoming
  notifications without an admission count/byte bound. A stalled fake lookup
  accepted and later drained 256 reference queries. Downstream socket limits
  do not cover this queue; unsubscribe also awaits the chain. A local cap or
  timeout alone would silently lose some successful `pg_notify` events because
  subscribers do not acknowledge them. A safe overload response needs an
  explicit unhealthy/gap signal, socket reconnection, and authoritative chat/
  room refresh; transient room reactions have no replay cursor. A strict
  no-loss guarantee would require a durable event log/protocol. Production
  memory impact is unmeasured, so no unsafe drop-on-overload patch was made.
- Unmeasured startup opportunity: deferred screen warmup evaluates six
  bundles in one idle callback. Yielding between cached loaders may reduce
  contention, but requires cancellation/single-evaluation tests and native
  tracing; no slowdown magnitude has been established.

- User device feedback after the `resetRoot` route-reordering experiment was
  that rapid bottom-tab switches still locked touches and My Room sometimes
  did not load. That experiment was removed. Bottom-bar presses now dispatch
  one installed StackRouter `NAVIGATE` action with `pop: true`: it pops to a
  previously visited tab or pushes a new one without reordering existing
  native controllers. Its Back history is stack-like: returning to an earlier
  tab discards later routes. The 40-switch installed-router regression proves
  bounded route count and stable retained keys, not UIKit touch delivery.
  Native rapid-switch, My Room load, and Back behavior remain open until the
  updated bundle is tested on a signed-in iPhone.
- A second source review found no confirmed full-screen touch interceptor.
  `freezeOnBlur` on the four native-stack tabs was removed as an unproven
  performance tweak while rapid pop transitions remain under investigation;
  the focused screen normally unfreezes, so this is risk reduction, not a
  proven root-cause fix. Navigation tests, mobile typecheck, focused lint, and
  the current Metro iOS bundle pass; signed-in device touch behavior is still
  unverified.
- On 2026-09-29, the Blumi iPhone 17 QA Simulator booted against the current
  Metro checkout and the installed app opened to auth entry, but secure
  sign-in storage failed. The macOS Simulator log reported FirebaseAuth
  `SecItemCopyMatching` status `-34018` (missing entitlement), and
  `codesign -d --entitlements -` printed no entitlements for the installed
  app. Restarting reproduced the failure. This attempt did not reach the
  signed-in bottom tabs and provides neither signed-build evidence nor
  native navigation verification.
- A temporary copy of that Simulator app was ad-hoc signed with a Keychain
  entitlement for local QA. Simulator installation succeeded but launch was
  rejected by SpringBoard. The copy was re-signed without that entitlement,
  reinstalled, and launched successfully; the original secure-storage error
  remains. This did not modify the repository or the physical phone and does
  not unblock native signed-in Discovery/navigation measurements.
- The supplied cold Shop recording and the code trace agree that the live
  avatar, room shell, card thumbnails, and first-page preview images are
  separate image loads. The current bounded warmup happens after interactions
  and cannot guarantee a fully dressed first Shop frame. The bundled
  `homeLiquid` background is also a separate 941x1672 image on both Discover
  and Shop. The respective decode/upload times and whether first-card work
  competes with the avatar have not been measured; do not infer a server
  bottleneck from visual pop-in alone.
- Discovery's first usable production card waits for filter storage, page
  data, and the fail-closed safety list. The server resolves optional room
  showcase data before replying. Those dependencies are confirmed in code,
  but their latency shares are not measured. An attempted parallel quota read
  was rejected after adversarial review: a decision during the showcase wait
  could make the quota stale. The quota remains a late authoritative read.
- OTP, chat, and profile editing keep controlled input state in broad screen
  components in the baseline; chat is now isolated, while OTP and profile
  still are not. This is a source-level candidate for keystroke-to-paint
  delay, not a measured keyboard trace. Input, validation, and expensive
  sibling renders need separate native timing before attributing a shared
  main-thread bottleneck.
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
- On initial production chat connection, the mobile lifecycle requests the
  thread list once over HTTP and again when WebSocket connects. The HTTP read
  supplies an offline/reconnect fallback; the WebSocket read closes the
  freshness gap around connection establishment. Removing either one needs a
  race-safe replacement and a live request trace; this audit did not remove
  one simply to reduce an apparent duplicate.
- The development export establishes package composition, not whether the
  1,220 assets are all necessary or when each decoded image enters memory.
  A release-profile binary, Instruments allocations/time-profile, and startup
  trace on a physical iPhone are still required.
- The equipped female base and one top layer are each 256x384 pixels, about
  0.4 MB of decoded RGBA each; file sizes are roughly 20 KB and 12 KB. The
  bounded warmup is not a catalog-wide preload, but its real cache footprint
  and cold-load benefit remain unmeasured on an iPhone.
- App module startup serializes the in-app legal copy before the first React
  frame. A local Node 22.22.2 microcheck measured 10,000 serializations in
  1,541 ms (about 0.15 ms each, excluding module load); this does not justify
  a startup rewrite without an actual native trace. Analytics SDK creation at
  import time remains an unmeasured startup candidate.
- The My Room movement path still updates React state on animation frames.
  Any deeper UI-thread migration needs an interaction/frame-time baseline and
  native QA; lowering its frame rate without such evidence could make motion
  worse.
- The shared avatar renderer change passed the avatar test groups, match/room
  tests, mobile typecheck and lint under Node 22.22.2. No post-change native
  frame trace or device-level performance comparison was captured.
- The capability and logging edits passed their focused tests, mobile session
  suite, server suite (520 passed, 25 skipped), mobile/server typechecks, and
  mobile lint. A live network trace and server log-sink inspection are still
  open; the skipped tests are not production-service evidence.
- Full `npm run verify` was rerun after these edits and exited 0, including
  PostgreSQL migration tests, production dependency audit, and Expo Doctor
  21/21. This does not establish native frame-time or physical-device gains.
- The full Node 22.22.2 `npm run verify` passed again after the chat-composer,
  Discover safety-prefetch, and provisional navigation edits. Adversarial
  review then rejected the navigation experiment because it changed Back
  history; after reverting it, focused mobile navigation tests and typecheck
  passed. The later launch-control wording correction passed the Operations
  Center alignment tests. No signed archive or real-device benchmark was
  produced by this run.

## Next evidence gate

### 2026-09-29 handoff for user-led device control

- The nine previously assigned agent tasks are terminal; none remains in
  progress. Their read-only findings do not prove the rapid-tab touch lock is
  resolved, and no agent supplied signed-in native stress-test evidence.
- The current main-tab handler skips reselecting the focused route, and the
  unproven `freezeOnBlur` option was removed after review. The focused
  navigation suite passed 34/34 and the Discovery suite passed 54/54.
  Discovery no longer clears the same account's filter readiness on every
  focus; a storage failure now falls back instead of leaving it permanently
  pending. Mobile TypeScript and lint passed. These are source/test results,
  not measured frame timing or a user-visible acceptance result.
- The final Node 22.22.2 `npm run verify` ran source-hygiene, operations,
  policy, release-infra, package builds, workspace typechecks, lint, workspace
  tests, the isolated PostgreSQL/migration gate, and release audit before
  failing at Expo Doctor (20/21). The installed Expo SDK expects `expo
  ~57.0.26` and `expo-constants ~57.0.20`; the checkout has `.25` and `.19`.
  Do not call the full verify green. Patch upgrades and an updated native
  build need separate compatibility checks; they were not slipped into this
  control handoff.
- User-led signed-in device QA is the next acceptance gate: 40–50 fast tab
  presses followed by taps inside each destination, My Room child-route
  back-navigation, Discovery return/cold paint, and Shop touchability after
  a rapid switch. Record the exact route/tap sequence or video for any lock.
  The current Simulator app is blocked at secure sign-in storage, so these
  flows were not native-verified by the audit.
- Follow-up dependency repair: the mobile manifest and root lockfile now
  resolve one Expo 57.0.26, Expo Constants 57.0.20, and the matching Expo
  Modules Core 57.0.20. The launch-config test's patch-version expectation
  was updated. After deduplication, Expo Doctor passed 21/21. The complete
  Node 22.22.2 `npm run verify` then exited 0, including tests, PostgreSQL
  migrations, release audit, and Doctor. This changes local dependencies;
  no iOS app was rebuilt or installed, so device compatibility remains open.

The later inventory optimization passed server typecheck and the full server
build/test runner: 524 passed, 25 environment-dependent tests skipped, no
failures. This run does not execute the separately configured PostgreSQL gate
or establish live database latency. The subsequent concurrent mobile agent
edits require their own focused and integration validation.

On the same signed binary and data environment, record cold/warm startup,
Shop/Wardrobe/My Room route-switch frame times and allocations, request counts,
and database p50/p95 plus `EXPLAIN (ANALYZE, BUFFERS)` for hot queries. Compare
against this commit before changing animation architecture, caching policy, or
PostgreSQL indexes. No production data or external service was modified in
this audit run.
