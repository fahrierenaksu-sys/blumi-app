import assert from "node:assert/strict"
import test from "node:test"
import {
  SETUP_MOTION_TIMELINE_MS,
  getSetupLayoutMetrics,
  getOutgoingRetentionMs,
  getSetupProgress,
  shouldClearOutgoingForMotionPreference
} from "./setupFlowShellModel"

test("phone and otp share the fourth progress step", () => {
  assert.deepEqual(getSetupProgress("profile"), { activeIndex: 0, current: 1, total: 4 })
  assert.deepEqual(getSetupProgress("avatar"), { activeIndex: 1, current: 2, total: 4 })
  assert.deepEqual(getSetupProgress("room"), { activeIndex: 2, current: 3, total: 4 })
  assert.deepEqual(getSetupProgress("phone"), { activeIndex: 3, current: 4, total: 4 })
  assert.deepEqual(getSetupProgress("otp"), { activeIndex: 3, current: 4, total: 4 })
})

test("large Dynamic Type switches even the roomiest setup layout to scroll", () => {
  assert.equal(getSetupLayoutMetrics({ width: 440, height: 956, fontScale: 1.3 }).shouldScroll, true)
})

test("standard and legacy iPhones use a scroll-safe compact budget", () => {
  const compactViewports = [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 402, height: 874 },
    { width: 414, height: 896 }
  ]

  for (const viewport of compactViewports) {
    const metrics = getSetupLayoutMetrics({ ...viewport, fontScale: 1 })
    assert.equal(metrics.compact, true, `${viewport.width}x${viewport.height}`)
    assert.equal(metrics.dense, true, `${viewport.width}x${viewport.height}`)
    assert.equal(metrics.shouldScroll, true, `${viewport.width}x${viewport.height}`)
  }

  const proMax = getSetupLayoutMetrics({ width: 440, height: 956, fontScale: 1 })
  assert.equal(proMax.compact, false)
  assert.equal(proMax.shouldScroll, false)
})

test("outgoing content has a bounded lifetime and clears when Reduce Motion is enabled", () => {
  assert.equal(getOutgoingRetentionMs(false), SETUP_MOTION_TIMELINE_MS.total)
  assert.equal(getOutgoingRetentionMs(true), SETUP_MOTION_TIMELINE_MS.reduced)
  assert.equal(shouldClearOutgoingForMotionPreference(false, true, true), true)
  assert.equal(shouldClearOutgoingForMotionPreference(true, false, true), false)
  assert.equal(shouldClearOutgoingForMotionPreference(false, true, false), false)
})
