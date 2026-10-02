import assert from "node:assert/strict"
import test from "node:test"
import { resolveWardrobeCatalogFrame } from "./wardrobeCatalogTransitionModel"

const hair = ["hair-a", "hair-b"]
const tops = ["top-a", "top-b", "top-c"]

test("the shown category always draws its freshest cards", () => {
  const frame = resolveWardrobeCatalogFrame({
    requestedCategory: "hair", shownCategory: "hair", cards: hair, lastShownCards: ["stale"], reduceMotion: false
  })
  assert.deepEqual(frame, { cards: hair, switching: false })
})

test("a new category keeps the old cards until they are invisible, so new cards never flash", () => {
  const frame = resolveWardrobeCatalogFrame({
    requestedCategory: "top", shownCategory: "hair", cards: tops, lastShownCards: hair, reduceMotion: false
  })
  assert.deepEqual(frame, { cards: hair, switching: true })
})

test("Reduce Motion swaps at once without a fade", () => {
  const frame = resolveWardrobeCatalogFrame({
    requestedCategory: "top", shownCategory: "hair", cards: tops, lastShownCards: hair, reduceMotion: true
  })
  assert.deepEqual(frame, { cards: tops, switching: false })
})
