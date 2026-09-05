import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const REPOSITORY_ROOT = resolve(dirname(__filename), "../../..")
const STATIC_RUNTIME_MANIFEST_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_static_runtime_evidence_manifest.json"
)
const DEFAULT_OUTPUT_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_placement_depth_evidence.json"
)
const DEFAULT_CONTACT_SHEET_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_placement_depth_contact_sheet.png"
)

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = (module, filename) => {
  module.exports = filename
}
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && (request.endsWith(".png") || request.endsWith(".webp"))) {
    return resolve(REPOSITORY_ROOT, "apps/mobile/src/features/roomV2", request.slice(2))
  }
  return resolveFilename(request, parent, ...rest)
}

const {
  createRoomV3UniversalCorePlacementDepthEvidenceManifest
} = require("../src/features/roomV2/roomV3UniversalCorePlacementDepthEvidence") as typeof import("../src/features/roomV2/roomV3UniversalCorePlacementDepthEvidence")
const sharp = require("sharp") as (input?: unknown) => any

const PANEL_WIDTH = 280
const PANEL_SHELL_HEIGHT = 160
const PANEL_HEIGHT = 190
const COLUMNS = 5

export async function writeRoomV3UniversalCorePlacementDepthEvidence(
  outputPath = DEFAULT_OUTPUT_PATH,
  contactSheetPath = DEFAULT_CONTACT_SHEET_PATH,
  staticRuntimeManifestPath = STATIC_RUNTIME_MANIFEST_PATH
) {
  const staticRuntimeManifest = JSON.parse(
    await readFile(resolve(staticRuntimeManifestPath), "utf8")
  )
  const manifest = createRoomV3UniversalCorePlacementDepthEvidenceManifest(staticRuntimeManifest)
  await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  await writePlacementContactSheet(manifest, resolve(contactSheetPath))
  return {
    outputPath: resolve(outputPath),
    contactSheetPath: resolve(contactSheetPath),
    productCount: manifest.products.length,
    status: manifest.status,
    promotionEligible: manifest.promotionEligible,
    metadataOnlyBlockedCount: manifest.summary.metadataOnlyBlockedCount
  }
}

async function writePlacementContactSheet(
  manifest: import("../src/features/roomV2/roomV3UniversalCorePlacementDepthEvidence").RoomV3UniversalCorePlacementDepthEvidenceManifest,
  outputPath: string
) {
  const shellPath = resolve(REPOSITORY_ROOT, manifest.lockedShell.sourceAssetPath)
  const shellBuffer = await sharp(shellPath)
    .resize(PANEL_WIDTH, PANEL_SHELL_HEIGHT, { fit: "fill" })
    .png()
    .toBuffer()
  const panels = []
  for (const row of manifest.products) {
    const panel = await renderPanel(row, shellBuffer)
    panels.push(panel)
  }
  const canvasWidth = PANEL_WIDTH * COLUMNS
  const canvasHeight = PANEL_HEIGHT * Math.ceil(panels.length / COLUMNS)
  const composites = panels.map((panel, index) => ({
    input: panel,
    left: (index % COLUMNS) * PANEL_WIDTH,
    top: Math.floor(index / COLUMNS) * PANEL_HEIGHT
  }))
  await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 245, g: 237, b: 244, alpha: 1 }
    }
  })
    .composite(composites)
    .png()
    .toFile(outputPath)
}

async function renderPanel(
  row: import("../src/features/roomV2/roomV3UniversalCorePlacementDepthEvidence").UniversalCorePlacementDepthRow,
  shellBuffer: Buffer
) {
  const overlays = [
    { input: shellBuffer, left: 0, top: 0 },
    {
      input: Buffer.from(createPlacementOverlay(row)),
      left: 0,
      top: 0
    }
  ]
  if (row.support) {
    const supportPath = resolve(
      REPOSITORY_ROOT,
      "apps/mobile/src/features/roomV2/assets/runtime/furniture_world_table_v1.png"
    )
    overlays.splice(1, 0, {
      input: await resizeAsset(supportPath, 0.15, 0.2),
      left: toPixel(row.support.placement.x - row.support.placement.anchor.x * 0.15, PANEL_WIDTH),
      top: toPixel(row.support.placement.y - row.support.placement.anchor.y * 0.2, PANEL_SHELL_HEIGHT)
    })
  }
  const assetPath = resolve(REPOSITORY_ROOT, row.runtimeAssetPath)
  overlays.splice(row.support ? 2 : 1, 0, {
    input: await resizeAsset(
      assetPath,
      row.runtimeRenderBox.width,
      row.runtimeRenderBox.height
    ),
    left: toPixel(
      row.placement.x - row.runtimeRenderBox.width * row.placement.anchor.x,
      PANEL_WIDTH
    ),
    top: toPixel(
      row.placement.y - row.runtimeRenderBox.height * row.placement.anchor.y,
      PANEL_SHELL_HEIGHT
    )
  })
  overlays.push({
    input: Buffer.from(createLabelOverlay(row)),
    left: 0,
    top: PANEL_SHELL_HEIGHT
  })
  return sharp({
    create: {
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      channels: 4,
      background: { r: 245, g: 237, b: 244, alpha: 1 }
    }
  })
    .composite(overlays)
    .png()
    .toBuffer()
}

async function resizeAsset(path: string, width: number, height: number) {
  return sharp(path)
    .resize(Math.max(2, Math.round(width * PANEL_WIDTH)), Math.max(2, Math.round(height * PANEL_SHELL_HEIGHT)), { fit: "fill" })
    .png()
    .toBuffer()
}

function createPlacementOverlay(
  row: import("../src/features/roomV2/roomV3UniversalCorePlacementDepthEvidence").UniversalCorePlacementDepthRow
) {
  const color = row.validation.status === "metadata_only_pass" ? "#2f8f68" : "#c34b64"
  const y = Math.max(3, Math.min(PANEL_SHELL_HEIGHT - 3, Math.round(row.placement.depthY * PANEL_SHELL_HEIGHT)))
  const x = Math.max(3, Math.min(PANEL_WIDTH - 3, Math.round(row.placement.x * PANEL_WIDTH)))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_WIDTH}" height="${PANEL_SHELL_HEIGHT}"><path d="M0 ${y}H${PANEL_WIDTH}" stroke="${color}" stroke-width="1" stroke-dasharray="4 3" opacity=".75"/><circle cx="${x}" cy="${y}" r="3" fill="${color}" stroke="white" stroke-width="1"/></svg>`
}

function createLabelOverlay(
  row: import("../src/features/roomV2/roomV3UniversalCorePlacementDepthEvidence").UniversalCorePlacementDepthRow
) {
  const color = row.validation.status === "metadata_only_pass" ? "#23664c" : "#9c263f"
  const id = escapeXml(row.candidateId)
  const lane = escapeXml(row.depthLane.id)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_WIDTH}" height="30"><rect width="${PANEL_WIDTH}" height="30" fill="#fffafc"/><text x="6" y="12" font-family="Arial,sans-serif" font-size="10" fill="#3e2934">${id}</text><text x="6" y="25" font-family="Arial,sans-serif" font-size="9" fill="${color}">${escapeXml(row.placementSurface)} · ${lane} · ${escapeXml(row.validation.status)}</text></svg>`
}

function toPixel(value: number, scale: number) {
  return Math.round(value * scale)
}

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  })[character]!)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  void writeRoomV3UniversalCorePlacementDepthEvidence()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
