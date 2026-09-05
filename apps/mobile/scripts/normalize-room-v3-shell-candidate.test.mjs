import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import sharp from "sharp"

import { normalizeRoomV3ShellCandidate } from "./normalize-room-v3-shell-candidate.mjs"

test("normalizes generated shell art to the exact canonical canvas and alpha", async () => {
  const root = await mkdtemp(join(tmpdir(), "room-shell-normalize-"))
  const masterPath = join(root, "master.png")
  const sourcePath = join(root, "source.png")
  const outputPath = join(root, "output.png")

  const master = Buffer.alloc(8 * 6 * 4)
  for (let y = 1; y <= 5; y += 1) {
    for (let x = 1; x <= 6; x += 1) {
      const offset = (y * 8 + x) * 4
      master[offset] = 120
      master[offset + 1] = 100
      master[offset + 2] = 80
      master[offset + 3] = x === 1 || y === 1 ? 128 : 255
    }
  }
  await sharp(master, { raw: { width: 8, height: 6, channels: 4 } })
    .png()
    .toFile(masterPath)

  const source = Buffer.alloc(12 * 10 * 4, 255)
  for (let y = 2; y <= 8; y += 1) {
    for (let x = 3; x <= 10; x += 1) {
      const offset = (y * 12 + x) * 4
      source[offset] = 40
      source[offset + 1] = 130
      source[offset + 2] = 90
      source[offset + 3] = 255
    }
  }
  // Keep one dark pixel to lock the source bounds while leaving most of the
  // top generated edge as background. The normalizer must not bake that pale
  // background into the canonical antialiased shell edge.
  for (let x = 4; x <= 10; x += 1) {
    const offset = (2 * 12 + x) * 4
    source[offset] = 255
    source[offset + 1] = 255
    source[offset + 2] = 255
  }
  await sharp(source, { raw: { width: 12, height: 10, channels: 4 } })
    .png()
    .toFile(sourcePath)

  const report = await normalizeRoomV3ShellCandidate({
    masterPath,
    sourcePath,
    outputPath,
    backgroundThreshold: 12
  })

  assert.deepEqual(report.canvasSize, { width: 8, height: 6 })
  assert.deepEqual(report.masterAlphaBounds, {
    minX: 1,
    minY: 1,
    maxXInclusive: 6,
    maxYInclusive: 5
  })
  assert.deepEqual(report.sourceForegroundBounds, {
    minX: 3,
    minY: 2,
    maxXInclusive: 10,
    maxYInclusive: 8
  })
  assert.equal(report.alphaMaskMatchesMaster, true)
  assert.ok(report.backgroundFallbackPixelCount > 0)
  assert.match(report.outputSha256, /^[a-f0-9]{64}$/)

  const [masterRaw, outputRaw] = await Promise.all([
    sharp(masterPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  ])
  assert.deepEqual(outputRaw.info, masterRaw.info)
  for (let pixel = 0; pixel < 8 * 6; pixel += 1) {
    assert.equal(outputRaw.data[pixel * 4 + 3], masterRaw.data[pixel * 4 + 3])
    if (masterRaw.data[pixel * 4 + 3] === 0) {
      assert.deepEqual([...outputRaw.data.subarray(pixel * 4, pixel * 4 + 4)], [0, 0, 0, 0])
    }
  }
  const canonicalTopRightEdge = (1 * 8 + 6) * 4
  const repairedEdge = [
    ...outputRaw.data.subarray(canonicalTopRightEdge, canonicalTopRightEdge + 4)
  ]
  assert.notDeepEqual(repairedEdge.slice(0, 3), [120, 100, 80])
  assert.ok(Math.min(...repairedEdge.slice(0, 3)) >= 24)
  assert.equal(repairedEdge[3], 128)

  const outputFile = await readFile(outputPath)
  assert.ok(outputFile.length > 0)
})

test("fails closed when a generated source has no foreground", async () => {
  const root = await mkdtemp(join(tmpdir(), "room-shell-normalize-empty-"))
  const masterPath = join(root, "master.png")
  const sourcePath = join(root, "source.png")
  const outputPath = join(root, "output.png")

  await sharp({
    create: {
      width: 8,
      height: 6,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    }
  }).png().toFile(masterPath)
  await sharp({
    create: {
      width: 12,
      height: 10,
      channels: 4,
      background: { r: 250, g: 250, b: 250, alpha: 1 }
    }
  }).png().toFile(sourcePath)

  await assert.rejects(
    normalizeRoomV3ShellCandidate({ masterPath, sourcePath, outputPath }),
    /generated shell source has no detectable foreground/
  )
})
