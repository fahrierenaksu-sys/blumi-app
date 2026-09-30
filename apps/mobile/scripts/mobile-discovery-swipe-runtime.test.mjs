import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function readSwipeCardSource() {
  return readFileSync(
    resolve(mobileRoot, "src/features/demo/SwipeableDiscoverCard.tsx"),
    "utf8"
  )
}

// The swipe moved from PanResponder to a Gesture Handler pan on the UI thread
// (useDiscoverCardSwipe) with its rules in discoverySwipeModel; these pins
// follow the rules to their new home.
function readSwipeHookSource() {
  return readFileSync(
    resolve(mobileRoot, "src/features/demo/useDiscoverCardSwipe.ts"),
    "utf8"
  )
}

function readSwipeModelSource() {
  return readFileSync(
    resolve(mobileRoot, "src/features/discovery/discoverySwipeModel.ts"),
    "utf8"
  )
}

function readDeckSource() {
  return readFileSync(
    resolve(mobileRoot, "src/features/discovery/DiscoveryDeckView.tsx"),
    "utf8"
  )
}

function readLobbySource() {
  return readFileSync(
    resolve(mobileRoot, "src/screens/LobbyScreen.tsx"),
    "utf8"
  )
}

test("discover swipe waits for a horizontal-dominant move before claiming touch", () => {
  const hook = readSwipeHookSource()
  const model = readSwipeModelSource()

  assert.match(hook, /\.manualActivation\(true\)/)
  assert.match(hook, /shouldClaimDiscoverSwipe\(touch\.absoluteX - touchStartX\.value, touch\.absoluteY - touchStartY\.value\)[\s\S]*?stateManager\.activate\(\)/)
  assert.match(model, /Math\.abs\(dx\)\s*>\s*SWIPE_CAPTURE_THRESHOLD/)
  assert.match(model, /Math\.abs\(dx\)\s*>\s*Math\.abs\(dy\)\s*\*\s*SWIPE_DIRECTION_DOMINANCE/)
  assert.match(model, /const SWIPE_CAPTURE_THRESHOLD = 4/)
})

test("the lobby locks a clearly horizontal card gesture before vertical scrolling can steal it", () => {
  assert.match(readLobbySource(), /<ScrollView[\s\S]{0,240}directionalLockEnabled/)
})

test("only the active card receives a one-shot arrival pulse", () => {
  const source = readSwipeCardSource()

  assert.match(source, /if\s*\(disabled \|\| reduceMotion\)\s*\{[\s\S]*?pulseAnim\.setValue\(0\.78\)/)
  assert.match(source, /const arrivalPulse = Animated\.sequence\(/)
  assert.doesNotMatch(source, /Animated\.loop\(/)
  assert.match(source, /return \(\) => \{[\s\S]*?arrivalPulse\.stop\(\)[\s\S]*?pulseAnim\.stopAnimation\(\)/)
  assert.match(source, /\[disabled, profile\.userId, pulseAnim, reduceMotion\]/)
})

test("swipe exit stays responsive and honors reduced-motion", () => {
  const source = readSwipeCardSource()
  const hook = readSwipeHookSource()

  assert.match(readSwipeModelSource(), /const SWIPE_OUT_DURATION = 190/)
  assert.match(source, /useReducedMotion\(\)/)
  assert.match(hook, /duration:\s*reduceMotion \? 0 : SWIPE_OUT_DURATION/)
  assert.match(hook, /x\.value = reduceMotion\s*\?\s*0\s*:\s*withSpring\(0/)
  assert.match(source, /if \(disabled \|\| reduceMotion\)/)
  assert.match(source, /useNativeDriver:\s*true/)
})

test("an interrupted gesture always returns the active card to rest", () => {
  const hook = readSwipeHookSource()

  assert.match(hook, /\.onEnd\(\(event, success\) => \{[\s\S]*?if \(!success\) \{\s*resetPosition\(\)/)
  assert.match(hook, /if \(finished\) scheduleOnRN\(commitSwipe, direction\)/)
})

test("a deliberate short swipe can complete without a hard throw", () => {
  const model = readSwipeModelSource()

  assert.match(model, /const SWIPE_DISTANCE_RATIO = 0\.22/)
  assert.match(model, /const SWIPE_FLICK_VELOCITY = 0\.55/)
  assert.match(model, /screenWidth \* SWIPE_DISTANCE_RATIO/)
})

test("the active card translates without rotating at every drag distance", () => {
  const source = readSwipeCardSource()
  const hook = readSwipeHookSource()

  assert.doesNotMatch(source, /const rotate = /)
  assert.doesNotMatch(source, /\{ rotate \}/)
  assert.doesNotMatch(hook, /rotate/)
  assert.match(hook, /transform: \[\{ translateX: getDiscoverSwipeTranslateX\(ownerId\.value, cardId, x\.value\) \}\]/)
  assert.match(source, /<Reanimated\.View style=\{\[styles\.swipeFrame, cardSwipeStyle\]\}>/)
  assert.match(source, /transform:\s*\[\s*\{ rotate: "0deg" \},/)
})

test("card face transition is a complete native-safe 3D turn", () => {
  const source = readSwipeCardSource()

  assert.match(source, /const frontRotation = flipProgress\.interpolate/)
  assert.match(source, /const backRotation = flipProgress\.interpolate/)
  assert.match(source, /rotateY: frontRotation/)
  assert.match(source, /rotateY: backRotation/)
  assert.match(source, /backfaceVisibility:\s*["']hidden["']/)
  assert.match(source, /perspective:\s*1000/)
  assert.match(source, /styles\.backFace/)
  assert.match(source, /styles\.flipSheen/)
  assert.doesNotMatch(source, /frontOpacity|backOpacity|frontScale|backScale/)
})

test("the next card stays upright while it advances and only deeper cards fan out", () => {
  const source = readDeckSource()

  assert.doesNotMatch(source, /middleCardRotate/)
  assert.match(
    source,
    /getDiscoverMiddleCardMotion\([\s\S]*?translateX: middle\.translateX[\s\S]*?translateY: middle\.translateY[\s\S]*?rotate: "0deg"[\s\S]*?scale: middle\.scale/
  )
  assert.match(
    source,
    /BOTTOM_CARD_MOTION = \{[\s\S]*?rotate:\s*"-3deg"/
  )
})
