import assert from "node:assert/strict"
import test, { afterEach } from "node:test"

import type { RoomAvatar25dResolveInput, RoomAvatar25dSpec } from "../avatar/roomAvatarSeamContract"

// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS fixture loading requires static require.
const { installRoomAvatarSeam, roomAvatar25d } = require("../avatar/roomAvatarSeam") as typeof import("../avatar/roomAvatarSeam")
const {
  canMiniRoomAvatarUseMotion,
  getMiniRoomAvatar25dSpec
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS fixture loading requires static require.
} = require("./miniRoomAvatarMotion") as typeof import("./miniRoomAvatarMotion")

const SPEC = { rig: "girl" } as unknown as RoomAvatar25dSpec
const LOADOUT = { topId: "worn-top" }
const appearance = { base: "female_base_01" as const, snapshotSource: "avatar_v2_current_user" as const, avatarLoadout: LOADOUT }

/** Installs a seam whose resolver draws only the listed states; returns every input it was asked about. */
function installDrawable(drawable: readonly string[]) {
  const asked: RoomAvatar25dResolveInput[] = []
  const restore = installRoomAvatarSeam({
    ...roomAvatar25d,
    resolveRoomAvatar25d: (input) => {
      asked.push(input)
      return input.state !== undefined && drawable.includes(input.state) ? SPEC : null
    }
  })
  restoreSeam = restore
  return asked
}

let restoreSeam: (() => void) | null = null
afterEach(() => {
  restoreSeam?.()
  restoreSeam = null
})

test("the avatar's whole 2.5D spec is asked for with the worn loadout, the pose and the facing", () => {
  const asked = installDrawable(["idle", "walking", "sitting"])

  assert.equal(getMiniRoomAvatar25dSpec({ appearance, motion: "walking", facing: "left" }), SPEC)
  assert.deepEqual(asked, [{ loadout: LOADOUT, state: "walking", direction: "left" }])
})

test("walking and sitting are drawable when the renderer resolves that pose (production snapshot path)", () => {
  installDrawable(["idle", "walking", "sitting"])

  for (const motion of ["walking", "sitting"] as const) {
    assert.equal(canMiniRoomAvatarUseMotion({ appearance, motion, facing: "front" }), true, motion)
  }
})

test("speaking is asked for as the standing idle pose", () => {
  const asked = installDrawable(["idle"])

  assert.equal(canMiniRoomAvatarUseMotion({ appearance, motion: "speaking", facing: "front" }), true)
  getMiniRoomAvatar25dSpec({ appearance, motion: "speaking", facing: "front" })
  assert.ok(asked.every((input) => input.state === "idle"))
})

test("a greeting emote is drawn as the rig's wave, and as standing when the wave has no art", () => {
  const asked = installDrawable(["idle", "waving"])
  assert.equal(getMiniRoomAvatar25dSpec({ appearance, motion: "emoting", facing: "left" }), SPEC)
  assert.deepEqual(asked, [{ loadout: LOADOUT, state: "waving", direction: "left" }])

  restoreSeam?.()
  const standingOnly = installDrawable(["idle"])
  assert.equal(getMiniRoomAvatar25dSpec({ appearance, motion: "emoting", facing: "front" }), SPEC)
  assert.deepEqual(standingOnly.map((input) => input.state), ["waving", "idle"])
})

test("an avatar missing art for one pose keeps the others: only that pose is refused", () => {
  installDrawable(["idle", "walking"])

  assert.equal(canMiniRoomAvatarUseMotion({ appearance, motion: "walking", facing: "front" }), true)
  assert.equal(canMiniRoomAvatarUseMotion({ appearance, motion: "sitting", facing: "front" }), false)
  assert.equal(getMiniRoomAvatar25dSpec({ appearance, motion: "sitting", facing: "front" }), null)
})

test("with no installed renderer (or an old snapshot with only layers) standing is allowed and no other pose is", () => {
  const legacyAppearance = {
    base: "male_base_01" as const,
    snapshotSource: "partner_preview_fallback" as const,
    roomAvatarLayers: [{ id: "legacy-layer" }] as never[]
  }

  assert.equal(canMiniRoomAvatarUseMotion({ appearance: legacyAppearance, motion: "idle", facing: "front" }), true)
  for (const motion of ["walking", "sitting"] as const) {
    assert.equal(canMiniRoomAvatarUseMotion({ appearance: legacyAppearance, motion, facing: "front" }), false, motion)
  }
})
