import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8")
}

const rendererSource = read(
  "src/features/avatarV2/room/components/RoomAvatarRenderer2D.tsx"
)
const avatarLayerSource = read(
  "src/features/miniRoom/scene/AvatarLayer.tsx"
)
const miniRoomStoreSource = read(
  "src/features/miniRoom/scene/miniRoomSceneStore.ts"
)
const miniRoomSceneSource = read(
  "src/features/miniRoom/scene/MiniRoomScene.tsx"
)

// The avatar frame ticker moved to the UI thread (see
// room-avatar-renderer-subscription.test.mjs); these pin the same guarantees
// on the new implementation.
test("room avatar animation starts at frame 0 without a post-paint state update", () => {
  assert.doesNotMatch(rendererSource, /useState\(/)
  assert.match(rendererSource, /if \(current\.signature !== signature\) \{[\s\S]*?baseTick\.value = tick[\s\S]*?index: 0/)
  assert.match(rendererSource, /const frameIndex = state\.signature === signature \? state\.index : 0/)
})

test("room avatar layers are memoized and mount each distinct frame image once", () => {
  assert.match(rendererSource, /const RoomAvatarLayer = memo\(/)
  assert.match(rendererSource, /<RoomAvatarLayer\b/)
  assert.match(rendererSource, /getRoomAvatarLayerFrameSlots\(layer\)/)
})

test("avatars share one frame clock phase from the UI frame timestamp", () => {
  assert.match(rendererSource, /getRoomAvatarFrameTick\(frameInfo\.timestamp, frameDurationMs\)/)
  assert.doesNotMatch(rendererSource, /roomAvatarFrameTickerStores/)
})

test("MiniRoom avoids duplicate synthetic motion and isolates unchanged avatars", () => {
  assert.match(avatarLayerSource, /const AvatarFigure = memo\(function AvatarFigure/)
  assert.match(avatarLayerSource, /usesAnimatedAvatarFrames/)
  assert.match(
    avatarLayerSource,
    /avatar\.motion !== "idle"\s*\|\|\s*usesAnimatedAvatarFrames/
  )
})

test("MiniRoom resolves expensive sitting asset readiness once before the movement run", () => {
  const runStart = miniRoomStoreSource.indexOf("run = startMiniRoomMovementRun({")
  const runEnd = miniRoomStoreSource.indexOf(
    "activeMovementRef.current = run",
    runStart
  )
  assert.ok(runStart > 0)
  assert.ok(runEnd > runStart)

  const preRun = miniRoomStoreSource.slice(0, runStart)
  const runCallbacks = miniRoomStoreSource.slice(runStart, runEnd)
  assert.match(preRun, /const arrivalMotion[\s\S]*canMiniRoomAvatarUseMotion/)
  assert.doesNotMatch(runCallbacks, /canMiniRoomAvatarUseMotion/)
})

test("MiniRoom walking runs on the UI thread and commits React state only on pose changes", () => {
  assert.doesNotMatch(miniRoomStoreSource, /requestAnimationFrame|setInterval\(/)
  assert.match(miniRoomStoreSource, /onSegmentStart:[\s\S]*?onSegmentEnd:[\s\S]*?onArrival:/)
  // Every avatar is positioned from its live shared values, not from React state.
  assert.match(avatarLayerSource, /const anchorStyle = useAnimatedStyle\(\(\) => \(\{\s*left: `\$\{position\.x\.value \* 100\}%`,\s*top: `\$\{position\.y\.value \* 100\}%`/)
  assert.match(avatarLayerSource, /transform: \[\{ scale: 0\.9 \+ position\.y\.value \* 0\.2 \}\]/)
  assert.doesNotMatch(avatarLayerSource, /left: `\$\{avatar\.x \* 100\}%`/)
  assert.doesNotMatch(avatarLayerSource, /const depthScale = 0\.9 \+ avatar\.y/)
})

test("MiniRoom movement actions stay stable while avatar coordinates tick", () => {
  assert.match(miniRoomStoreSource, /const avatarsRef = useRef\(/)
  assert.match(miniRoomStoreSource, /const currentAvatars = avatarsRef\.current/)

  const runMovementStart = miniRoomStoreSource.indexOf(
    "const runMovement = useCallback("
  )
  const moveLocalAvatarStart = miniRoomStoreSource.indexOf(
    "const moveLocalAvatar = useCallback("
  )
  assert.ok(runMovementStart > 0)
  assert.ok(moveLocalAvatarStart > runMovementStart)
  assert.doesNotMatch(
    miniRoomStoreSource.slice(runMovementStart, moveLocalAvatarStart),
    /\[avatars,\s*geometry/
  )
})

test("MiniRoom movement rerenders only the live avatar layer", () => {
  for (const componentName of [
    "StableMiniRoomRoomDecorLayer",
    "StableRoomMapLayer",
    "StableHotspotLayer",
    "StableMiniRoomHud"
  ]) {
    assert.match(
      miniRoomSceneSource,
      new RegExp(`(?:const |, )${componentName} = memo\\(`)
    )
  }
  // The composer lives in its own view (2026-10-01); the scene mounts it.
  assert.match(
    read("src/features/miniRoom/scene/RoomChatComposer.tsx"),
    /export const RoomChatComposer = memo\(function RoomChatComposer/
  )
  assert.match(miniRoomSceneSource, /<RoomChatComposer\b/)
  assert.match(miniRoomSceneSource, /const handleRoomPress = useCallback\(/)
})
