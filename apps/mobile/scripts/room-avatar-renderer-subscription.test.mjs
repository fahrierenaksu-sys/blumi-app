import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const rendererSource = readFileSync(
  new URL("../src/features/avatarV2/room/components/RoomAvatarRenderer2D.tsx", import.meta.url),
  "utf8"
)

// Frame selection moved from a JS setInterval ticker + useSyncExternalStore
// (a React render of every mounted avatar per tick) to one UI-thread frame
// callback per avatar that flips frame-image opacity.
test("room avatar frames advance on the UI thread, not through React renders", () => {
  assert.match(rendererSource, /const advanceFrame = useCallback\(\(frameInfo: FrameInfo\): void => \{\s*"worklet"/)
  // autostart is read once by useFrameCallback; the clock follows hasAnimation explicitly.
  assert.match(rendererSource, /const frameClock = useFrameCallback\(advanceFrame, false\)/)
  assert.match(rendererSource, /frameClock\.setActive\(hasAnimation\)\s*\}, \[advanceFrame, frameClock, hasAnimation\]\)/)
  assert.match(rendererSource, /getRoomAvatarFrameTick\(frameInfo\.timestamp, frameDurationMs\)/)
  assert.doesNotMatch(rendererSource, /useSyncExternalStore|setInterval\(/)
  const advanceFrame = rendererSource.slice(rendererSource.indexOf("const advanceFrame"), rendererSource.indexOf("const frameClock"))
  assert.doesNotMatch(advanceFrame, /setRetainedAssets|setState|scheduleOnRN/)
})

test("frame images switch by animated opacity and stay mounted", () => {
  assert.match(rendererSource, /const visibility = useAnimatedStyle\(/)
  assert.match(rendererSource, /getRoomAvatarReadyFrameSlot\(slotByFrame, frameIndex, displayedSlots\.value, -1\)/)
  assert.match(rendererSource, /if \(readySlot >= 0\) selectedSlot\.value = readySlot/)
  assert.match(rendererSource, /opacity: selectedSlot\.value === slot \? 1 : 0/)
  assert.match(rendererSource, /<Animated\.View pointerEvents="none" style=\{\[styles\.layer, visibility\]\}>/)
  assert.match(rendererSource, /retainRoomAvatarFrameSlots\(/)
  assert.match(rendererSource, /source=\{asset\.source\}/)
  assert.match(rendererSource, /onDisplay=\{\(\) => \{\s*displayedSlots\.modify/)
})
