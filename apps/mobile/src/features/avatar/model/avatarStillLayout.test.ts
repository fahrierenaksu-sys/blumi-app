import assert from "node:assert/strict"
import test from "node:test"
import { AVATAR_STILL_MANIFEST, DEFAULT_FEMALE_AVATAR_LOADOUT, resolveAvatarStillLayers } from "@blumi/domain"
import { avatarStillWindow, layoutAvatarStill } from "./avatarStillLayout"

test("the crop window is fitted inside the box and centred; every layer keeps its baked place", () => {
  const still = resolveAvatarStillLayers(DEFAULT_FEMALE_AVATAR_LOADOUT, "full")
  const body = AVATAR_STILL_MANIFEST.bodies.female
  const window = avatarStillWindow(still, "full")
  const layout = layoutAvatarStill(still, window, { width: 200, height: 400 }, body)
  assert.equal(layout.scale, Math.min(200 / window[2], 400 / window[3]))
  assert.equal(layout.frames.length, still.layers.length)
  const [first] = still.layers
  const frame = layout.frames[0]!
  assert.ok(Math.abs(frame.width - first!.rect[2] * layout.scale) < 1e-9)
  // the ground point and the figure height the live canvas anchors on are the still's own
  assert.ok(layout.ground && layout.figureHeight)
  assert.ok(Math.abs(layout.figureHeight! - body.sheetHeight * layout.scale) < 1e-9)
  const leftOfWindow = (200 - window[2] * layout.scale) / 2
  assert.ok(Math.abs(layout.ground!.x - (leftOfWindow + (body.ground[0] - window[0]) * layout.scale)) < 1e-9)
})

test("a bust has no ground point and fills its square box", () => {
  const bust = resolveAvatarStillLayers(DEFAULT_FEMALE_AVATAR_LOADOUT, "bust")
  const layout = layoutAvatarStill(bust, avatarStillWindow(bust, "bust"), { width: 64, height: 64 })
  assert.equal(layout.scale, 64 / 256)
  assert.equal(layout.ground, null)
})

test("a layer cut from a shared sheet (a composed leg) shows exactly its part: the sheet is offset inside the clipped frame", () => {
  const still = resolveAvatarStillLayers(DEFAULT_FEMALE_AVATAR_LOADOUT, "full")
  const part = { asset: "male/full/bottom__o1__bottom-cut", rect: [40, 300, 20, 30] as const, source: { rect: [0, 32, 20, 30] as const, sheet: [24, 62] as const } }
  const layout = layoutAvatarStill({ ...still, layers: [...still.layers, part] }, avatarStillWindow(still, "full"), { width: 200, height: 400 })
  const frame = layout.frames.at(-1)!
  const whole = layout.frames.slice(0, -1)
  assert.ok(whole.every((f) => f.sheet === undefined), "a whole layer is drawn as it is")
  assert.ok(Math.abs(frame.width - 20 * layout.scale) < 1e-9 && Math.abs(frame.height - 30 * layout.scale) < 1e-9)
  // sheet row 32 lands on the frame's top edge, at the layer's own scale
  assert.deepEqual(frame.sheet, { left: -0, top: -32 * layout.scale, width: 24 * layout.scale, height: 62 * layout.scale })
})
