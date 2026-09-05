import assert from "node:assert/strict"
import test from "node:test"
import {
  PAGE_COMPONENT_SPACING,
  PAGE_CONTAINER_SPACING,
  resolvePageContainerLayout
} from "./pageContainerLayout"

test("compact iPhone widths use a 16-point content gutter", () => {
  assert.deepEqual(resolvePageContainerLayout(320), {
    horizontalInset: 16,
    contentWidth: 288,
    maxContentWidth: 680
  })
})

test("current iPhone widths use the shared 20-point page gutter", () => {
  assert.deepEqual(resolvePageContainerLayout(390), {
    horizontalInset: 20,
    contentWidth: 350,
    maxContentWidth: 680
  })
  assert.deepEqual(resolvePageContainerLayout(430), {
    horizontalInset: 20,
    contentWidth: 390,
    maxContentWidth: 680
  })
})

test("wide layouts center a capped readable column instead of stretching components", () => {
  assert.deepEqual(resolvePageContainerLayout(834), {
    horizontalInset: 77,
    contentWidth: 680,
    maxContentWidth: 680
  })
})

test("invalid or pre-layout widths fall back without producing negative geometry", () => {
  assert.deepEqual(resolvePageContainerLayout(0), {
    horizontalInset: 16,
    contentWidth: 0,
    maxContentWidth: 680
  })
  assert.deepEqual(resolvePageContainerLayout(Number.NaN), {
    horizontalInset: 16,
    contentWidth: 0,
    maxContentWidth: 680
  })
})

test("page and component spacing expose one immutable eight-point-based contract", () => {
  assert.deepEqual(PAGE_CONTAINER_SPACING, {
    compactHorizontalInset: 16,
    regularHorizontalInset: 20,
    wideHorizontalInset: 24,
    maxContentWidth: 680
  })
  assert.deepEqual(PAGE_COMPONENT_SPACING, {
    controlGap: 8,
    componentGap: 12,
    sectionGap: 24,
    cardPadding: 16
  })
  assert.equal(Object.isFrozen(PAGE_CONTAINER_SPACING), true)
  assert.equal(Object.isFrozen(PAGE_COMPONENT_SPACING), true)
})
