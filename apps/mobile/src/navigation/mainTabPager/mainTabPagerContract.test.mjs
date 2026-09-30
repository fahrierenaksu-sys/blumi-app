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
  assert.match(pager, /\.enabled\(swipeEnabled\)/, "disabled while a non-swipeable page (Discover) is selected")
  assert.match(pager, /const swipeEnabled = selectedPage\.swipeable/)
})

test("horizontal sub-content owns its drags through one Gesture Handler relation", () => {
  assert.match(ownership, /Gesture\.Native\(\)\.blocksExternalGesture\(pagerGestureRef\)/)
  assert.match(pager, /\.withRef\(pagerGestureRef\)/)
  assert.match(pager, /<MainTabPagerGestureProvider value=\{pagerGestureRef\}>/)
  const closet = read("../../features/shop/screen/ClosetBrowser.tsx")
  assert.match(closet, /<MainTabPagerHorizontalScrollOwner>\s*<FlatList[\s\S]*?horizontal[\s\S]*?pagingEnabled[\s\S]*?<\/MainTabPagerHorizontalScrollOwner>/)
  const rail = read("../../features/shop/screen/VerticalShopCategoryRail.tsx")
  assert.match(rail, /<MainTabPagerHorizontalScrollOwner>\s*<ScrollView horizontal/)
  // No second ownership mechanism (flags, PanResponder capture) in the pager.
  assert.doesNotMatch(pager, /PanResponder|onMoveShouldSetResponderCapture|simultaneousWithExternalGesture/)
})

test("Discover card, room object drag and edge back never compete with the pager", () => {
  assert.match(config, /key: "discover", routeName: "Lobby", swipeable: false/)
  // Room objects are dragged only on setup and editor routes, not on pages.
  const myRoom = read("../../screens/MyRoomScreen.tsx")
  assert.doesNotMatch(myRoom, /onItemLongPressMove=/)
  assert.match(read("../../screens/RoomSetupScreen.tsx"), /onItemLongPressMove=/)
  // The pager slot has no back gesture; detail routes above it keep theirs.
  assert.match(navigationModel, /MAIN_TAB_SCREEN_OPTIONS = \{[\s\S]*?gestureEnabled: false/)
  assert.match(navigator, /MAIN_TAB_ROUTE_NAMES\.map\(\(routeName\) => \([\s\S]*?options=\{\{ \.\.\.MAIN_TAB_SCREEN_OPTIONS, \.\.\.reducedMotionScreenOptions \}\}/)
})

test("Discover card swipe thresholds are unchanged", () => {
  const card = read("../../features/demo/SwipeableDiscoverCard.tsx")
  assert.match(card, /const SWIPE_OUT_DURATION = 190\n/)
  assert.match(card, /const SWIPE_CAPTURE_THRESHOLD = 4\n/)
  assert.match(card, /const SWIPE_DIRECTION_DOMINANCE = 1\.1\n/)
  assert.match(card, /const SWIPE_DISTANCE_RATIO = 0\.22\n/)
  assert.match(card, /const SWIPE_FLICK_VELOCITY = 0\.55\n/)
  assert.match(card, /onPanResponderTerminate: resetPosition/)
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
  assert.match(navigator, /\{MAIN_TAB_PAGER_ENABLED \? \(/)
  for (const name of ["Lobby", "Inbox", "MyRoom", "CosmeticShop"]) {
    assert.match(navigator, new RegExp(`name="${name}"[\\s\\S]*?renderMainTabPage\\(sessionActor, "${name}", screenProps\\)`), `${name} keeps its stack route`)
  }
  assert.match(chrome, /if \(MAIN_TAB_PAGER_ENABLED && requestMainTabPagerPage\(key\)\) return/)
  assert.match(chrome, /CommonActions\.navigate\(destination, undefined, \{\s*pop: true,\s*merge: true\s*\}\)/)
})

test("Gesture Handler has its root view", () => {
  assert.match(app, /<GestureHandlerRootView style=\{styles\.gestureRoot\}>/)
})
