# Main-page pager — 2026-09-30

Status: **Implemented, Tested** (automated checks below). **Not native verified**: no iOS Simulator or device was available. The checks in the last section are open.

## What changed

The four bottom-bar pages (Discover `Lobby`, Chats `Inbox`, My Room `MyRoom`, Shop `CosmeticShop`) are hosted in one native-stack slot route by `apps/mobile/src/navigation/mainTabPager/MainTabPager.tsx`. The slot route's name is always the selected tab, so route-name based code (chrome store, bottom-bar selection, deep links, notification routing, `navigate("Inbox")`, `popTo("Lobby", params)`, `replace("MyRoom")`, resets) is unchanged. A router override (`mainTabPagerRouter.ts`, passed as `UNSTABLE_router`) keeps exactly one tab route in the stack with a stable key and renames it in place.

Rollback: set `MAIN_TAB_PAGER_ENABLED` in `mainTabPagerConfig.ts` to `false`. The four separate stack routes and the previous `navigate(..., { pop: true, merge: true })` tap path return unchanged; both paths are covered by tests.

## Which pages are swipeable

| Page | Swipeable | Reason |
|---|---|---|
| Discover | No | Its main surface is the like/pass card swipe, which covers most of the screen. A pager drag there would either steal card swipes or work only on the header strip. Reached by the bottom bar; the pager gesture is disabled while Discover is selected. |
| Chats | Yes | Vertical thread list only. First swipeable page: dragging right rubber-bands and shows background, never Discover. |
| My Room | Yes | Room items are tap-only here. Object drag exists only on the editor and room setup routes, which are separate stack routes above the pager. |
| Shop | Yes | Last swipeable page. The horizontal product shelf and the accessibility-layout category rail own drags that start on them. |

## Gesture ownership (one mechanism)

A Gesture Handler `Pan` on the pager with `activeOffsetX ±12` and `failOffsetY ±12`: it follows the finger after a small horizontal slop and fails when movement is vertical first. Horizontal scrollers inside pages are wrapped in `MainTabPagerHorizontalScrollOwner` (`src/ui/MainTabPagerGestureOwnership.tsx`), whose `Gesture.Native()` `blocksExternalGesture(pager)`. The Discover card needs no relation (pager disabled on Discover), room object drag and the iOS edge back live on routes above the pager, and the slot route keeps `gestureEnabled: false`. The Discover card's `PanResponder` and thresholds are unchanged.

## Motion, state and interruptions

- Drag and settle run on the UI thread with shared values. Release uses velocity projection plus a flick rule (450 px/s after at least 20 px); movement under 20 px always returns. The settle is a critically damped spring that starts with the release velocity, capped so overshoot stays under 1.5% of a page. First and last swipeable pages rubber-band.
- One selected-page state: the slot route name. A settle commits once, when its animation finishes, through the router's select action. Bottom-bar taps go through the same path and switch instantly, as before. Rapid taps retarget to the latest. A touch catches a running settle. Navigation from elsewhere, backgrounding and layout changes return the pager to a committed page.
- Reduce Motion (shared `useReducedMotion` store): the page does not follow the finger; a qualifying swipe switches instantly.
- Each hosted page gets its own `isFocused()` and `focus`/`blur` events (selected page and slot focused), so existing focus-aware code (Inbox refresh and warmup, My Room motion lifecycle, Discover focus effects) pauses on mounted pages that are not selected. Only the selected page is exposed to touch and accessibility.

## Mount policy

Pages mount on first selection and stay mounted with focus-aware work paused. A never-visited swipe neighbour is mounted 350 ms after the selected page settles, on the next idle callback, or when a drag starts first, so a drag rarely reveals an unmounted page and never competes with a settle. Discover has no swipe neighbours, so it is never preloaded by the pager. Pages are not frozen: a frozen React subtree is hidden, which would make a revealed neighbour blank.

## Open native checks (owner's iPhone)

1. Chats ↔ My Room ↔ Shop: slow drag, fast flick, short slow drag that returns, cancelled drag, direction reversal, repeated back-to-back swipes.
2. Diagonal and vertical starts on the Chats list and the Shop page: the list scrolls and the page does not move. Small horizontal jitter does not change the page.
3. Rubber band on Chats (dragging right) and Shop (dragging left). Discover is never revealed.
4. Rapid bottom-bar taps across all four pages, including during a settle. The bar selection, the visible page and VoiceOver focus agree.
5. Discover: card like/pass, cancelled card swipe spring-back, consecutive swipes. Horizontal drags on Discover never change the page.
6. Shop: product shelf paging and the large-text category rail scroll without moving the page.
7. My Room: item taps, walk/seat; My Room editor object drag (separate route).
8. Edge back from Chat thread, Profile, Wardrobe and My Room editor; the bottom bar still appears only after the back swipe finishes.
9. Reduce Motion on: swipes switch instantly without finger-follow; taps switch instantly.
10. Background and foreground the app mid-drag and mid-settle: it resumes on a whole page.
11. Frame pacing during drags on a physical device (no hitch when a neighbour mounts).
