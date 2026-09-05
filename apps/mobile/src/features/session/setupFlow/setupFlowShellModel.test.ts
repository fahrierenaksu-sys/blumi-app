import assert from "node:assert/strict"
import test from "node:test"
import {
  SETUP_FLOW_COPY,
  SETUP_MOTION_TIMELINE_MS,
  getSetupLayoutMetrics,
  getOutgoingRetentionMs,
  getSetupProgress,
  getSetupTransitionFrame,
  shouldClearOutgoingForMotionPreference
} from "./setupFlowShellModel"

test("phone and otp share the fourth progress step", () => {
  assert.deepEqual(getSetupProgress("profile"), { activeIndex: 0, current: 1, total: 4 })
  assert.deepEqual(getSetupProgress("avatar"), { activeIndex: 1, current: 2, total: 4 })
  assert.deepEqual(getSetupProgress("room"), { activeIndex: 2, current: 3, total: 4 })
  assert.deepEqual(getSetupProgress("phone"), { activeIndex: 3, current: 4, total: 4 })
  assert.deepEqual(getSetupProgress("otp"), { activeIndex: 3, current: 4, total: 4 })
})

test("the setup copy is concise Turkish and exposes one primary action", () => {
  assert.deepEqual(SETUP_FLOW_COPY.profile, {
    title: "Seni nasıl tanıyalım?",
    description: "İlk olarak sana nasıl sesleneceğimizi seçelim.",
    primaryAction: "Karakterimi hazırlayalım"
  })
  assert.equal(SETUP_FLOW_COPY.avatar.primaryAction, "Karakterim hazır")
  assert.equal(SETUP_FLOW_COPY.room.primaryAction, "Odam hazır")
  assert.equal(SETUP_FLOW_COPY.phone.primaryAction, "Kod gönder")
  assert.equal(SETUP_FLOW_COPY.otp.primaryAction, "Blumi’ye katıl")
})

test("layout preserves the shared geometry while adapting compact screens", () => {
  assert.deepEqual(getSetupLayoutMetrics({ width: 440, height: 956, fontScale: 1 }), {
    compact: false,
    dense: false,
    horizontalInset: 20,
    taskCardPadding: 24,
    veryCompact: false,
    stageHeight: 258,
    headerHeight: 56,
    progressHeight: 4,
    primaryActionHeight: 58,
    shouldScroll: false
  })
  assert.deepEqual(getSetupLayoutMetrics({ width: 375, height: 667, fontScale: 1 }), {
    compact: true,
    dense: true,
    horizontalInset: 16,
    taskCardPadding: 18,
    veryCompact: true,
    stageHeight: 188,
    headerHeight: 56,
    progressHeight: 4,
    primaryActionHeight: 58,
    shouldScroll: true
  })
  assert.deepEqual(getSetupLayoutMetrics({ width: 402, height: 874, fontScale: 1 }), {
    compact: true,
    dense: true,
    horizontalInset: 20,
    taskCardPadding: 20,
    veryCompact: false,
    stageHeight: 208,
    headerHeight: 56,
    progressHeight: 4,
    primaryActionHeight: 58,
    shouldScroll: true
  })
  assert.deepEqual(getSetupLayoutMetrics({ width: 414, height: 896, fontScale: 1 }), {
    compact: true,
    dense: true,
    horizontalInset: 20,
    taskCardPadding: 20,
    veryCompact: false,
    stageHeight: 208,
    headerHeight: 56,
    progressHeight: 4,
    primaryActionHeight: 58,
    shouldScroll: true
  })
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

test("standard transition keeps shell geometry fixed and overlaps content motion", () => {
  assert.deepEqual(SETUP_MOTION_TIMELINE_MS, {
    total: 440,
    oldPanelStart: 0,
    oldPanelEnd: 180,
    stageStart: 40,
    stageEnd: 400,
    newPanelStart: 140,
    newPanelEnd: 390,
    ctaStart: 190,
    ctaEnd: 430,
    reduced: 100
  })
  assert.deepEqual(getSetupTransitionFrame(0, false), {
    outgoingOpacity: 1,
    outgoingTranslateY: 0,
    stageProgress: 0,
    incomingOpacity: 0,
    incomingTranslateY: 10,
    ctaProgress: 0
  })
  assert.deepEqual(getSetupTransitionFrame(440, false), {
    outgoingOpacity: 0,
    outgoingTranslateY: 12,
    stageProgress: 1,
    incomingOpacity: 1,
    incomingTranslateY: 0,
    ctaProgress: 1
  })
})

test("reduced motion uses a single 100ms crossfade without translation", () => {
  assert.deepEqual(getSetupTransitionFrame(50, true), {
    outgoingOpacity: 0.5,
    outgoingTranslateY: 0,
    stageProgress: 0.5,
    incomingOpacity: 0.5,
    incomingTranslateY: 0,
    ctaProgress: 0.5
  })
})

test("outgoing content has a bounded lifetime and clears when Reduce Motion is enabled", () => {
  assert.equal(getOutgoingRetentionMs(false), 440)
  assert.equal(getOutgoingRetentionMs(true), 100)
  assert.equal(shouldClearOutgoingForMotionPreference(false, true, true), true)
  assert.equal(shouldClearOutgoingForMotionPreference(true, false, true), false)
  assert.equal(shouldClearOutgoingForMotionPreference(false, true, false), false)
})
