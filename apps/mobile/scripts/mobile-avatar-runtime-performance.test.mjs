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

test("room avatar animation starts without a post-paint baseline state update", () => {
  assert.match(rendererSource, /const frameBaseline = useMemo\(/)
  assert.doesNotMatch(
    rendererSource,
    /\[frameBaseline,\s*setFrameBaseline\]\s*=\s*useState/
  )
})

test("static room avatar image layers are memoized across animation ticks", () => {
  assert.match(rendererSource, /const RoomAvatarLayerImage = memo\(/)
  assert.match(rendererSource, /<RoomAvatarLayerImage\b/)
  assert.match(rendererSource, /hasAnimatedLayerFrames/)
})

test("shared ticker preserves its frame when the last subscriber changes motion", () => {
  const unsubscribeStart = rendererSource.indexOf("return () => {")
  const snapshotStart = rendererSource.indexOf(
    "function getRoomAvatarFrameTickerSnapshot",
    unsubscribeStart
  )
  assert.ok(unsubscribeStart > 0)
  assert.ok(snapshotStart > unsubscribeStart)
  assert.doesNotMatch(
    rendererSource.slice(unsubscribeStart, snapshotStart),
    /roomAvatarFrameTickerStores\.delete/
  )
})

test("MiniRoom avoids duplicate synthetic motion and isolates unchanged avatars", () => {
  assert.match(avatarLayerSource, /const AvatarFigure = memo\(function AvatarFigure/)
  assert.match(avatarLayerSource, /usesAnimatedAvatarFrames/)
  assert.match(
    avatarLayerSource,
    /avatar\.motion !== "idle"\s*\|\|\s*usesAnimatedAvatarFrames/
  )
})

test("MiniRoom resolves expensive sitting asset readiness once before the frame loop", () => {
  const tickStart = miniRoomStoreSource.indexOf("const tick = () =>")
  const tickEnd = miniRoomStoreSource.indexOf(
    "animationFrameRef.current = requestAnimationFrame(tick)",
    tickStart
  )
  assert.ok(tickStart > 0)
  assert.ok(tickEnd > tickStart)

  const preTick = miniRoomStoreSource.slice(0, tickStart)
  const tickBody = miniRoomStoreSource.slice(tickStart, tickEnd)
  assert.match(preTick, /const arrivalMotion[\s\S]*canMiniRoomAvatarUseMotion/)
  assert.doesNotMatch(tickBody, /canMiniRoomAvatarUseMotion/)
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
      new RegExp(`const ${componentName} = memo\\(`)
    )
  }
  assert.match(
    miniRoomSceneSource,
    /const RoomChatComposer = memo\(function RoomChatComposer/
  )
  assert.match(miniRoomSceneSource, /const handleRoomPress = useCallback\(/)
  assert.match(miniRoomSceneSource, /const handleSendReaction = useCallback\(/)
})
