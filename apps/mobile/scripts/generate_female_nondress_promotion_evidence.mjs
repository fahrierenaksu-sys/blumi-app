#!/usr/bin/env node

import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { PNG } from "pngjs"

import {
  FEMALE_NONDRESS_CATALOG,
  STATES,
  composeWardrobeRow,
  createCandidateAssetResolver
} from "./female-wardrobe-combined-promotion-gate.mjs"
import { createPromotionPlan, resolvePromotionRoots } from "./promote-female-nondress-wardrobe.mjs"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, "../../..")
const roomRoot = join(repositoryRoot, "apps/mobile/src/features/avatarV2/assets/room")
const catalogSourcePath = join(repositoryRoot, "apps/mobile/src/features/avatarV2/room/avatarRoom.mock.ts")
const background = [247, 237, 244, 255]

const sha256 = (value) => createHash("sha256").update(value).digest("hex")
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`

const createCanvas = (width, height) => {
  const png = new PNG({ width, height })
  for (let offset = 0; offset < png.data.length; offset += 4) png.data.set(background, offset)
  return png
}

const copyScaled = ({ target, source, sourceRect, targetRect }) => {
  for (let y = 0; y < targetRect.height; y += 1) {
    const sourceY = sourceRect.y + Math.floor(y * sourceRect.height / targetRect.height)
    for (let x = 0; x < targetRect.width; x += 1) {
      const sourceX = sourceRect.x + Math.floor(x * sourceRect.width / targetRect.width)
      const sourceOffset = (sourceY * source.width + sourceX) * 4
      const targetOffset = ((targetRect.y + y) * target.width + targetRect.x + x) * 4
      source.data.copy(target.data, targetOffset, sourceOffset, sourceOffset + 4)
    }
  }
}

const sourceRectFor = (kind) => {
  if (kind === "top") return { x: 78, y: 192, width: 100, height: 116 }
  if (kind === "bottom") return { x: 78, y: 270, width: 100, height: 90 }
  return { x: 78, y: 306, width: 100, height: 58 }
}

const defaultRowFor = ({ kind, slug }) => {
  const { tops, bottoms, shoes } = FEMALE_NONDRESS_CATALOG
  if (kind === "top") {
    const index = tops.indexOf(slug)
    assert.ok(index >= 0, `unknown top ${slug}`)
    const bottom = bottoms[(index + 1) % bottoms.length]
    return { top: slug, bottom: bottom.slug, bottomOcclusionRole: bottom.occlusionRole, shoes: shoes[(index + 2) % shoes.length] }
  }
  if (kind === "bottom") {
    const index = bottoms.findIndex(({ slug: bottomSlug }) => bottomSlug === slug)
    assert.ok(index >= 0, `unknown bottom ${slug}`)
    const bottom = bottoms[index]
    return { top: tops[(index + 2) % tops.length], bottom: slug, bottomOcclusionRole: bottom.occlusionRole, shoes: shoes[(index + 3) % shoes.length] }
  }
  const index = shoes.indexOf(slug)
  assert.ok(index >= 0, `unknown shoes ${slug}`)
  const bottom = bottoms[(index + 4) % bottoms.length]
  return { top: tops[(index + 4) % tops.length], bottom: bottom.slug, bottomOcclusionRole: bottom.occlusionRole, shoes: slug }
}

const renderCloseUp = ({ composite, kind }) => {
  const sourceRect = sourceRectFor(kind)
  const result = createCanvas(sourceRect.width * 2, sourceRect.height * 2)
  copyScaled({
    target: result,
    source: composite,
    sourceRect,
    targetRect: { x: 0, y: 0, width: result.width, height: result.height }
  })
  return result
}

const renderContactSheet = ({ row, assetResolver }) => {
  const gutter = 2
  const frameWidth = 128
  const frameHeight = 192
  const result = createCanvas(frameWidth * 3 + gutter * 4, frameHeight * 2 + gutter * 3)
  for (const [index, state] of STATES.entries()) {
    const composite = composeWardrobeRow({ roomRoot, row, state, assetResolver })
    copyScaled({
      target: result,
      source: composite,
      sourceRect: { x: 0, y: 0, width: composite.width, height: composite.height },
      targetRect: {
        x: gutter + (index % 3) * (frameWidth + gutter),
        y: gutter + Math.floor(index / 3) * (frameHeight + gutter),
        width: frameWidth,
        height: frameHeight
      }
    })
  }
  return result
}

const renderOverview = (entries) => {
  const gutter = 4
  const frameWidth = 128
  const frameHeight = 192
  const columns = 4
  const rows = Math.ceil(entries.length / columns)
  const result = createCanvas(
    frameWidth * columns + gutter * (columns + 1),
    frameHeight * rows + gutter * (rows + 1)
  )
  for (const [index, { image }] of entries.entries()) {
    copyScaled({
      target: result,
      source: image,
      sourceRect: { x: 0, y: 0, width: image.width, height: image.height },
      targetRect: {
        x: gutter + (index % columns) * (frameWidth + gutter),
        y: gutter + Math.floor(index / columns) * (frameHeight + gutter),
        width: frameWidth,
        height: frameHeight
      }
    })
  }
  return result
}

const evidenceFileName = (kind, slug, name) => join("items", `${kind}__${slug}`, name)

const sourceStatesFor = (itemPlan) => Object.fromEntries(
  itemPlan.map(({ state, source }) => [state, sha256(readFileSync(source))])
)

const buildEvidence = ({ candidateManifestPath }) => {
  const plan = createPromotionPlan(resolvePromotionRoots())
  const assetResolver = createCandidateAssetResolver({
    roomRoot,
    catalog: FEMALE_NONDRESS_CATALOG,
    manifestPath: candidateManifestPath
  })
  const items = {}
  const outputs = new Map()
  const overviewEntries = []
  for (const item of [...new Map(plan.map((entry) => [entry.itemKey, entry])).values()]) {
    const itemPlan = plan.filter((entry) => entry.itemKey === item.itemKey)
    assert.equal(itemPlan.length, STATES.length, `${item.itemKey} must have six source states`)
    for (const entry of itemPlan) {
      assert.equal(
        resolve(assetResolver.resolve(entry.kind, entry.slug, entry.state)),
        resolve(entry.source),
        `${entry.itemKey}/${entry.state} promotion source must match the candidate resolver`
      )
    }
    const row = defaultRowFor(item)
    const staticComposite = composeWardrobeRow({ roomRoot, row, state: "static", assetResolver })
    overviewEntries.push({ itemKey: item.itemKey, image: staticComposite })
    const images = {
      static_full_body: staticComposite,
      close_up: renderCloseUp({ composite: staticComposite, kind: item.kind }),
      motion_contact_sheet: renderContactSheet({ row, assetResolver })
    }
    const evidence = {}
    for (const [type, image] of Object.entries(images)) {
      const file = evidenceFileName(item.kind, item.slug, type.replaceAll("_", "-") + ".png")
      const bytes = PNG.sync.write(image)
      outputs.set(file, bytes)
      evidence[type] = { file, sha256: sha256(bytes) }
    }
    items[item.itemKey] = {
      itemKey: item.itemKey,
      kind: item.kind,
      slug: item.slug,
      sourceMode: "candidate",
      sourceStates: sourceStatesFor(itemPlan),
      compositionRow: row,
      evidence
    }
  }
  const overviewFile = "promotion-overview.png"
  const overviewBytes = PNG.sync.write(renderOverview(overviewEntries))
  outputs.set(overviewFile, overviewBytes)
  const manifest = {
    schemaVersion: 1,
    scope: "female-nondress-wardrobe-promotion-evidence",
    rigId: "blumi_2_5d_layered_v1",
    fitProfileId: "blumi_female_room_avatar_v1",
    frameDurationMs: 120,
    playbackOrder: STATES,
    candidateManifest: relative(repositoryRoot, candidateManifestPath),
    catalogSource: relative(repositoryRoot, catalogSourcePath),
    itemCount: Object.keys(items).length,
    assetCount: plan.length,
    overview: {
      file: overviewFile,
      sha256: sha256(overviewBytes),
      itemOrder: overviewEntries.map(({ itemKey }) => itemKey)
    },
    items
  }
  return { manifest, outputs }
}

export const generatePromotionEvidence = ({ outputRoot, candidateManifestPath }) => {
  const built = buildEvidence({ candidateManifestPath })
  mkdirSync(outputRoot, { recursive: true })
  for (const [file, bytes] of built.outputs) {
    const path = join(outputRoot, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes)
  }
  writeFileSync(join(outputRoot, "manifest.json"), canonicalJson(built.manifest))
  return built.manifest
}

export const verifyPromotionEvidence = ({ outputRoot, candidateManifestPath }) => {
  const manifestPath = join(outputRoot, "manifest.json")
  assert.ok(existsSync(manifestPath), `missing promotion evidence manifest: ${manifestPath}`)
  const actual = JSON.parse(readFileSync(manifestPath, "utf8"))
  const expected = buildEvidence({ candidateManifestPath })
  assert.deepEqual(actual, expected.manifest, "promotion evidence manifest is stale")
  for (const [file, bytes] of expected.outputs) {
    const path = join(outputRoot, file)
    assert.ok(existsSync(path), `missing promotion evidence: ${file}`)
    assert.equal(sha256(readFileSync(path)), sha256(bytes), `promotion evidence is stale: ${file}`)
  }
  return actual
}

const parseArgs = (argv) => {
  const outputIndex = argv.indexOf("--output-root")
  const candidateIndex = argv.indexOf("--candidate-manifest")
  assert.ok(outputIndex >= 0 && argv[outputIndex + 1], "--output-root is required")
  assert.ok(candidateIndex >= 0 && argv[candidateIndex + 1], "--candidate-manifest is required")
  return {
    check: argv.includes("--check"),
    outputRoot: resolve(argv[outputIndex + 1]),
    candidateManifestPath: resolve(argv[candidateIndex + 1])
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const args = parseArgs(process.argv.slice(2))
  const manifest = args.check
    ? verifyPromotionEvidence(args)
    : generatePromotionEvidence(args)
  process.stdout.write(`${JSON.stringify({ itemCount: manifest.itemCount, assetCount: manifest.assetCount }, null, 2)}\n`)
}
