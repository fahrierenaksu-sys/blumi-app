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
  const source = readSwipeCardSource()

  assert.match(source, /onStartShouldSetPanResponder:\s*\(\)\s*=>\s*false/)
  assert.match(source, /onMoveShouldSetPanResponderCapture:\s*shouldClaimSwipe/)
  assert.match(source, /Math\.abs\(gesture\.dx\)\s*>\s*SWIPE_CAPTURE_THRESHOLD/)
  assert.match(source, /Math\.abs\(gesture\.dx\)\s*>\s*Math\.abs\(gesture\.dy\)\s*\*\s*SWIPE_DIRECTION_DOMINANCE/)
  assert.match(source, /const SWIPE_CAPTURE_THRESHOLD = 4/)
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

  assert.match(source, /const SWIPE_OUT_DURATION = 190/)
  assert.match(source, /useReducedMotion\(\)/)
  assert.match(source, /duration:\s*reduceMotion \? 0 : SWIPE_OUT_DURATION/)
  assert.match(source, /if \(disabled \|\| reduceMotion\)/)
  assert.match(source, /useNativeDriver:\s*true/)
})

test("an interrupted gesture always returns the active card to rest", () => {
  const source = readSwipeCardSource()

  assert.match(source, /onPanResponderTerminate:\s*resetPosition/)
  assert.match(source, /onPanResponderTerminationRequest:\s*\(\) => false/)
})

test("a deliberate short swipe can complete without a hard throw", () => {
  const source = readSwipeCardSource()

  assert.match(source, /const SWIPE_DISTANCE_RATIO = 0\.22/)
  assert.match(source, /const SWIPE_FLICK_VELOCITY = 0\.55/)
  assert.match(source, /screenWidth \* SWIPE_DISTANCE_RATIO/)
})

test("the active card translates without rotating at every drag distance", () => {
  const source = readSwipeCardSource()

  assert.doesNotMatch(source, /const rotate = position\.x\.interpolate/)
  assert.doesNotMatch(source, /\{ rotate \}/)
  assert.match(
    source,
    /transform:\s*\[[\s\S]*?translateX:\s*position\.x[\s\S]*?translateY:\s*position\.y[\s\S]*?rotate:\s*"0deg"/
  )
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

  assert.doesNotMatch(source, /const middleCardRotate = swipeAnim\.x\.interpolate/)
  assert.match(
    source,
    /styles\.middleCardContainer[\s\S]*?translateX:\s*middleCardTranslateX[\s\S]*?translateY:\s*middleCardTranslateY[\s\S]*?rotate:\s*"0deg"[\s\S]*?scale:\s*middleCardScale/
  )
  assert.match(
    source,
    /bottomCardContainer:[\s\S]*?rotate:\s*"-3deg"/
  )
})
