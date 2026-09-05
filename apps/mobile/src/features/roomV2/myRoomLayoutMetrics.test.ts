import assert from "node:assert/strict"
import test from "node:test"
import { resolveAppViewportMetrics } from "../../ui/layout/appViewportMetrics"
import { resolveRoomV2MyRoomCamera } from "./roomV2Camera"
import { resolveMyRoomLayoutMetrics } from "./myRoomLayoutMetrics"

const camera = resolveRoomV2MyRoomCamera(undefined)

test("My Room stage uses a taller phone composition instead of leaving unused lower space", () => {
  const metrics = resolveMyRoomLayoutMetrics({
    viewportWidth: 393,
    contentWidth: 393,
    availableContentHeight: 700,
    bottomContentInset: 92,
    camera
  })

  assert.equal(metrics.stageHeight, 548)
  assert.equal(metrics.rendererWidth, "155%")
  assert.equal(metrics.rendererTranslateY, 0)
  assert.equal(metrics.contentBottomPadding, 0)
})

test("My Room portrait framing remains stable across the old 390 point boundary", () => {
  const below = resolveMyRoomLayoutMetrics({
    viewportWidth: 389,
    contentWidth: 389,
    availableContentHeight: 700,
    bottomContentInset: 90,
    camera
  })
  const above = resolveMyRoomLayoutMetrics({
    viewportWidth: 390,
    contentWidth: 390,
    availableContentHeight: 700,
    bottomContentInset: 90,
    camera
  })

  assert.equal(below.rendererScalePercent, above.rendererScalePercent)
  assert.equal(below.rendererWidth, "155%")
  assert.equal(above.rendererWidth, "155%")
})

test("My Room renderer scale stays inside the approved portrait framing bounds", () => {
  const compact = resolveMyRoomLayoutMetrics({
    viewportWidth: 320,
    contentWidth: 320,
    availableContentHeight: 620,
    bottomContentInset: 0,
    camera
  })
  const regular = resolveMyRoomLayoutMetrics({
    viewportWidth: 500,
    contentWidth: 500,
    availableContentHeight: 900,
    bottomContentInset: 0,
    camera
  })

  assert.equal(compact.rendererScalePercent, 155)
  assert.equal(compact.rendererWidth, "155%")
  assert.equal(regular.rendererScalePercent, 155)
  assert.equal(regular.rendererWidth, "155%")
})

test("wide stages keep the existing fitted camera mode without affecting phone framing", () => {
  const metrics = resolveMyRoomLayoutMetrics({
    viewportWidth: 800,
    contentWidth: 800,
    availableContentHeight: 900,
    bottomContentInset: 104,
    camera
  })

  assert.equal(metrics.usesWideStageCamera, true)
  assert.equal(metrics.rendererScalePercent, 100)
  assert.equal(metrics.rendererWidth, "100%")
  assert.equal(metrics.stageHeight, camera.wideMaxStageHeight)
})

test("wide short viewports retain the height-bounded stage camera", () => {
  const metrics = resolveMyRoomLayoutMetrics({
    viewportWidth: 800,
    contentWidth: 800,
    availableContentHeight: 500,
    bottomContentInset: 0,
    camera
  })

  assert.equal(metrics.stageHeight, camera.wideMinStageHeight)
})

test("My Room metrics fail safely for invalid measured space", () => {
  const metrics = resolveMyRoomLayoutMetrics({
    viewportWidth: Number.NaN,
    contentWidth: Number.NaN,
    availableContentHeight: -1,
    bottomContentInset: -12,
    camera
  })

  assert.equal(metrics.stageHeight, camera.compactMinStageHeight)
  assert.equal(metrics.contentBottomPadding, 0)
  assert.equal(metrics.rendererScalePercent, 155)
  assert.equal(metrics.rendererWidth, "155%")
})

test("iPhone 17 and Pro Max keep one bounded My Room composition", () => {
  const devices = [
    { width: 402, height: 874 },
    { width: 440, height: 956 }
  ]
  const metrics = devices.map(({ width, height }) => {
    const viewport = resolveAppViewportMetrics({
      width,
      height,
      fontScale: 1,
      safeAreaInsets: { top: 59, right: 0, bottom: 34, left: 0 },
      bottomNavVisible: true
    })
    return {
      contentWidth: viewport.contentWidth,
      contentHeight: viewport.contentHeight,
      layout: resolveMyRoomLayoutMetrics({
        viewportWidth: width,
        contentWidth: viewport.contentWidth,
        availableContentHeight: viewport.contentHeight,
        bottomContentInset: viewport.bottomContentInset,
        camera
      })
    }
  })

  for (const { contentHeight, layout } of metrics) {
    assert.ok(layout.stageHeight >= camera.compactMinStageHeight)
    assert.ok(layout.stageHeight <= camera.compactMaxStageHeight)
    assert.ok(layout.stageHeight <= contentHeight - 104)
    assert.equal(layout.rendererScalePercent, 155)
  }
  assert.ok(metrics[1].layout.stageHeight > metrics[0].layout.stageHeight)
})

test("short phone viewports reserve room for the controls above navigation", () => {
  const short = resolveMyRoomLayoutMetrics({
    viewportWidth: 393,
    contentWidth: 393,
    availableContentHeight: 620,
    bottomContentInset: 90,
    camera
  })
  const tall = resolveMyRoomLayoutMetrics({
    viewportWidth: 393,
    contentWidth: 393,
    availableContentHeight: 900,
    bottomContentInset: 90,
    camera
  })

  assert.equal(short.stageHeight, 468)
  assert.equal(tall.stageHeight, 640)
  assert.ok(short.stageHeight < tall.stageHeight)
  assert.equal(short.rendererWidth, tall.rendererWidth)
})

test("tablet-safe viewport width keeps the wide stage camera even after gutters are removed from content width", () => {
  const metrics = resolveMyRoomLayoutMetrics({
    viewportWidth: 744,
    contentWidth: 696,
    availableContentHeight: 900,
    bottomContentInset: 108,
    camera
  })

  assert.equal(metrics.usesWideStageCamera, true)
  assert.equal(metrics.rendererWidth, "100%")
  assert.equal(metrics.rendererTranslateY, camera.rendererTranslateY)
})
