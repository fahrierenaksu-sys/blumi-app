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

  const model = readSwipeModelSource()
  // DISC-1: the exit follows the release speed between 120 and 260 ms
  // (values asserted in discoverySwipeModel.test.ts); Reduce Motion is instant.
  assert.match(model, /const SWIPE_OUT_MIN_DURATION = 120/)
  assert.match(model, /const SWIPE_OUT_MAX_DURATION = 260/)
  assert.match(source, /useReducedMotion\(\)/)
  assert.match(hook, /forceSwipe\(release, reduceMotion \? 0 : getDiscoverSwipeOutDuration\(/)
  assert.match(hook, /duration: durationMs,\s*easing: Easing\.out\(Easing\.quad\)/)
  assert.match(hook, /x\.value = reduceMotion\s*\?\s*0\s*:\s*withSpring\(0/)
  assert.match(source, /if \(disabled \|\| reduceMotion\)/)
  assert.match(source, /useNativeDriver:\s*true/)
})

test("an interrupted gesture always returns the active card to rest", () => {
  const hook = readSwipeHookSource()

  assert.match(hook, /\.onEnd\(\(event, success\) => \{[\s\S]*?if \(!success\) \{\s*resetPosition\(\)/)
  // DSC-10: the release commits (haptic + decision) at once; the card then
  // flies out on its own value and only reports the end of its exit.
  assert.match(hook, /scheduleOnRN\(hapticLight\)\s*forceSwipe\(release, [\s\S]*?\)\s*scheduleOnRN\(commitSwipe, release\)/)
  assert.match(hook, /if \(finished\) scheduleOnRN\(finishExit\)/)
  assert.doesNotMatch(hook, /if \(finished\) scheduleOnRN\(commitSwipe/)
})

test("a deliberate short swipe can complete without a hard throw", () => {
  const model = readSwipeModelSource()

  assert.match(model, /const SWIPE_DISTANCE_RATIO = 0\.22/)
  assert.match(model, /const SWIPE_FLICK_VELOCITY = 0\.55/)
  assert.match(model, /screenWidth \* SWIPE_DISTANCE_RATIO/)
})

// DISC-1 replaced the upright card with a lean that follows the drag on the UI
// thread. Only the owning card leans (its translateX is the owned drag), the
// lean is read from the drag rather than React state, and Reduce Motion keeps
// the card upright. The chibi artwork inside the card is not transformed.
test("only the active card leans with its drag, and Reduce Motion keeps it upright", () => {
  const source = readSwipeCardSource()
  const hook = readSwipeHookSource()

  assert.match(
    hook,
    /const translateX = exiting\.value \? exitX\.value : getDiscoverSwipeTranslateX\(ownerId\.value, cardId, x\.value\)[\s\S]*?transform: \[\s*\{ translateX \},\s*\{ rotate: `\$\{reduceMotion \? 0 : getDiscoverSwipeRotation\(translateX, screenWidth, grabbedLowerHalf\.value\)\}deg` \}/
  )
  // The grab half is fixed when the pan activates, so a tap never changes it.
  assert.match(hook, /\.onStart\([\s\S]*?grabbedLowerHalf\.value = isDiscoverSwipeLowerHalfGrab\(touchStartLocalY\.value, cardHeight\.value\)/)
  assert.match(source, /<Reanimated\.View style=\{\[styles\.swipeFrame, cardSwipeStyle\]\} onLayout=\{onCardLayout\}>/)
  // The inner card keeps no rotation of its own; the swipe frame owns the lean.
  assert.doesNotMatch(source, /\{ rotate: "0deg" \}/)
  assert.doesNotMatch(source, /const rotate = /)
})

test("a threshold entry pops the stamp only when motion is allowed", () => {
  const hook = readSwipeHookSource()

  assert.match(hook, /if \(reduceMotion\) return\s*stampScale\.value = withSequence\(/)
  assert.match(hook, /opacity: getDiscoverStampOpacity\([\s\S]*?\)\.like,\s*transform: \[\{ scale: stampScale\.value \}\]/)
  assert.match(hook, /opacity: getDiscoverStampOpacity\([\s\S]*?\)\.nope,\s*transform: \[\{ scale: stampScale\.value \}\]/)
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
  const model = readSwipeModelSource()

  assert.doesNotMatch(source, /middleCardRotate/)
  // The middle pose follows the drag and is upright (rotate 0 at progress 1,
  // asserted in discoverySwipeModel.test.ts); only the bottom slot turns.
  assert.match(
    source,
    /getDiscoverDeckRoleMotion\(roleProgress\.value, getDiscoverDeckDragMotion\(role, dragX, promotedDragX\.value\)\)[\s\S]*?translateX: motion\.translateX[\s\S]*?translateY: motion\.translateY[\s\S]*?rotate: `\$\{motion\.rotateDeg\}deg`[\s\S]*?scale: motion\.scale/
  )
  assert.match(model, /if \(role === "middle"\) return getDiscoverMiddleCardMotion\(dragX\)/)
  assert.match(model, /rotateDeg: mix\(DISCOVER_BOTTOM_CARD_MOTION\.rotateDeg, 0, clamped\)/)
  assert.match(
    model,
    /DISCOVER_BOTTOM_CARD_MOTION = \{[\s\S]*?rotateDeg:\s*-3\b/
  )
})
