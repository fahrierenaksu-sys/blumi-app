import assert from "node:assert/strict"
import test from "node:test"
import {
  AVATAR_STUDIO_CATEGORY_SEQUENCE,
  getAvatarSetupLayoutMetrics,
  getAvatarSetupImmersiveStageHeight,
  getAvatarSetupTaskCardMinHeight,
  getAvatarStudioNextIndex,
  getAvatarStudioStageMetrics
} from "./avatarSetupLayout"
import { SETUP_FLOW_STAGE_HEIGHT } from "../session/setupFlow/setupFlowShellModel"

test("compresses the visual hierarchy on the shorter reference viewport", () => {
  assert.deepEqual(getAvatarSetupLayoutMetrics(852, 393, 1), {
    avatarSize: 218,
    compact: true,
    mirrorMaxHeight: 350,
    mirrorMinHeight: 285,
    stageHeight: 270,
    veryCompact: false
  })
})

test("uses compact immersive geometry on iPhone 17 but not Pro Max", () => {
  assert.equal(getAvatarSetupLayoutMetrics(874, 402, 1).compact, true)
  assert.equal(getAvatarSetupLayoutMetrics(956, 440, 1).compact, false)
})

test("compresses the mirror before CTA and progress can clip on short screens", () => {
  assert.deepEqual(getAvatarSetupLayoutMetrics(667, 375, 1), {
    avatarSize: 176,
    compact: true,
    mirrorMaxHeight: 280,
    mirrorMinHeight: 235,
    stageHeight: 215,
    veryCompact: true
  })
})

test("uses the same safe compact mode for large Dynamic Type", () => {
  assert.equal(getAvatarSetupLayoutMetrics(852, 393, 1.4).veryCompact, true)
  assert.equal(getAvatarSetupLayoutMetrics(852, 393, 1.2).compact, true)
})

test("keeps studio geometry aligned with the very compact sheet", () => {
  const metrics = getAvatarStudioStageMetrics(true, 375, undefined, 852, true)

  assert.equal(
    metrics.stageHeight,
    getAvatarSetupImmersiveStageHeight(true, 852, true)
  )
})

test("reserves enough room for the immersive confirmation sheet", () => {
  assert.equal(getAvatarSetupImmersiveStageHeight(false, 956), 468)
  assert.equal(getAvatarSetupImmersiveStageHeight(true, 852), 392)
  assert.equal(getAvatarSetupImmersiveStageHeight(true, 667, true), 354)
})

test("keeps the avatar confirmation sheet roomy enough for room-style copy", () => {
  assert.equal(getAvatarSetupTaskCardMinHeight(false, false, 956), 144)
  assert.equal(getAvatarSetupTaskCardMinHeight(true, false, 852), 116)
  assert.equal(getAvatarSetupTaskCardMinHeight(true, true, 667), 104)
})

test("orders starter product groups from head to feet", () => {
  assert.deepEqual(AVATAR_STUDIO_CATEGORY_SEQUENCE, [
    "hair",
    "top",
    "bottom",
    "shoes"
  ])
})

test("maps orbit controls to the canonical rig's actual body zones", () => {
  const regular = getAvatarStudioStageMetrics(false)
  const compact = getAvatarStudioStageMetrics(true)

  assert.equal(regular.avatarBottomInset, 18)
  assert.equal(compact.avatarBottomInset, 14)
  assert.equal(regular.stageWidth, 353)
  assert.equal(compact.stageWidth, 343)
  assert.equal(regular.orbitPodWidth, 106)
  assert.equal(compact.orbitPodWidth, 102)
  assert.equal(regular.orbitPodHeight, 46)
  assert.equal(compact.orbitPodHeight, 44)
  assert.equal(regular.avatarSize, 292)
  assert.equal(compact.avatarSize, 260)
  assert.equal(regular.stageHeight, getAvatarSetupImmersiveStageHeight(false, 956))
  assert.equal(compact.stageHeight, getAvatarSetupImmersiveStageHeight(true, 852))
  assert.ok(regular.stageHeight > SETUP_FLOW_STAGE_HEIGHT.regular)
  assert.ok(compact.stageHeight > SETUP_FLOW_STAGE_HEIGHT.compact)
  assert.ok(regular.genderRailWidth >= 220)
  assert.deepEqual(regular.orbitPod, {
    hair: { side: "left", top: 111 },
    top: { side: "right", top: 230 },
    bottom: { side: "left", top: 304 },
    shoes: { side: "right", top: 388 }
  })
  assert.deepEqual(compact.orbitPod, {
    hair: { side: "left", top: 77 },
    top: { side: "right", top: 181 },
    bottom: { side: "left", top: 247 },
    shoes: { side: "right", top: 321 }
  })
  assert.ok(compact.orbitPod.hair.top >= 70)
  assert.ok(regular.orbitPod.hair.top < regular.orbitPod.top.top)
  assert.ok(regular.orbitPod.top.top < regular.orbitPod.bottom.top)
  assert.ok(regular.orbitPod.bottom.top < regular.orbitPod.shoes.top)
  assert.ok(regular.orbitPod.shoes.top + regular.orbitPodHeight <= regular.stageHeight)
})

test("sizes the avatar to preserve an outer arrow clearance on narrow viewports", () => {
  const proMax = getAvatarStudioStageMetrics(false, 393)
  const narrow = getAvatarStudioStageMetrics(true, 320)
  const tiny = getAvatarStudioStageMetrics(true, 280)
  const measuredStage = getAvatarStudioStageMetrics(false, 393, 320)

  assert.ok(proMax.avatarSize >= 292)
  assert.ok(narrow.avatarSize <= 260)
  assert.ok(tiny.orbitPodWidth >= 96)
  assert.ok(proMax.orbitPodWidth <= Math.floor(proMax.stageWidth * 0.31))
  assert.ok(tiny.orbitPodWidth + 16 <= tiny.stageWidth)
  assert.equal(measuredStage.stageWidth, 320)
  assert.ok(measuredStage.orbitPodWidth + 16 <= measuredStage.stageWidth)
  assert.ok(tiny.orbitPod.shoes.top + tiny.orbitPodHeight <= tiny.stageHeight)
})

test("wraps previous and next style selection without dead ends", () => {
  assert.equal(getAvatarStudioNextIndex(0, 2, -1), 1)
  assert.equal(getAvatarStudioNextIndex(1, 2, 1), 0)
  assert.equal(getAvatarStudioNextIndex(0, 0, 1), 0)
  assert.equal(getAvatarStudioNextIndex(0, 1, -1), 0)
  assert.equal(getAvatarStudioNextIndex(5, 2, 1), 0)
  assert.equal(getAvatarStudioNextIndex(-4, 2, -1), 1)
})
