import assert from "node:assert/strict"
import test from "node:test"
import {
  getAvatarSetupLayoutMetrics,
  getAvatarSetupImmersiveStageHeight,
  getAvatarStudioNextIndex,
  getAvatarStudioStageMetrics
} from "./avatarSetupLayout"
import { SETUP_FLOW_STAGE_HEIGHT } from "../session/setupFlow/setupFlowShellModel"

test("compresses the visual hierarchy on the shorter reference viewport", () => {
  const metrics = getAvatarSetupLayoutMetrics(852, 393, 1)
  assert.equal(metrics.compact, true)
  assert.equal(metrics.veryCompact, false)
})

test("uses compact immersive geometry on iPhone 17 but not Pro Max", () => {
  assert.equal(getAvatarSetupLayoutMetrics(874, 402, 1).compact, true)
  assert.equal(getAvatarSetupLayoutMetrics(956, 440, 1).compact, false)
})

test("compresses the mirror before CTA and progress can clip on short screens", () => {
  const metrics = getAvatarSetupLayoutMetrics(667, 375, 1)
  assert.equal(metrics.compact, true)
  assert.equal(metrics.veryCompact, true)
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

test("maps orbit controls to the canonical rig's actual body zones", () => {
  const regular = getAvatarStudioStageMetrics(false)
  const compact = getAvatarStudioStageMetrics(true)

  assert.equal(regular.stageHeight, getAvatarSetupImmersiveStageHeight(false, 956))
  assert.equal(compact.stageHeight, getAvatarSetupImmersiveStageHeight(true, 852))
  assert.ok(regular.stageHeight > SETUP_FLOW_STAGE_HEIGHT.regular)
  assert.ok(compact.stageHeight > SETUP_FLOW_STAGE_HEIGHT.compact)
  assert.ok(regular.genderRailWidth >= 220)
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
