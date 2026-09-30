import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function read(relativePath) {
  return readFileSync(resolve(mobileRoot, relativePath), "utf8")
}

test("MiniRoom renderer resolves layers from live motion and facing", () => {
  const avatarLayer = read("src/features/miniRoom/scene/AvatarLayer.tsx")

  assert.match(avatarLayer, /getMiniRoomAvatarRenderLayers\(\{[\s\S]*?motion:\s*avatar\.motion[\s\S]*?facing:\s*avatar\.facing/)
  assert.match(avatarLayer, /usesAnimatedWalkingFrames/)
  assert.match(avatarLayer, /avatar\.motion !== "walking"\s*\|\|\s*usesAnimatedWalkingFrames/)
  assert.doesNotMatch(avatarLayer, /RoomAvatarRenderer2D layers=\{avatar\.appearance\.roomAvatarLayers\}/)
})

test("MiniRoom sitting gate evaluates the requested sitting slice", () => {
  const store = read("src/features/miniRoom/scene/miniRoomSceneStore.ts")
  const screen = read("src/screens/MiniRoomScreen.tsx")
  const currentUser = read("src/features/miniRoom/currentUserAvatarSnapshot.ts")
  const partner = read("src/features/miniRoom/partnerAvatarSnapshot.ts")

  assert.match(store, /canMiniRoomAvatarUseMotion\(\{[\s\S]*?motion:\s*"sitting"/)
  assert.doesNotMatch(store, /layers:\s*avatar\.appearance\.roomAvatarLayers/)
  assert.match(screen, /createCurrentUserAvatarSnapshot/)
  assert.match(currentUser, /roomAvatarAppearance:\s*appearance/)
  assert.match(partner, /roomAvatarAppearance:\s*appearance/)
})

test("MiniRoom UI-thread walking keeps the RoomWorld speed, curve and Reduce Motion behaviour", async () => {
  const positions = read("src/features/miniRoom/scene/miniRoomAvatarPositions.ts")
  const runtime = read("src/features/roomWorld/roomWorldRuntime.ts")

  // Same duration per segment (speed and paths come from the unchanged RoomWorld plan).
  assert.match(positions, /duration: segment\.durationMs/)
  assert.match(positions, /withTiming\(segment\.to\.x, config,/)
  assert.match(positions, /withTiming\(segment\.to\.y, config\)/)
  // Walking is state-essential: Reanimated must not skip it under the system setting.
  assert.match(positions, /reduceMotion: ReduceMotion\.Never/)
  assert.match(positions, /export const MINI_ROOM_MOVEMENT_EASING = Easing\.out\(Easing\.cubic\)/)

  // Easing.out(Easing.cubic) is the RoomWorld ease-out cubic the JS loop used.
  assert.match(runtime, /return 1 - Math\.pow\(1 - value, 3\)/)
  const { Easing } = await import("react-native-reanimated/lib/module/Easing.js")
  const reanimatedCurve = Easing.out(Easing.cubic)
  for (let step = 0; step <= 100; step += 1) {
    const t = step / 100
    assert.ok(Math.abs(reanimatedCurve(t) - (1 - Math.pow(1 - t, 3))) < 1e-12, `curve differs at ${t}`)
  }
})

test("MiniRoom partner arrival highlight is a finite one-shot sequence", () => {
  const avatarLayer = read("src/features/miniRoom/scene/AvatarLayer.tsx")
  const effectStart = avatarLayer.indexOf("if (!showJoinPulse || !motionPolicy.animateJoin)")
  const effectEnd = avatarLayer.indexOf("const depthScale", effectStart)

  assert.notEqual(effectStart, -1)
  assert.notEqual(effectEnd, -1)

  const joinEffect = avatarLayer.slice(effectStart, effectEnd)
  assert.match(joinEffect, /Animated\.sequence\(/)
  assert.match(joinEffect, /MINI_ROOM_PARTNER_ARRIVAL_MS/)
  assert.doesNotMatch(joinEffect, /Animated\.loop\(/)
})
