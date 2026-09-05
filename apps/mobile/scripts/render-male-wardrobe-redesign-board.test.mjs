import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"

import sharp from "sharp"

import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  REQUIRED_RIG_STATES,
  renderMaleWardrobeRedesignBoard,
  validateMaleWardrobeBoardManifest,
} from "./render-male-wardrobe-redesign-board.mjs"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const sourceManifest = JSON.parse(
  readFileSync(
    join(
      repositoryRoot,
      "docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/asset-manifest.json",
    ),
    "utf8",
  ),
)

const makeCompleteFixture = async () => {
  const root = mkdtempSync(join(tmpdir(), "male-board-"))
  const manifest = structuredClone(sourceManifest)

  for (const [index, item] of manifest.items.entries()) {
    const candidateRoot = `docs/avatar-motion-pipeline/male-wardrobe-redesign/2026-07-27/candidates/${item.category}/${item.slug}`
    const staticPath = `${candidateRoot}/static.png`
    const absoluteStaticPath = join(root, staticPath)
    mkdirSync(dirname(absoluteStaticPath), { recursive: true })
    await sharp({
      create: {
        width: 32,
        height: 48,
        channels: 4,
        background: { r: index, g: 255 - index, b: 80, alpha: 1 },
      },
    }).png().toFile(absoluteStaticPath)

    item.candidateRoot = candidateRoot
    item.candidatePaths = Object.fromEntries(
      REQUIRED_RIG_STATES.map((state) => [
        state,
        state === "static" ? staticPath : `${candidateRoot}/${state}.png`,
      ]),
    )
    for (const state of REQUIRED_RIG_STATES.slice(1)) {
      writeFileSync(join(root, item.candidatePaths[state]), "motion-proof")
    }
    item.independentReview = { status: "PASS", reviewer: `reviewer-${index}` }
    item.rigStates = Object.fromEntries(
      REQUIRED_RIG_STATES.map((state) => [state, { status: "PASS" }]),
    )
  }

  const manifestPath = join(root, "asset-manifest.json")
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  return { root, manifest, manifestPath }
}

test("manifest gate requires exactly 54 unique candidate-only items", async () => {
  const { root, manifest } = await makeCompleteFixture()
  assert.doesNotThrow(() => validateMaleWardrobeBoardManifest(manifest, root))

  const duplicate = structuredClone(manifest)
  duplicate.items[1].slug = duplicate.items[0].slug
  assert.throws(
    () => validateMaleWardrobeBoardManifest(duplicate, root),
    /54 unique slugs/,
  )

  const runtimePath = structuredClone(manifest)
  runtimePath.items[0].candidatePaths.static =
    "apps/mobile/src/features/avatarV2/assets/room/avatar_room_top_male_cream_basic_tee_v1.png"
  assert.throws(
    () => validateMaleWardrobeBoardManifest(runtimePath, root),
    /candidate-only path/,
  )
})

test("manifest gate rejects missing files, reviews, or rig-state PASS verdicts", async () => {
  const { root, manifest } = await makeCompleteFixture()

  const missing = structuredClone(manifest)
  missing.items[0].candidatePaths.static = `${missing.items[0].candidateRoot}/missing.png`
  assert.throws(() => validateMaleWardrobeBoardManifest(missing, root), /missing candidate/)

  const unreviewed = structuredClone(manifest)
  unreviewed.items[0].independentReview.status = "PENDING"
  assert.throws(() => validateMaleWardrobeBoardManifest(unreviewed, root), /independentReview PASS/)

  const unrigged = structuredClone(manifest)
  unrigged.items[0].rigStates.walking_front_f03.status = "FAIL"
  assert.throws(() => validateMaleWardrobeBoardManifest(unrigged, root), /walking_front_f03 PASS/)
})

test("renderer refuses to create a partial board", async () => {
  const { root, manifest, manifestPath } = await makeCompleteFixture()
  manifest.items[0].independentReview.status = "PENDING"
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  const outputPath = join(root, "board.png")

  await assert.rejects(
    renderMaleWardrobeRedesignBoard({ manifestPath, outputPath, repositoryRoot: root }),
    /independentReview PASS/,
  )
  assert.equal(existsSync(outputPath), false)
})

test("renderer creates one deterministic labeled 9x6 PNG in manifest order", async () => {
  const { root, manifestPath } = await makeCompleteFixture()
  const firstOutput = join(root, "board-first.png")
  const secondOutput = join(root, "board-second.png")

  const first = await renderMaleWardrobeRedesignBoard({
    manifestPath,
    outputPath: firstOutput,
    repositoryRoot: root,
  })
  const second = await renderMaleWardrobeRedesignBoard({
    manifestPath,
    outputPath: secondOutput,
    repositoryRoot: root,
  })

  assert.equal(first.rows, BOARD_ROWS)
  assert.equal(first.columns, BOARD_COLUMNS)
  assert.equal(first.itemCount, 54)
  assert.deepEqual(first.inventoryOrder, sourceManifest.items.map((item) => item.slug))
  assert.deepEqual(
    { ...first, outputPath: undefined },
    { ...second, outputPath: undefined },
  )
  assert.deepEqual(readFileSync(firstOutput), readFileSync(secondOutput))

  const metadata = await sharp(firstOutput).metadata()
  assert.equal(metadata.format, "png")
  assert.equal(metadata.width, first.width)
  assert.equal(metadata.height, first.height)
})
