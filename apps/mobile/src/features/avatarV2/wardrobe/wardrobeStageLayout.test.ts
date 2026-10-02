import assert from "node:assert/strict"
import test from "node:test"
import {
  chunkWardrobePages,
  getWardrobeCardHeight,
  getWardrobeGridItemWidth,
  getWardrobeGridPageHeight,
  getWardrobePageCount,
  getWardrobeStageLayout
} from "./wardrobeStageLayout"

test("the character stays inside its circle on the 2:3 room canvas", () => {
  const layout = getWardrobeStageLayout({ heroWidth: 390, heroHeight: 400 })
  assert.equal(Math.round(layout.avatarHeight * (256 / 384)), layout.avatarSize)
  // Visible body is about 70% of the canvas height.
  const visible = layout.avatarHeight * 0.7
  assert.ok(visible <= layout.circleSize, `visible ${visible} circle ${layout.circleSize}`)
  assert.ok(visible > layout.circleSize * 0.8, "the character is not tiny either")
  assert.ok(layout.avatarOffsetY < 0, "the visible body is centred, not the canvas")
})

test("a narrow hero limits the character width", () => {
  const layout = getWardrobeStageLayout({ heroWidth: 200, heroHeight: 600 })
  assert.ok(layout.avatarSize <= 200 * 0.86 + 1)
})

test("the circle stays inside the hero", () => {
  const layout = getWardrobeStageLayout({ heroWidth: 390, heroHeight: 295 })
  assert.ok(layout.circleSize <= 295 * 0.88 + 1)
  assert.ok(layout.circleSize <= 390 * 0.63 + 1)
})

test("an unmeasured hero yields an empty layout", () => {
  assert.deepEqual(getWardrobeStageLayout({ heroWidth: 0, heroHeight: 0 }), {
    avatarSize: 0,
    avatarHeight: 0,
    avatarOffsetY: -0,
    circleSize: 0
  })
})

test("three grid columns fill the measured list width", () => {
  assert.equal(getWardrobeGridItemWidth(338, 8), 107)
  assert.equal(getWardrobeGridItemWidth(0, 8), 0)
  assert.equal(getWardrobeGridItemWidth(Number.NaN, 8), 0)
  const width = getWardrobeGridItemWidth(300, 8)
  assert.ok(width * 3 + 16 <= 300)
})

test("cards page one row of three at a time and keep their order", () => {
  assert.deepEqual(chunkWardrobePages([1, 2, 3, 4, 5, 6, 7]), [[1, 2, 3], [4, 5, 6], [7]])
  assert.deepEqual(chunkWardrobePages([1, 2]), [[1, 2]])
  assert.deepEqual(chunkWardrobePages([]), [])
})

test("a grid page is exactly one card row tall", () => {
  const cardHeight = getWardrobeCardHeight(100)
  assert.equal(cardHeight, 82 + 6 + 32)
  assert.equal(getWardrobeGridPageHeight(cardHeight, 12), cardHeight)
  assert.equal(getWardrobeGridPageHeight(cardHeight, 12, 2), cardHeight * 2 + 12)
  assert.equal(getWardrobeGridPageHeight(cardHeight, 12, 1), cardHeight)
  assert.equal(getWardrobeCardHeight(0), 0)
  assert.equal(getWardrobeGridPageHeight(0, 12), 0)
})

test("large text grows the card name block up to the name's own cap", () => {
  assert.ok(getWardrobeCardHeight(100, 1.2) > getWardrobeCardHeight(100, 1))
  assert.equal(getWardrobeCardHeight(100, 3), getWardrobeCardHeight(100, 1.3))
})

test("the page count covers every card", () => {
  assert.equal(getWardrobePageCount(0), 0)
  assert.equal(getWardrobePageCount(3), 1)
  assert.equal(getWardrobePageCount(4), 2)
  assert.equal(getWardrobePageCount(7), 3)
})
