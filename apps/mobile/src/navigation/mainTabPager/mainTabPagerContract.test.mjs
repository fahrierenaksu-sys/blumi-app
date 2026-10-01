import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

// Source contracts for the main-page pager: gesture ownership, the
// performance rules, the rollback path and the unchanged Discover card
// thresholds. Pure behaviour is covered by the *.test.ts files beside this.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

const pager = read("./MainTabPager.tsx")
const config = read("./mainTabPagerConfig.ts")
const ownership = read("../../ui/MainTabPagerGestureOwnership.tsx")
const navigator = read("../RootNavigator.tsx")
const chrome = read("../useBottomNavChrome.ts")
const navigationModel = read("../rootNavigationModel.ts")
const app = read("../../../App.tsx")

test("the pager activates on a horizontal slop and fails on vertical movement", () => {
  assert.match(pager, /\.activeOffsetX\(\[-MAIN_TAB_PAGER_ACTIVE_OFFSET_X, MAIN_TAB_PAGER_ACTIVE_OFFSET_X\]\)/)
  assert.match(pager, /\.failOffsetY\(\[-MAIN_TAB_PAGER_FAIL_OFFSET_Y, MAIN_TAB_PAGER_FAIL_OFFSET_Y\]\)/)
  assert.match(config, /MAIN_TAB_PAGER_ACTIVE_OFFSET_X = 12\b/)
  assert.match(config, /MAIN_TAB_PAGER_FAIL_OFFSET_Y = 12\b/)
  assert.match(pager, /\.enabled\(swipeEnabled\)/, "disabled while a non-swipeable page is selected")
  assert.match(pager, /const swipeEnabled = selectedPage\.swipeable/)
})

test("horizontal sub-content owns its drags through one Gesture Handler relation", () => {
  assert.match(ownership, /Gesture\.Native\(\)\.blocksExternalGesture\(pagerGestureRef\)/)
  assert.match(pager, /\.withRef\(pagerGestureRef\)/)
  assert.match(pager, /<MainTabPagerGestureProvider value=\{pagerGestureRef\}>/)
  const closet = read("../../features/shop/screen/ClosetBrowser.tsx")
  // The product shelf keeps a drag only while it can still scroll that way;
  // past its first or last page the drag goes to the main pager.
  assert.match(closet, /<MainTabPagerEdgeHandoffScrollOwner\s+enabled=\{shelfOwnsHorizontalDrags\}\s+scrollOffset=\{shelfScrollOffset\}\s+maxScrollOffset=\{shelfMaxScrollOffset\}\s*>\s*<Reanimated\.FlatList[\s\S]*?horizontal[\s\S]*?pagingEnabled[\s\S]*?scrollEnabled=\{shelfOwnsHorizontalDrags\}[\s\S]*?onScroll=\{handleShelfScroll\}[\s\S]*?<\/MainTabPagerEdgeHandoffScrollOwner>/)
  assert.match(closet, /const shelfMaxScrollOffset = getShopShelfMaxScrollOffset\(productPages\.length, productShelfWidth\)/)
  assert.match(closet, /const handleShelfScroll = useAnimatedScrollHandler\(\{\s*onScroll: \(event\) => \{\s*shelfScrollOffset\.value = event\.contentOffset\.x/)
  // A single-page shelf (1/1) has nothing to scroll: the page swipe works there.
  assert.match(closet, /const shelfOwnsHorizontalDrags = shouldShopShelfOwnHorizontalDrags\(productPages\.length\)/)
  assert.match(ownership, /if \(!nativeScrollGesture \|\| !enabled\) return children/)
  // Edge hand-off: a manual-activation pan decides on the UI thread; the
  // pager waits for it, and the native scroll waits for the pager.
  assert.match(ownership, /Gesture\.Native\(\)\.enabled\(enabled\)\.requireExternalGestureToFail\(pagerGestureRef\)/)
  assert.match(ownership, /Gesture\.Pan\(\)\s*\.enabled\(enabled\)\s*\.manualActivation\(true\)\s*\.blocksExternalGesture\(pagerGestureRef\)\s*\.simultaneousWithExternalGesture\(native\)/)
  assert.match(ownership, /const owner = resolveHorizontalScrollerDragOwner\(\{[\s\S]*?scrollOffset: scrollOffset\.value,\s*maxScrollOffset: maxOffset\.value\s*\}\)\s*if \(owner === "scroller"\) stateManager\.activate\(\)\s*else if \(owner === "release"\) stateManager\.fail\(\)/)
  // A 1/1 shelf turns the gestures off instead of unwrapping the scroller:
  // unwrapping would remount it at offset 0 with a stale shared offset.
  assert.match(ownership, /if \(!gestures\) return children/)
  assert.match(closet, /shelfScrollOffset\.value = 0\s*productScrollerRef\.current\?\.scrollToOffset\(\{ offset: 0, animated: false \}\)/)
  const handoffMove = ownership.slice(ownership.indexOf(".onTouchesMove("), ownership.indexOf("return { native, handoff }"))
  assert.match(handoffMove, /"worklet"/)
  assert.doesNotMatch(handoffMove, /scheduleOnRN|runOnJS/, "decided on the UI thread")
  const rail = read("../../features/shop/screen/VerticalShopCategoryRail.tsx")
  assert.match(rail, /<MainTabPagerHorizontalScrollOwner>\s*<ScrollView horizontal/)
  // No second ownership mechanism (flags, PanResponder capture) in the pager.
  assert.doesNotMatch(pager, /PanResponder|onMoveShouldSetResponderCapture|simultaneousWithExternalGesture/)
})

test("Discover card, room object drag and edge back never compete with the pager", () => {
  // Discover is swipeable; a drag that starts on the card stays a card swipe.
  assert.match(config, /key: "discover", routeName: "Lobby", swipeable: true/)
  assert.match(config, /MAIN_TAB_SWIPE_MIN_INDEX = 0\b/)
  const swipe = read("../../features/demo/useDiscoverCardSwipe.ts")
  assert.match(swipe, /const pagerGestureRef = useMainTabPagerGestureRef\(\)/)
  assert.match(swipe, /\.manualActivation\(true\)\s*\.blocksExternalGesture\(\.\.\.\(pagerGestureRef \? \[pagerGestureRef\] : \[\]\)\)/)
  // Room objects are dragged only on setup and editor routes, not on pages.
  const myRoom = read("../../screens/MyRoomScreen.tsx")
  assert.doesNotMatch(myRoom, /onItemLongPressMove=/)
  assert.match(read("../../screens/RoomSetupScreen.tsx"), /onItemLongPressMove=/)
  // The pager slot has no back gesture; detail routes above it keep theirs.
  assert.match(navigationModel, /MAIN_TAB_SCREEN_OPTIONS = \{[\s\S]*?gestureEnabled: false/)
  assert.match(navigator, /MAIN_TAB_ROUTE_NAMES\.map\(\(routeName\) => \([\s\S]*?\.\.\.MAIN_TAB_SCREEN_OPTIONS,\s*\.\.\.reducedMotionScreenOptions/)
})

test("Discover card swipe thresholds are unchanged", () => {
  // The swipe moved from PanResponder to a Gesture Handler pan; the thresholds
  // now live in the pure swipe model it shares with the deck.
  const model = read("../../features/discovery/discoverySwipeModel.ts")
  assert.match(model, /export const SWIPE_OUT_DURATION = 190\n/)
  assert.match(model, /export const SWIPE_CAPTURE_THRESHOLD = 4\n/)
  assert.match(model, /export const SWIPE_DIRECTION_DOMINANCE = 1\.1\n/)
  assert.match(model, /export const SWIPE_DISTANCE_RATIO = 0\.22\n/)
  assert.match(model, /export const SWIPE_FLICK_VELOCITY = 0\.55\n/)
  // Gesture Handler reports px/s; the threshold stays in PanResponder's px/ms.
  assert.match(model, /const velocityXPerMs = input\.velocityXPerSecond \/ 1000/)
  const swipe = read("../../features/demo/useDiscoverCardSwipe.ts")
  // A cancelled pan returns the card to rest, as onPanResponderTerminate did.
  assert.match(swipe, /if \(!success\) \{\s*resetPosition\(\)/)
  // The card owns its touch through the pan, which blocks the pager.
  assert.match(swipe, /Gesture\.Pan\(\)\s*\.enabled\(!disabled\)\s*\.manualActivation\(true\)/)
})

test("drag and settle frames stay on the UI thread; JS hears once per settle", () => {
  const onUpdate = pager.slice(pager.indexOf(".onUpdate("), pager.indexOf(".onEnd("))
  assert.doesNotMatch(onUpdate, /scheduleOnRN|runOnJS|set[A-Z]\w*\(/, "no JS work per frame")
  assert.match(onUpdate, /"worklet"/)
  // The only JS callbacks: neighbour mount at drag start, and the commit.
  const jsCalls = pager.match(/scheduleOnRN\((\w+)/g) ?? []
  assert.deepEqual(jsCalls.sort(), ["scheduleOnRN(commitPage", "scheduleOnRN(mountNeighbours"])
  assert.match(pager, /useAnimatedStyle\(\(\) => \(\{[\s\S]*?translateX: index \* width\.value - position\.value/)
  assert.match(pager, /withSpring\(/)
})

test("the bottom-bar indicator follows drags and settles on the UI thread", () => {
  // The pager publishes its fractional page position while a drag or settle
  // moves it; the bar reads it in a UI-thread reaction (no JS per frame).
  assert.match(pager, /useAnimatedReaction\(\s*\(\) => resolveMainTabPagerIndicatorSample\(/)
  assert.match(pager, /publishMainTabPagerIndicator\(/)
  const bottomNav = read("../../ui/bottomNav.tsx")
  // Reanimated subscribes to shared values in the prepare closure, so the
  // shared object is referenced there directly, not through a helper.
  assert.match(bottomNav, /useAnimatedReaction\(\s*\(\) => readMainTabPagerIndicatorProgress\(mainTabPagerIndicator\)/)
  assert.match(pager, /\(sample\) => publishMainTabPagerIndicator\(mainTabPagerIndicator, sample\)/)
  assert.doesNotMatch(bottomNav, /AccessibilityInfo/, "Reduce Motion comes from the shared store")
  // The pager index maps to the bar item index: both use the same order.
  const barKeys = [...bottomNav.slice(bottomNav.indexOf("const BOTTOM_NAV_ITEMS"), bottomNav.indexOf("export interface BottomNavProps"))
    .matchAll(/key: "(\w+)"/g)].map((match) => match[1])
  const pagerKeys = [...config.matchAll(/key: "(\w+)", routeName/g)].map((match) => match[1])
  assert.deepEqual(barKeys, pagerKeys)
  assert.deepEqual(barKeys, ["discover", "chats", "myroom", "shop"])
  assert.match(bottomNav, /useReducedMotion\(\)/)
})

test("the bottom bar is a tab list whose selected tab stays pressable for reselect", () => {
  const bottomNav = read("../../ui/bottomNav.tsx")
  const chrome = read("../useBottomNavChrome.ts")
  // A11Y-2: VoiceOver reads "Chats, tab, 2 of 4, selected" rather than a
  // button. The role and state supply "tab", the position and "selected",
  // so the accessible name is the localized tab label alone (no "Open …
  // tab" / "… sekmesi" wording, which would be read twice).
  assert.match(bottomNav, /accessibilityRole="tablist"/)
  assert.match(bottomNav, /accessibilityRole="tab"\s+accessibilityLabel=\{item\.label\}\s+accessibilityState=\{\{ selected: isCurrent \}\}/)
  assert.doesNotMatch(bottomNav, /accessibilityRole="button"/)
  assert.doesNotMatch(bottomNav, /getBottomNavAccessibilityLabel/)
  // MICRO-2: the selected tab is not disabled, so a second tap reaches the
  // chrome, which publishes a reselect (scroll to top) instead of navigating.
  // The reselect is silent: only a real tab change plays the selection haptic.
  assert.doesNotMatch(bottomNav, /disabled=\{isCurrent\}/)
  assert.match(bottomNav, /if \(!isCurrent\) hapticSelection\(\)\s+onPress\(\)/)
  assert.match(
    chrome,
    /if \(!shouldDispatchMainTabNavigation\(navigationRef\.getCurrentRoute\(\)\?\.name, destination\)\) \{\s*publishMainTabReselect\(key\)\s*return\s*\}/
  )
})

test("the bottom bar belongs to the pager's slot screen, beneath every pushed route", () => {
  // An iOS edge back reveals the slot screen under the finger. The bar is
  // part of that screen (as on Instagram), so it is already in place during
  // the whole interactive back gesture, is covered again when the gesture is
  // cancelled, and needs no route-state change or transition event to show.
  const rootChrome = read("../RootNavigationChrome.tsx")
  assert.match(pager, /bottomBar\?: ReactNode/)
  // Outside the pager's gesture detector: a drag on the bar never moves pages.
  assert.match(pager, /<\/MainTabPagerGestureProvider>\s*\{bottomBar\}\s*<\/View>/)
  assert.match(navigator, /<MainTabPager[\s\S]*?bottomBar=\{\s*<MainTabBottomBar\s+routeName=\{screenProps\.route\.name\}\s+onPress=\{handleBottomNavPress\}\s*\/>\s*\}/)
  // SYS-3: the bar reads the unread badge itself; the navigator never does.
  assert.match(rootChrome, /const chatCount = useMainTabChatBadgeCount\(\)/)
  assert.doesNotMatch(navigator, /useTotalUnreadCount|chatBadgeCount|useGlobalRealtime\(/)
  // SYS-2: one stable page renderer reaches the memoised pages.
  assert.match(navigator, /renderPage=\{renderPagerPage\}/)
  assert.match(navigator, /const renderPagerPage = useCallback\(/)
  assert.match(pager, /isSelected=\{index === selectedIndex\}/)
  assert.doesNotMatch(pager, /selectedIndex=\{selectedIndex\}/)
  // The slot route name is always the selected tab, even while covered.
  assert.match(rootChrome, /export const MainTabBottomBar = memo\(/)
  assert.match(rootChrome, /const currentBottomNavKey = getBottomNavKeyForRoute\(routeName\) \?\? "discover"/)
  // The root overlay (drawn above the whole stack) keeps the bar only on the
  // rollback path, where each tab is its own stack route.
  assert.match(rootChrome, /const overlayOwnsBottomNav = !MAIN_TAB_PAGER_ENABLED/)
  assert.match(rootChrome, /\{overlayOwnsBottomNav && sessionEntryRoute === "Main" && sessionActor && !isAccountRestricted && bottomNavRoutePresentation\.mounted \? \(/)
})

test("Reduce Motion uses the shared store and switches without finger-follow", () => {
  assert.match(pager, /import \{ useReducedMotion \} from "\.\.\/\.\.\/ui\/animations"/)
  assert.match(pager, /if \(reduceMotionValue\.value\) return/)
  assert.match(pager, /if \(reduceMotionValue\.value\) \{\s*animating\.value = false\s*position\.value = targetPosition/)
})

test("interruptions: backgrounding, Android back and layout changes settle on a valid page", () => {
  assert.match(pager, /AppState\.addEventListener\("change"[\s\S]*?reduceMainTabPagerSettleToCommitted/)
  assert.match(pager, /BackHandler\.addEventListener\("hardwareBackPress"/)
  assert.match(pager, /\.onBegin\([\s\S]*?cancelAnimation\(position\)/, "a touch catches a running settle")
})

test("one flag restores the stack-tab behaviour", () => {
  assert.match(config, /export const MAIN_TAB_PAGER_ENABLED: boolean = true/)
  assert.match(navigator, /UNSTABLE_router=\{MAIN_TAB_PAGER_ENABLED \? withMainTabPagerRouter : undefined\}/)
  // Every main tab keeps its own stack route; with the flag off each renders
  // its page directly instead of the pager.
  assert.match(config, /routeName: "Lobby"[\s\S]*?routeName: "Inbox"[\s\S]*?routeName: "MyRoom"[\s\S]*?routeName: "CosmeticShop"[\s\S]*?MAIN_TAB_ROUTE_NAMES[\s\S]*?MAIN_TAB_PAGES\.map\(\(page\) => page\.routeName\)/)
  assert.match(navigator, /MAIN_TAB_ROUTE_NAMES\.map\(\(routeName\) => \([\s\S]*?name=\{routeName\}[\s\S]*?\(screenProps\) => MAIN_TAB_PAGER_ENABLED \? \([\s\S]*?<MainTabPager[\s\S]*?\) : renderMainTabPage\(sessionActor, routeName, screenProps\)/)
  assert.match(chrome, /if \(MAIN_TAB_PAGER_ENABLED && requestMainTabPagerPage\(key\)\) return/)
  assert.match(chrome, /CommonActions\.navigate\(destination, undefined, \{\s*pop: true,\s*merge: true\s*\}\)/)
})

test("Gesture Handler has its root view", () => {
  assert.match(app, /<GestureHandlerRootView style=\{styles\.gestureRoot\}>/)
})
