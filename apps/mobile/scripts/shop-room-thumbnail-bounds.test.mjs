import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { renderBoundsModule } from "./generate-shop-room-thumbnail-bounds.mjs"

const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "../src/features/shop/shopRoomThumbnailBounds.ts")

test("Shop room card framing matches the bundled room art", () => {
  const current = readFileSync(OUTPUT, "utf8")
  assert.ok(current.split("\n").length > 10, "room art bounds were found")
  assert.equal(current, renderBoundsModule(), "run node scripts/generate-shop-room-thumbnail-bounds.mjs")
})
