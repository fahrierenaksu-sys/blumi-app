#!/usr/bin/env node

import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

import { getCanonicalUniversalCoreIds } from "./verify-room-v3-universal-core-assets.mjs"

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..")
const DEFAULT_EVIDENCE_ROOT = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-28-six-shell-prototype-current"
)
const EXPECTED_TEST_IDENTIFIER =
  "BlumiMobileUITests/testSixRoomV3ShellCandidatesRenderFullFurnitureCatalogBatches()"
const EXPECTED_VIEWPORT = { width: 750, height: 1334 }

export const FULL_CATALOG_SHELLS = [
  { slug: "apricot_sky_social_loft", label: "Apricot Sky" },
  { slug: "blush_petal_cottage", label: "Blush Petal" },
  { slug: "cocoa_navy_modern_studio", label: "Cocoa Navy" },
  { slug: "sage_cloud_scandinavian", label: "Sage Cloud" },
  { slug: "forest_terracotta_creative_loft", label: "Forest Terracotta" },
  { slug: "lavender_moon_atelier", label: "Lavender Moon" }
]

// This mirrors the exact batch order exercised by the XCTest. Keeping the
// complete IDs here makes the evidence auditable and lets the contract test
// detect drift against the canonical 45-SKU inventory.
export const FULL_CATALOG_BATCHES = [
  [
    "universal_cloud_loveseat_a",
    "universal_dining_chair_a",
    "universal_cloud_bed_b",
    "universal_petal_side_table_a",
    "universal_orbit_floor_lamp_a",
    "universal_tidy_work_desk_a",
    "universal_arc_coffee_table_b",
    "universal_cloud_accent_chair_b"
  ],
  [
    "universal_round_dining_table_a",
    "universal_soft_media_console_b",
    "universal_open_bookshelf_a",
    "universal_table_lamp_a",
    "universal_wall_clock_a",
    "universal_small_tabletop_plant_a",
    "universal_ceramic_vase_set_a",
    "universal_books_magazine_stack_a"
  ],
  [
    "universal_tea_coffee_tray_a",
    "universal_desk_chair_a",
    "universal_bench_a",
    "universal_soft_floor_cushion_a",
    "universal_pet_bed_a",
    "universal_nightstand_a",
    "universal_laundry_basket_a",
    "universal_cushion_set_a"
  ],
  [
    "universal_vanity_table_a",
    "universal_shoe_cabinet_a",
    "universal_long_sofa_a",
    "universal_lounge_armchair_a",
    "universal_rounded_wardrobe_a",
    "universal_soft_coat_stand_a",
    "universal_soft_pouf_b",
    "universal_arch_wall_mirror_a"
  ],
  [
    "universal_storage_cabinet_a",
    "universal_dresser_a",
    "universal_console_table_a",
    "universal_large_standing_plant_a",
    "universal_wall_artwork_a",
    "universal_ceiling_light_a",
    "universal_curtain_set_a",
    "universal_decorative_object_set_a"
  ],
  [
    "universal_small_speaker_a",
    "universal_rug_a",
    "universal_full_length_mirror_a",
    "universal_open_display_shelf_a",
    "universal_room_divider_a"
  ]
]

const TABLETOP_SUPPORT_PRODUCT_ID = "universal_round_dining_table_a"
const TABLETOP_PRODUCT_IDS = new Set([
  "universal_table_lamp_a",
  "universal_small_tabletop_plant_a",
  "universal_ceramic_vase_set_a",
  "universal_books_magazine_stack_a",
  "universal_tea_coffee_tray_a",
  "universal_decorative_object_set_a"
])

export function getFullCatalogBatchSceneCount(batchIndex) {
  const batch = FULL_CATALOG_BATCHES[batchIndex - 1]
  if (!batch) {
    throw new Error(`Unknown full-catalog batch index: ${batchIndex}`)
  }
  const needsSupport = batch.some((id) => TABLETOP_PRODUCT_IDS.has(id))
  const alreadyContainsSupport = batch.includes(TABLETOP_SUPPORT_PRODUCT_ID)
  return batch.length + (needsSupport && !alreadyContainsSupport ? 1 : 0)
}

export function parseFullCatalogAttachmentName(value) {
  const match = String(value).match(
    /^room_shell_(.+)_catalog_batch_(\d{2})_0_[A-Fa-f0-9-]+\.png$/
  )
  if (!match) {
    throw new Error(`Unexpected full-catalog attachment name: ${value}`)
  }
  const shellSlug = match[1]
  const batchIndex = Number(match[2])
  if (
    !FULL_CATALOG_SHELLS.some((shell) => shell.slug === shellSlug) ||
    batchIndex < 1 ||
    batchIndex > FULL_CATALOG_BATCHES.length
  ) {
    throw new Error(`Unexpected full-catalog attachment name: ${value}`)
  }
  return {
    shellSlug,
    shellId: `room_v3_shell_${shellSlug}`,
    batchIndex,
    fileName: `${shellSlug}_catalog_batch_${String(batchIndex).padStart(2, "0")}.png`
  }
}

export async function prepareFullCatalogNativeEvidence({
  evidenceRoot = DEFAULT_EVIDENCE_ROOT,
  producerVerdict = "PENDING"
} = {}) {
  const rawRoot = join(evidenceRoot, "full-catalog-native-raw")
  const nativeRoot = join(evidenceRoot, "full-catalog-native")
  const contactSheetRoot = join(nativeRoot, "contact-sheets")
  const rawManifestPath = join(rawRoot, "manifest.json")
  const compatibilityManifestPath = join(
    evidenceRoot,
    "full_catalog_shell_compatibility_manifest.json"
  )
  const rawManifest = JSON.parse(await readFile(rawManifestPath, "utf8"))
  const testRecord = Array.isArray(rawManifest) ? rawManifest[0] : null
  if (testRecord?.testIdentifier !== EXPECTED_TEST_IDENTIFIER) {
    throw new Error("The exported attachments are not from the full-catalog XCTest")
  }
  const attachments = Array.isArray(testRecord.attachments)
    ? testRecord.attachments
    : []
  if (attachments.length !== 36) {
    throw new Error(`Expected 36 native attachments, found ${attachments.length}`)
  }

  const canonicalFurnitureIds = await getCanonicalUniversalCoreIds()
  const plannedIds = FULL_CATALOG_BATCHES.flat()
  if (
    plannedIds.length !== canonicalFurnitureIds.length ||
    !canonicalFurnitureIds.every((id) => plannedIds.includes(id))
  ) {
    throw new Error("The native batch plan does not match the canonical catalog")
  }

  await Promise.all([
    mkdir(nativeRoot, { recursive: true }),
    mkdir(contactSheetRoot, { recursive: true })
  ])

  const records = []
  const seenCaptureIds = new Set()
  for (const attachment of attachments) {
    const identity = parseFullCatalogAttachmentName(
      attachment.suggestedHumanReadableName
    )
    const captureId = `${identity.shellId}:batch-${String(identity.batchIndex).padStart(2, "0")}`
    if (seenCaptureIds.has(captureId)) {
      throw new Error(`Duplicate native capture identity: ${captureId}`)
    }
    seenCaptureIds.add(captureId)

    const rawPath = join(rawRoot, attachment.exportedFileName)
    const nativePath = join(nativeRoot, identity.fileName)
    const metadata = await sharp(rawPath).metadata()
    if (
      metadata.format !== "png" ||
      metadata.width !== EXPECTED_VIEWPORT.width ||
      metadata.height !== EXPECTED_VIEWPORT.height
    ) {
      throw new Error(`Invalid native attachment viewport: ${attachment.exportedFileName}`)
    }
    await sharp(rawPath).png({ compressionLevel: 6 }).toFile(nativePath)
    records.push({
      ...identity,
      captureId,
      rawPath,
      rawRelativePath: `full-catalog-native-raw/${attachment.exportedFileName}`,
      nativePath,
      nativeRelativePath: `full-catalog-native/${identity.fileName}`,
      furnitureIds: FULL_CATALOG_BATCHES[identity.batchIndex - 1]
    })
  }

  const expectedCaptureIds = new Set(
    FULL_CATALOG_SHELLS.flatMap((shell) =>
      FULL_CATALOG_BATCHES.map(
        (_, index) =>
          `room_v3_shell_${shell.slug}:batch-${String(index + 1).padStart(2, "0")}`
      )
    )
  )
  if (
    seenCaptureIds.size !== expectedCaptureIds.size ||
    [...expectedCaptureIds].some((captureId) => !seenCaptureIds.has(captureId))
  ) {
    throw new Error("Native evidence does not contain every shell and batch pair")
  }

  records.sort(
    (left, right) =>
      FULL_CATALOG_SHELLS.findIndex((shell) => shell.slug === left.shellSlug) -
        FULL_CATALOG_SHELLS.findIndex((shell) => shell.slug === right.shellSlug) ||
      left.batchIndex - right.batchIndex
  )

  await renderContactSheets(records, contactSheetRoot)

  const isPass = producerVerdict === "PASS"
  const captures = await Promise.all(
    records.map(async (record) => ({
      captureId: record.captureId,
      shellId: record.shellId,
      furnitureIds: record.furnitureIds,
      nativeEvidencePath: record.nativeRelativePath,
      nativeEvidenceSha256: await sha256File(record.nativePath),
      rawAttachmentPath: record.rawRelativePath,
      rawAttachmentSha256: await sha256File(record.rawPath),
      renderedSceneItemCount: getFullCatalogBatchSceneCount(record.batchIndex),
      verdict: isPass ? "PASS" : "PENDING"
    }))
  )
  const manifest = {
    schemaVersion: "room-v3-shell-furniture-compatibility-manifest-v1",
    status: isPass ? "PASS" : "PENDING_PRODUCER_VISUAL_REVIEW",
    perspectiveProfile: "my-room-locked-2.5d-v1",
    nativeTestIdentifier: EXPECTED_TEST_IDENTIFIER,
    nativeViewport: EXPECTED_VIEWPORT,
    shellIds: FULL_CATALOG_SHELLS.map(
      (shell) => `room_v3_shell_${shell.slug}`
    ),
    furnitureIds: canonicalFurnitureIds,
    coverageCount: FULL_CATALOG_SHELLS.length * canonicalFurnitureIds.length,
    requiredCoverageCount: 270,
    captureCount: captures.length,
    captures
  }
  await writeFile(
    compatibilityManifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  )
  return { manifest, compatibilityManifestPath, contactSheetRoot }
}

async function renderContactSheets(records, outputRoot) {
  for (const shell of FULL_CATALOG_SHELLS) {
    const entries = records.filter((record) => record.shellSlug === shell.slug)
    await renderContactSheet({
      entries,
      outputPath: join(outputRoot, `${shell.slug}_six_batch_contact_sheet.png`),
      columns: 2,
      tileWidth: 375,
      labelFor: (entry) =>
        `Batch ${String(entry.batchIndex).padStart(2, "0")} · ${entry.furnitureIds.length} catalog · ${getFullCatalogBatchSceneCount(entry.batchIndex)} rendered`
    })
  }
  for (let batchIndex = 1; batchIndex <= FULL_CATALOG_BATCHES.length; batchIndex += 1) {
    const entries = FULL_CATALOG_SHELLS.map((shell) =>
      records.find(
        (record) =>
          record.shellSlug === shell.slug && record.batchIndex === batchIndex
      )
    )
    if (entries.some((entry) => !entry)) {
      throw new Error(`Missing contact-sheet entry for batch ${batchIndex}`)
    }
    await renderContactSheet({
      entries,
      outputPath: join(
        outputRoot,
        `catalog_batch_${String(batchIndex).padStart(2, "0")}_six_shell_contact_sheet.png`
      ),
      columns: 3,
      tileWidth: 250,
      labelFor: (entry) =>
        FULL_CATALOG_SHELLS.find((shell) => shell.slug === entry.shellSlug)?.label ??
        entry.shellSlug
    })
  }
}

async function renderContactSheet({
  entries,
  outputPath,
  columns,
  tileWidth,
  labelFor
}) {
  const imageHeight = Math.round((tileWidth * EXPECTED_VIEWPORT.height) / EXPECTED_VIEWPORT.width)
  const labelHeight = tileWidth >= 350 ? 40 : 32
  const tileHeight = labelHeight + imageHeight
  const rows = Math.ceil(entries.length / columns)
  const composites = []
  for (const [index, entry] of entries.entries()) {
    const left = (index % columns) * tileWidth
    const top = Math.floor(index / columns) * tileHeight
    const image = await sharp(entry.nativePath)
      .resize(tileWidth, imageHeight, { fit: "fill" })
      .png()
      .toBuffer()
    composites.push(
      { input: labelSvg(tileWidth, labelHeight, labelFor(entry)), left, top },
      { input: image, left, top: top + labelHeight }
    )
  }
  await sharp({
    create: {
      width: columns * tileWidth,
      height: rows * tileHeight,
      channels: 4,
      background: { r: 249, g: 245, b: 251, alpha: 1 }
    }
  })
    .composite(composites)
    .png({ compressionLevel: 6 })
    .toFile(outputPath)
}

function labelSvg(width, height, label) {
  const fontSize = width >= 350 ? 18 : 14
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="100%" height="100%" fill="#35243f"/>` +
      `<text x="${width / 2}" y="${Math.round(height * 0.66)}" text-anchor="middle" ` +
      `font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="${fontSize}" ` +
      `font-weight="600" fill="#fff8ff">${escapeXml(label)}</text></svg>`
  )
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

async function sha256File(path) {
  const bytes = await readFile(path)
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const producerVerdict = process.argv.includes("--pass") ? "PASS" : "PENDING"
  const result = await prepareFullCatalogNativeEvidence({ producerVerdict })
  process.stdout.write(
    `${JSON.stringify({
      manifestPath: result.compatibilityManifestPath,
      status: result.manifest.status,
      captureCount: result.manifest.captureCount,
      coverageCount: result.manifest.coverageCount,
      contactSheetRoot: result.contactSheetRoot
    }, null, 2)}\n`
  )
}
