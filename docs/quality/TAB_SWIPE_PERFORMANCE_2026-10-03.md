# Main tab swipe performance and bottom-bar tap (2026-10-03)

Branch `claude/tab-swipe-perf`, based on `a6b7856` (`origin/develop`).

Status labels: everything below is **Implemented** and **Tested** (node
behaviour tests). None of it is **Native verified**: no frame-rate number in
this note was measured on a device. The device checks are listed under
"Still needs a device".

## Symptoms

- Swiping between Keşfet, Sohbet, Oda and Shop dropped frames and stuttered on
  every tab pair.
- Tapping a bottom-bar tab slid and stretched the selection pill across the
  other tabs (the "liquid" pill from 1dfd36a and 442f57a). The owner wants the
  target shown directly.

## Owner decision: the bottom-bar tap is direct

- A tap, a route sync and the end of a swipe put the pill on its tab in the
  same frame. There is no slide and no stretch.
- The liquid stretch is removed completely: scaleX/scaleY, the per-frame
  speed-sampling reaction and the delayed spring restarts. Its model functions
  and their tests went with it, because the feature no longer exists.
- During a finger drag the pill still follows the pages 1:1. That movement is
  the finger's, not an animation.
- The page itself still switches instantly on a tap.

## Causes and fixes

| # | Cause | Fix |
|---|---|---|
| H1 | Every swipe release dispatched the navigation select while the ~250 ms settle spring ran (`scheduleOnRN(commitPage)` at settle start, from 75ed4b8). That one dispatch re-rendered the root chrome, the bottom bar and the two pages whose selection flipped. It also fired every page blur and focus listener: the Inbox refresh, warming 6 threads, the clock tick, the My Room pose reset, the background blob state on both pages, and the Discover filter reload. | The release only shows the page on the UI thread. Navigation is asked when the spring ends. It is also asked when a touch lands the settle, or by a 600 ms fallback timer. Touch never depends on the committed route: pages keep `pointerEvents="auto"`, so the 75ed4b8 tap-ignore bug cannot return. Only the accessibility props switch late. Page focus and blur run one frame plus one idle slot after the commit render. A route change from elsewhere during the settle (a notification or deep link) wins over the pending swipe. |
| H1 | Discover reloaded its filters into a new object on every focus. That re-rendered Discover, cleared the cards seen this session and rebuilt the deck. | When the values are equal, the focus reload keeps the current object, so the seen set survives a refocus. |
| H2 | A drag start mounted a never-visited neighbour (My Room or Shop, with its module `require`) synchronously in the middle of the drag. The idle warm-up mounted both neighbours at once, often inside the next swipe. | Once the first page is up, every other page mounts once, one page per idle slot, nearest first. A slot is skipped while a drag or settle runs; the UI thread reports when the pages start and stop moving. The drag-start mount is now only a fallback, run as a React transition. A page it mounts fades in over 160 ms. |
| M1 | Pages that are not shown stay fully live. | **Not done; this is a decision.** Freezing pages two away (with `react-freeze`) hides them with `display: none`. During a quick second swipe that catches a settle, or after a tap snap, a frozen page would show blank for the frames before its unfreeze renders. With four pages, only Inbox-from-Shop and the far pages would be frozen. The store-driven renders that mattered are cut at the source instead (room invites and Inbox keys, below). Revisit this only if a device trace still shows hidden-page commits during a swipe. |
| M2 | `NavTab` was not memoised and got an inline `onPress`, so all 4 tabs re-rendered on every bar render. | `NavTab` is memoised with one stable press callback. The selected icon and label share one animated layer, so each tab has 2 animated views instead of 3. |
| L2 | An Inbox row's press-in warmed its thread even when the touch became a swipe. | **Handed over.** The fix was written (abf50b8) and then reverted (1143385). The branch `claude/chat-open-tap-latency` owns the row press-in warm. |
| R1 | Every room-invite refresh gave the invite list held in `RootNavigator` a new array. That meant up to 6 full root re-renders per Inbox visit. | A refresh whose invites equal the current ones keeps the current list, and React bails out. Only an equality check was added, so the other agent's ended-room handling merges cleanly. |
| R2 | `RootNavigator` built the stack `screenOptions`, each main tab's options and the pager's bottom-bar element inline. | These are memoised, and `MainTabPager` is memoised, so a navigator render that changes nothing for the main tabs skips the pager. |
| R3 | The Inbox `threadKeys` was rebuilt from the thread objects, so every store update rebuilt `getItemAnim` and `renderThreadRow`. | It is now memoised on the joined thread ids. (`chatStore.getThreads` caching is owned by `claude/chat-open-tap-latency`.) |
| R4 | `RoomRenderer2D` passed `motionPaused` to every item, so a focus change re-rendered all the furniture. | Only avatars get it. This is a separate commit, and the tap and seat code is untouched. |
| P1 | Inbox and Discover blobs had a view opacity below 1 over a clipped circle, so each blob rendered offscreen on every frame. | The opacity is folded into the gradient's start colour, which draws the same pixels. Each blob is rasterised once (its circular clip still needs a mask, and the 16 s drift is a transform). The drift starts on page focus, which now comes after the settle. |
| P2 | My Room's `stageCard` rounded only its top corners with `overflow: hidden`, which creates a mask layer. | It now has a rectangular clip. `roomStack` (radius 34, 1 pt border) already rounds those corners. |
| P3 | The Discover bottom card rested at opacity 0.96, so its whole subtree rendered offscreen. | It now rests at opacity 1. The content of each card behind the top one is rasterised, and its motion and frost sit outside that bitmap. |
| P4 | Inbox row portraits are layered images in a circular clip. | `ParticipantAvatar` is rasterised. |
| P5 | The Shop coin pill had a shadow under a 30% background. The showcase and closet cards had shadows that their own clip cuts off. | These shadows are removed. |
| P6 | The room-shell and Shop first-viewport image prefetches ran with a 0 ms delay on every route change. | They now wait 300 ms, then an idle slot. |

### Not done (owned elsewhere or too risky without a device)

- `GlassDeckOverlay` keeps its own `overflow: hidden` and radius. Moving it into
  the card's clip means changing `DiscoverCard`, and its 1.5 pt white border
  would lose its rounded corners. Check this with Color Offscreen-Rendered
  first.
- The Inbox row card keeps `overflow: hidden`. Dropping it changes how the
  left accent bar ends inside the 30 pt corner. Under the New Architecture it
  may also make the card's float shadow visible where it is clipped today. That
  needs a visual check on the phone. The row file is also shared with
  `claude/chat-open-tap-latency`.
- `shopPreviewStyles.previewStage` has no shadow at this base, so there was
  nothing to remove.

## Tests

- `mainTabPagerInteractivity.test.ts` drives the real pager's pan handlers. A
  swipe dispatches nothing, renders no page and fires no focus while the pages
  settle. It commits once when they rest, and blur/focus run one frame later.
  The fallback commits a settle whose end is lost. A touch that lands or
  catches a settle commits exactly once. Pages mount one per idle slot. A drag
  over warm neighbours renders nothing.
- `mainTabPagerModel.test.ts` covers the selection reducers: the deferred
  commit, a tap on the page being settled, and an external route during a
  settle. Touch is never gated. It also covers the idle mount order.
- `mainTabRenderIsolation.test.ts` checks that an unchanged room-invite
  refresh does not re-render the root navigator. The earlier unread,
  connection and props tests still pass.
- `bottomNavIndicatorModel.test.ts` checks that a tap lands the pill at once
  and that a drag tracks 1:1.
- `useDiscoveryFilters.test.ts` and `discoveryFiltersModel.test.ts` check that
  refocusing with unchanged filters keeps the same object and causes no render.
- `chatCoordinator.test.ts` checks that an unchanged invite refresh keeps the
  same list.
- `ambientMotionModel.test.ts` checks that the folded blob colour is exact.

## Still needs a device

Use a **Release** build on the owner's iPhone. A dev build's JS is several
times slower and hides or invents jank.

1. Perf Monitor (shake menu, or the dev-client menu in a Release-like build):
   watch UI and JS FPS while you swipe each pair, Discover↔Chats↔Room↔Shop,
   both ways, slowly and as flicks. The UI thread should stay near 60/120. The
   JS thread may dip briefly *after* the page rests, which is the commit.
2. Instruments → Animation Hitches (or Core Animation FPS): record 10 swipes
   per pair, before and after this branch.
3. Xcode → Debug → View Debugging → Rendering → **Color Offscreen-Rendered**
   (Simulator: Debug → Color Off-screen Rendered) on the Mac. The blobs, the
   Discover back cards, My Room's stage, the coin pill and Inbox portraits
   should no longer flash yellow. `GlassDeckOverlay` and the Inbox row card
   still will (see "Not done").
4. Check by eye: the swiped-to page takes a tap the moment it lands. A
   bottom-bar tap shows the target with no slide. The pill tracks the finger
   during a drag. Reduce Motion still switches pages instantly, with no fade.
   Shop and My Room appear without a pop on the first swipe after launch.

## What only a Release or a new native build changes

- Every change here is JS. It ships by OTA on the current native build; no
  `package.json` script or native module changed.
- The `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` flag (commit 902cba4) only takes
  effect after a native rebuild with `pod install`. Until then, every React
  commit during a swipe pauses Reanimated's frame commits. That is why moving
  the commit out of the settle (H1) matters so much on the current build. A new
  TestFlight build with that flag reduces the cost of any commit that still
  lands during motion.
- Measure frame rates only on a Release build. The dev client adds JS overhead
  that makes the commit and mount costs look several times larger.
