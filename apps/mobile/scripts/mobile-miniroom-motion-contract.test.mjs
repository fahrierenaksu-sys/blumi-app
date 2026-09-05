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
