import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import sharp from "sharp"

import {
  generateUniversalCoreThumbnails,
  UNIVERSAL_CORE_THUMBNAIL_SIZE
} from "./generate-room-v3-universal-thumbnails.mjs"

test("generates one readable transparent thumbnail for every canonical Universal Core product", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "blumi-universal-thumbnails-"))

  try {
    const report = await generateUniversalCoreThumbnails({ outputRoot })

    assert.equal(report.productCount, 45)
    assert.equal(report.thumbnailCount, 45)
    assert.equal(report.issueIds.length, 0)
    assert.equal(report.thumbnailSize, UNIVERSAL_CORE_THUMBNAIL_SIZE)

    const manifest = JSON.parse(await readFile(report.manifestPath, "utf8"))
    assert.equal(manifest.productCount, 45)
    assert.equal(manifest.thumbnailCount, 45)
    assert.equal(new Set(manifest.products.map((product) => product.thumbnailKey)).size, 45)

    assert.equal(
      manifest.products.find((product) => product.id === "universal_arc_coffee_table_b")
        .thumbnailKey,
      "room_v3_thumbnail_universal_core_coffee_table_a"
    )

    const first = manifest.products[0]
    const metadata = await sharp(first.path).metadata()
    assert.equal(metadata.width, UNIVERSAL_CORE_THUMBNAIL_SIZE)
    assert.equal(metadata.height, UNIVERSAL_CORE_THUMBNAIL_SIZE)
    assert.equal(metadata.hasAlpha, true)
  } finally {
    await rm(outputRoot, { recursive: true, force: true })
  }
})
