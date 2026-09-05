#!/usr/bin/env node

import { createHash } from "node:crypto"
import { execFileSync, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs"
import { resolve, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const SCRIPT_DIRECTORY = resolve(import.meta.dirname)
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..")
const MOBILE_ROOT = resolve(REPOSITORY_ROOT, "apps/mobile")
const MASTER_PATH = resolve(
  REPOSITORY_ROOT,
  "apps/mobile/src/features/roomV2/assets/runtime/room_shell_blumi_world_v1.webp"
)
const ARTIFACT_MANIFEST_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-18-universal-core-wave/universal_core_artifact_registry.json"
)
const DEFAULT_OUTPUT_DIRECTORY = resolve(
  REPOSITORY_ROOT,
  "docs/room-v3-qa/2026-07-18-phase7-furnished-layout"
)

const BOARD_WIDTH = 627
const BOARD_HEIGHT = 357
const CARD_WIDTH = 627
const CARD_HEIGHT = 393
const HEADER_HEIGHT = 36
const DIRECTIONS = ["front", "back", "left", "right"]

const SCENARIOS = [
  {
    id: "seating_collision",
    label: "Seating / footprint / approach + exit",
    items: [
      {
        itemId: "universal_cloud_loveseat_a",
        x: 0.42,
        y: 0.81,
        rotation: "front"
      },
      {
        itemId: "universal_cloud_accent_chair_b",
        x: 0.73,
        y: 0.79,
        rotation: "right"
      }
    ]
  },
  {
    id: "tabletop_support",
    label: "Tabletop support / contact bounds",
    items: [
      {
        itemId: "universal_tidy_work_desk_a",
        x: 0.5,
        y: 0.8,
        rotation: "front"
      },
      {
        itemId: "universal_table_lamp_a",
        x: 0.5,
        y: 0.61,
        rotation: "front",
        supportedBy: "universal_tidy_work_desk_a"
      }
    ]
  },
  {
    id: "floor_collision",
    label: "Floor blockers / deliberate overlap debug",
    items: [
      {
        itemId: "universal_room_divider_a",
        x: 0.61,
        y: 0.82,
        rotation: "left"
      },
      {
        itemId: "universal_full_length_mirror_a",
        x: 0.58,
        y: 0.81,
        rotation: "right"
      },
      {
        itemId: "universal_rug_a",
        x: 0.3,
        y: 0.84,
        rotation: "front"
      }
    ]
  }
]

function parseArguments(argv) {
  const outputIndex = argv.indexOf("--output-dir")
  const artifactIndex = argv.indexOf("--artifact-manifest")
  return {
    outputDirectory: resolve(
      outputIndex >= 0 ? argv[outputIndex + 1] : DEFAULT_OUTPUT_DIRECTORY
    ),
    artifactManifestPath: resolve(
      artifactIndex >= 0 ? argv[artifactIndex + 1] : ARTIFACT_MANIFEST_PATH
    )
  }
}

function loadRuntimeFurniture(artifactManifestPath) {
  const bootstrap = `
const path = require("node:path")
require.extensions[".png"] = (module, filename) => { module.exports = filename }
const runtimeModule = require("node:module")
const originalResolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && request.endsWith(".png")) {
    return path.resolve(process.cwd(), "src/features/roomV2", request.slice(2))
  }
  return originalResolveFilename(request, parent, ...rest)
}
const runtime = require("./src/features/roomV2/roomV3UniversalCoreRuntimeFurniture")
const report = require(${JSON.stringify(artifactManifestPath)})
if (report.isTrusted !== true || !Array.isArray(report.products)) {
  throw new Error("Universal Core artifact registry is not trusted")
}
const verifiedAssetHashesByCandidateId = Object.fromEntries(
  report.products.map((product) => [
    product.id,
    Object.fromEntries(product.assets.map((asset) => [asset.direction, asset.sha256]))
  ])
)
const registry = {
  verifierId: runtime.ROOM_V3_UNIVERSAL_CORE_ARTIFACT_VERIFIER_ID,
  artifactManifestId: runtime.ROOM_V3_UNIVERSAL_CORE_ARTIFACT_MANIFEST_ID,
  verifiedCandidateIds: [...runtime.ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS],
  verifiedAssetHashesByCandidateId
}
const furniture = runtime.createRoomV3UniversalCoreRuntimeFurniture(registry)
const serialized = furniture.map((item) => ({
  id: item.id,
  name: item.name,
  width: item.width,
  height: item.height,
  anchor: item.anchor ?? { x: 0.5, y: 1 },
  placementSurface: item.placementSurface ?? "floor",
  blocksMovement: item.blocksMovement ?? false,
  interactionType: item.interactionType ?? "none",
  rotationPolicy: item.rotationPolicy ?? null,
  footprint: item.footprint ?? null,
  footprintByRotation: item.footprintByRotation ?? null,
  seatSpec: item.seatSpec ?? null,
  surfaceSupports: item.surfaceSupports ?? [],
  assetSources: Object.fromEntries(
    Object.entries(item.assetsByRotation ?? { front: item.asset }).map(([rotation, asset]) => [rotation, asset.source])
  )
}))
if (serialized.length !== runtime.ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.length) {
  throw new Error("trusted Universal Core runtime metadata is incomplete:" + serialized.length + "/" + runtime.ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS.length)
}
process.stdout.write(JSON.stringify(serialized))
`
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "-e", bootstrap],
    { cwd: MOBILE_ROOT, encoding: "utf8" }
  )
  if (result.status !== 0) {
    throw new Error(`Unable to load runtime furniture metadata: ${result.stderr || result.stdout}`)
  }
  return JSON.parse(result.stdout)
}

function getItemById(items, itemId) {
  const item = items.find((candidate) => candidate.id === itemId)
  if (!item) throw new Error(`Missing runtime furniture metadata for ${itemId}`)
  return item
}

function getFootprint(item, rotation) {
  return item.footprintByRotation?.[rotation] ?? item.footprint ?? {
    width: item.width,
    height: item.height
  }
}

function getImageBounds(item, placement) {
  const anchor = item.anchor ?? { x: 0.5, y: 1 }
  const minX = placement.x - item.width * anchor.x
  const minY = placement.y - item.height * anchor.y
  return {
    minX,
    minY,
    maxX: minX + item.width,
    maxY: minY + item.height
  }
}

function getCollisionBounds(item, placement) {
  const footprint = getFootprint(item, placement.rotation)
  const anchor = item.anchor ?? { x: 0.5, y: 1 }
  const minX = placement.x - footprint.width * anchor.x
  const minY = placement.y - footprint.height * anchor.y
  return {
    minX,
    minY,
    maxX: minX + footprint.width,
    maxY: minY + footprint.height,
    width: footprint.width,
    height: footprint.height
  }
}

function overlaps(a, b) {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY
  )
}

function rotatePoint(point, rotation) {
  if (rotation === "back") return { x: -point.x, y: -point.y }
  if (rotation === "left") return { x: point.y, y: -point.x }
  if (rotation === "right") return { x: -point.y, y: point.x }
  return { ...point }
}

function rotateFacing(facing, rotation) {
  const facingOrder = ["front", "right", "back", "left"]
  const facingIndex = facingOrder.indexOf(facing)
  const rotationIndex = facingOrder.indexOf(rotation)
  if (facingIndex < 0 || rotationIndex < 0) return facing
  return facingOrder[(facingIndex + rotationIndex) % facingOrder.length]
}

function getSeatDebug(item, placement) {
  const seatPoints = item.seatSpec?.seatPoints ?? []
  if (!seatPoints.length || item.seatSpec.capacity !== seatPoints.length) return []
  return seatPoints.map((seatPoint) => {
    const seat = rotatePoint(seatPoint, placement.rotation)
    const approach = rotatePoint(seatPoint.approachPoint, placement.rotation)
    const exit = rotatePoint(seatPoint.exitPoint, placement.rotation)
    return {
      id: seatPoint.id,
      facing: rotateFacing(seatPoint.facing ?? "front", placement.rotation),
      seatHeight: seatPoint.seatHeight,
      seat: {
        x: placement.x + seat.x * item.width,
        y: placement.y + seat.y * item.height
      },
      approach: {
        x: placement.x + approach.x * item.width,
        y: placement.y + approach.y * item.height
      },
      exit: {
        x: placement.x + exit.x * item.width,
        y: placement.y + exit.y * item.height
      }
    }
  })
}

function getSurfaceSupportDebug(item, placement, supportingItem, supportingPlacement) {
  if (!supportingItem || !supportingPlacement) return []
  const supports = supportingItem.surfaceSupports ?? []
  const support = supports.find((candidate) => candidate.surface === item.placementSurface)
  if (!support) return []
  const localBounds = support.localBoundsByRotation?.[supportingPlacement.rotation] ?? support.localBounds
  const supportImageBounds = getImageBounds(supportingItem, supportingPlacement)
  const supportBounds = {
    minX: supportImageBounds.minX + localBounds.minX * supportingItem.width,
    maxX: supportImageBounds.minX + localBounds.maxX * supportingItem.width,
    minY: supportImageBounds.minY + localBounds.minY * supportingItem.height,
    maxY: supportImageBounds.minY + localBounds.maxY * supportingItem.height
  }
  const footprint = item.footprint ?? {
    width: item.width * 0.7,
    height: Math.max(item.height * 0.12, 0.004)
  }
  const contactBounds = {
    minX: placement.x - footprint.width / 2,
    maxX: placement.x + footprint.width / 2,
    minY: placement.y - footprint.height,
    maxY: placement.y
  }
  const isSupported =
    contactBounds.minX >= supportBounds.minX &&
    contactBounds.maxX <= supportBounds.maxX &&
    contactBounds.minY >= supportBounds.minY &&
    contactBounds.maxY <= supportBounds.maxY
  return [{
    supportedBy: supportingItem.id,
    isSupported,
    supportBounds,
    contactBounds
  }]
}

function prepareScenario(items, scenario) {
  const placements = scenario.items.map((placement) => ({
    ...placement,
    item: getItemById(items, placement.itemId)
  }))
  const collisionBounds = new Map(
    placements.map((placement) => [placement.itemId, getCollisionBounds(placement.item, placement)])
  )
  return placements.map((placement) => {
    const supportingPlacement = placements.find((candidate) => candidate.itemId === placement.supportedBy)
    const blockingOverlapWith = placements
      .filter((candidate) => candidate.itemId !== placement.itemId)
      .filter((candidate) => placement.item.blocksMovement && candidate.item.blocksMovement)
      .filter((candidate) => overlaps(collisionBounds.get(placement.itemId), collisionBounds.get(candidate.itemId)))
      .map((candidate) => candidate.itemId)
    return {
      ...placement,
      imageBounds: getImageBounds(placement.item, placement),
      collisionBounds: collisionBounds.get(placement.itemId),
      seatDebug: getSeatDebug(placement.item, placement),
      surfaceSupportDebug: getSurfaceSupportDebug(
        placement.item,
        placement,
        supportingPlacement?.item,
        supportingPlacement
      ),
      collisionDebug: {
        blocksMovement: placement.item.blocksMovement,
        overlapWith: blockingOverlapWith
      }
    }
  })
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function toPx(point) {
  return { x: point.x * BOARD_WIDTH, y: HEADER_HEIGHT + point.y * BOARD_HEIGHT }
}

function rectSvg(bounds, color, options = {}) {
  const x = bounds.minX * BOARD_WIDTH
  const y = HEADER_HEIGHT + bounds.minY * BOARD_HEIGHT
  const width = (bounds.maxX - bounds.minX) * BOARD_WIDTH
  const height = (bounds.maxY - bounds.minY) * BOARD_HEIGHT
  const dash = options.dash ? ` stroke-dasharray="${options.dash}"` : ""
  const fill = options.fill ?? "none"
  const fillOpacity = options.fillOpacity ?? 0
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="2"${dash}/>`
}

function markerSvg(point, color, label) {
  const px = toPx(point)
  return `<circle cx="${px.x.toFixed(1)}" cy="${px.y.toFixed(1)}" r="4" fill="${color}" stroke="#fff" stroke-width="1.5"/><text x="${(px.x + 7).toFixed(1)}" y="${(px.y - 5).toFixed(1)}" fill="${color}" font-size="10" font-family="sans-serif">${escapeXml(label)}</text>`
}

function lineSvg(from, to, color) {
  const start = toPx(from)
  const end = toPx(to)
  return `<line x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-dasharray="5 4"/>`
}

function createOverlaySvg(scenario, placements) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">`,
    `<rect width="${CARD_WIDTH}" height="${HEADER_HEIGHT}" fill="#1b1724"/>`,
    `<text x="14" y="23" fill="#fff" font-size="15" font-family="sans-serif">${escapeXml(scenario.label)}</text>`
  ]
  for (const placement of placements) {
    const label = placement.itemId.replace(/^universal_/, "").replace(/_a$|_b$/, "")
    parts.push(rectSvg(placement.imageBounds, "#d5c8df", { dash: "4 4" }))
    parts.push(rectSvg(
      placement.collisionBounds,
      placement.collisionDebug.overlapWith.length ? "#ff5864" : placement.collisionDebug.blocksMovement ? "#f2a93b" : "#9da5b6",
      { fill: placement.collisionDebug.overlapWith.length ? "#ff5864" : "#f2a93b", fillOpacity: 0.12 }
    ))
    const imageLabel = toPx({ x: placement.imageBounds.minX, y: placement.imageBounds.minY })
    parts.push(`<text x="${Math.max(4, imageLabel.x + 3).toFixed(1)}" y="${Math.max(HEADER_HEIGHT + 13, imageLabel.y + 13).toFixed(1)}" fill="#fff" font-size="10" font-family="sans-serif" stroke="#241f2d" stroke-width="2" paint-order="stroke">${escapeXml(label)}</text>`)
    for (const seat of placement.seatDebug) {
      parts.push(lineSvg(seat.approach, seat.seat, "#e9559b"))
      parts.push(lineSvg(seat.seat, seat.exit, "#f2b94b"))
      parts.push(markerSvg(seat.approach, "#e9559b", `${seat.id} approach`))
      parts.push(markerSvg(seat.seat, "#fff", `${seat.id} seat`))
      parts.push(markerSvg(seat.exit, "#f2b94b", `${seat.id} exit`))
    }
    for (const support of placement.surfaceSupportDebug) {
      parts.push(rectSvg(support.supportBounds, support.isSupported ? "#a678f0" : "#ff5864", { dash: "7 4", fill: "#a678f0", fillOpacity: 0.11 }))
      parts.push(rectSvg(support.contactBounds, support.isSupported ? "#59d9a6" : "#ff5864", { dash: "3 3", fill: support.isSupported ? "#59d9a6" : "#ff5864", fillOpacity: 0.16 }))
      const supportLabel = toPx({ x: support.supportBounds.minX, y: support.supportBounds.minY })
      parts.push(`<text x="${(supportLabel.x + 3).toFixed(1)}" y="${(supportLabel.y - 4).toFixed(1)}" fill="${support.isSupported ? "#d0b8ff" : "#ffb2b7"}" font-size="10" font-family="sans-serif">${support.isSupported ? "SUPPORT OK" : "SUPPORT MISS"}</text>`)
    }
    if (placement.collisionDebug.overlapWith.length) {
      const collisionLabel = toPx({ x: placement.collisionBounds.minX, y: placement.collisionBounds.maxY })
      parts.push(`<text x="${(collisionLabel.x + 3).toFixed(1)}" y="${(collisionLabel.y + 13).toFixed(1)}" fill="#ffb2b7" font-size="10" font-family="sans-serif">BLOCKED overlap</text>`)
    }
  }
  parts.push(
    `<text x="14" y="${CARD_HEIGHT - 10}" fill="#f7eefa" font-size="10" font-family="sans-serif">Static debug only · orange/red = movement blocker · magenta/gold = seat path · purple/green = tabletop support</text>`,
    "</svg>"
  )
  return Buffer.from(parts.join(""))
}

async function renderScenario(scenario, placements) {
  const base = await sharp(MASTER_PATH)
    .resize(BOARD_WIDTH, BOARD_HEIGHT)
    .png()
    .toBuffer()
  const composites = [{ input: base, left: 0, top: HEADER_HEIGHT }]
  for (const placement of [...placements].sort((a, b) => a.y - b.y)) {
    const source = placement.item.assetSources[placement.rotation] ?? placement.item.assetSources.front
    if (!source || !existsSync(source)) throw new Error(`Missing furniture source for ${placement.itemId}`)
    const image = await sharp(source)
      .resize({
        width: Math.max(1, Math.round(placement.item.width * BOARD_WIDTH)),
        height: Math.max(1, Math.round(placement.item.height * BOARD_HEIGHT)),
        fit: "fill"
      })
      .png()
      .toBuffer()
    const bounds = placement.imageBounds
    composites.push({
      input: image,
      left: Math.round(bounds.minX * BOARD_WIDTH),
      top: HEADER_HEIGHT + Math.round(bounds.minY * BOARD_HEIGHT)
    })
  }
  composites.push({ input: createOverlaySvg(scenario, placements), left: 0, top: 0 })
  return sharp({
    create: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      channels: 4,
      background: { r: 27, g: 23, b: 36, alpha: 1 }
    }
  })
    .composite(composites)
    .png()
    .toBuffer()
}

function createLegendSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">
    <rect width="100%" height="100%" fill="#1b1724"/>
    <text x="24" y="52" fill="#fff" font-size="22" font-family="sans-serif">Phase 7 furnished-layout debug</text>
    <text x="24" y="86" fill="#d8cfe0" font-size="13" font-family="sans-serif">Runtime metadata is loaded from the Universal Core TS factory.</text>
    <text x="24" y="108" fill="#d8cfe0" font-size="13" font-family="sans-serif">These boards show deterministic geometry, not Simulator acceptance.</text>
    <rect x="24" y="146" width="26" height="18" fill="#f2a93b" fill-opacity="0.18" stroke="#f2a93b" stroke-width="2"/><text x="64" y="160" fill="#fff" font-size="13" font-family="sans-serif">blocking footprint</text>
    <rect x="24" y="184" width="26" height="18" fill="#a678f0" fill-opacity="0.11" stroke="#a678f0" stroke-width="2" stroke-dasharray="7 4"/><text x="64" y="198" fill="#fff" font-size="13" font-family="sans-serif">support surface bounds</text>
    <circle cx="37" cy="230" r="5" fill="#fff" stroke="#e9559b" stroke-width="2"/><text x="64" y="235" fill="#fff" font-size="13" font-family="sans-serif">seat / approach / exit markers</text>
    <text x="24" y="286" fill="#ffb2b7" font-size="13" font-family="sans-serif">Promotion remains BLOCKED until per-SKU Simulator collision, seating,</text>
    <text x="24" y="307" fill="#ffb2b7" font-size="13" font-family="sans-serif">persistence, independent review, and immutable build evidence exist.</text>
  </svg>`)
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function relativePath(path) {
  return relative(REPOSITORY_ROOT, path)
}

function createEvidenceMarkdownLegacy(manifest) {
  /*
  return `# Phase 7 furnished-layout evidence\n\nStatus: BLOCKED\n\nThis record is deterministic collision/seat/support geometry evidence generated from the Universal Core runtime factory. It is evidence-only and does not promote furniture into the user-visible catalog.\n\n- Change title: Phase 7 furnished-layout collision and seating debug\n- Scope: Three representative layouts covering seating, tabletop support, and floor blockers\n- Requirement / canonical standard: \\`docs/quality/QA_EVIDENCE_TEMPLATE.md\\`, Room V3 promotion contract, and Room V2 placement/collision contracts\n- Reference: \\`${relativePath(MASTER_PATH)}\\`\n- Viewport / base identity: ${BOARD_WIDTH}x${BOARD_HEIGHT} render of the locked Room V2 shell; source shell remains evidence-only\n- Commit / SHA: ${manifest.sourceCommitSha ?? "N/A — working tree has no immutable promotion commit"}\n- Producer: \\`render-room-v3-phase7-furnished-layout-evidence.mjs\\`\n- Independent reviewer: PENDING\n- Tests: \\`node --test apps/mobile/scripts/room-v3-phase7-furnished-layout-evidence.test.mjs\\`\n- Coverage: ${manifest.coverage.runtimeCandidateCount} runtime candidates loaded; ${manifest.scenarios.length} deterministic debug scenarios\n- TypeScript / build checks: Runtime metadata load is exercised through \\`tsx\\`; mobile build/promotion checks remain pending\n- Visual evidence: \\`phase7_furnished_layout_collision_debug.png\\`\n- Same-state comparison: Every card uses the same locked shell and normalized placement contract\n- Contact sheet: \\`phase7_furnished_layout_collision_debug.png\\`\n- Close-up: Per-item collision and seat markers are drawn at native board scale\n- Accessibility / Reduce Motion: N/A for static evidence; Simulator readability remains pending\n- Security / migration evidence: N/A\n- Failure record: Current Phase 7 evidence still lacks per-SKU Simulator collision/seating/persistence proof and independent review\n- Retest record: Generator is reproducible from runtime metadata and the trusted Universal Core artifact registry\n- Producer verdict: BLOCKED\n- Independent reviewer verdict: PENDING\n- Verdict: \`BLOCKED\`\n- Promotion decision: Keep Universal Core outside the user-visible catalog\n- Known limitations: Static geometry cannot prove live touch placement, avatar approach/exit, persistence after relaunch, or final iOS Simulator compositing; the deliberate floor-overlap card is a debug fixture, not a passing layout\n- Evidence paths:\n  - \`phase7_furnished_layout_manifest.json\`\n  - \`phase7_furnished_layout_collision_debug.png\`\n\nManifest: \\`${manifest.artifactId}\\`\n`
}

  */
}

function createEvidenceMarkdown(manifest) {
  return [
    "# Phase 7 furnished-layout evidence",
    "",
    "Status: BLOCKED",
    "",
    "This record is deterministic collision/seat/support geometry evidence generated from the Universal Core runtime factory. It is evidence-only and does not promote furniture into the user-visible catalog.",
    "",
    "- Change title: Phase 7 furnished-layout collision and seating debug",
    "- Scope: Three representative layouts covering seating, tabletop support, and floor blockers",
    "- Requirement / canonical standard: docs/quality/QA_EVIDENCE_TEMPLATE.md, Room V3 promotion contract, and Room V2 placement/collision contracts",
    `- Reference: ${relativePath(MASTER_PATH)}`,
    `- Viewport / base identity: ${BOARD_WIDTH}x${BOARD_HEIGHT} render of the locked Room V2 shell; source shell remains evidence-only`,
    `- Commit / SHA: ${manifest.sourceCommitSha ?? "N/A - working tree has no immutable promotion commit"}`,
    "- Producer: render-room-v3-phase7-furnished-layout-evidence.mjs",
    "- Independent reviewer: PENDING",
    "- Tests: node --test apps/mobile/scripts/room-v3-phase7-furnished-layout-evidence.test.mjs",
    `- Coverage: ${manifest.coverage.runtimeCandidateCount} runtime candidates loaded; ${manifest.scenarios.length} deterministic debug scenarios`,
    "- TypeScript / build checks: Runtime metadata load is exercised through tsx; mobile build/promotion checks remain pending",
    "- Visual evidence: phase7_furnished_layout_collision_debug.png",
    "- Same-state comparison: Every card uses the same locked shell and normalized placement contract",
    "- Contact sheet: phase7_furnished_layout_collision_debug.png",
    "- Close-up: Per-item collision and seat markers are drawn at native board scale",
    "- Accessibility / Reduce Motion: N/A for static evidence; Simulator readability remains pending",
    "- Security / migration evidence: N/A",
    "- Failure record: Current Phase 7 evidence still lacks per-SKU Simulator collision/seating/persistence proof and independent review",
    "- Retest record: Generator is reproducible from runtime metadata and the trusted Universal Core artifact registry",
    "- Producer verdict: BLOCKED",
    "- Independent reviewer verdict: PENDING",
    "- Verdict: BLOCKED",
    "- Promotion decision: Keep Universal Core outside the user-visible catalog",
    "- Known limitations: Static geometry cannot prove live touch placement, avatar approach/exit, persistence after relaunch, or final iOS Simulator compositing; the deliberate floor-overlap card is a debug fixture, not a passing layout",
    "- Evidence paths:",
    "  - phase7_furnished_layout_manifest.json",
    "  - phase7_furnished_layout_collision_debug.png",
    "",
    `Manifest: ${manifest.artifactId}`,
    ""
  ].join("\n")
}

async function main() {
  const { outputDirectory, artifactManifestPath } = parseArguments(process.argv.slice(2))
  if (!existsSync(MASTER_PATH)) throw new Error(`Missing shell reference: ${MASTER_PATH}`)
  if (!existsSync(artifactManifestPath)) throw new Error(`Missing artifact registry: ${artifactManifestPath}`)

  mkdirSync(outputDirectory, { recursive: true })
  const items = loadRuntimeFurniture(artifactManifestPath)
  const manifestScenarios = []
  const cards = []
  for (const scenario of SCENARIOS) {
    const placements = prepareScenario(items, scenario)
    const card = await renderScenario(scenario, placements)
    cards.push(card)
    manifestScenarios.push({
      id: scenario.id,
      label: scenario.label,
      items: placements.map((placement) => ({
        itemId: placement.itemId,
        rotation: placement.rotation,
        normalizedPlacement: {
          x: placement.x,
          y: placement.y,
          width: placement.item.width,
          height: placement.item.height
        },
        placementSurface: placement.item.placementSurface,
        collisionDebug: placement.collisionDebug,
        seatDebug: placement.seatDebug,
        surfaceSupportDebug: placement.surfaceSupportDebug
      }))
    })
  }

  const legend = createLegendSvg()
  const board = await sharp({
    create: {
      width: CARD_WIDTH * 2,
      height: CARD_HEIGHT * 2,
      channels: 4,
      background: { r: 15, g: 13, b: 22, alpha: 1 }
    }
  })
    .composite([
      { input: cards[0], left: 0, top: 0 },
      { input: cards[1], left: CARD_WIDTH, top: 0 },
      { input: cards[2], left: 0, top: CARD_HEIGHT },
      { input: legend, left: CARD_WIDTH, top: CARD_HEIGHT }
    ])
    .png()
    .toBuffer()

  const boardPath = join(outputDirectory, "phase7_furnished_layout_collision_debug.png")
  writeFileSync(boardPath, board)
  const sourceCommitSha = (() => {
    try {
      const worktreeStatus = execFileSync("git", ["status", "--porcelain"], {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8"
      }).trim()
      if (worktreeStatus) return null
      return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPOSITORY_ROOT, encoding: "utf8" }).trim()
    } catch {
      return null
    }
  })()
  const manifest = {
    schemaVersion: 1,
    artifactId: "phase7-furnished-layout-collision-debug-2026-07-18",
    generatedAt: new Date().toISOString(),
    status: "evidence_only_pending_simulator_and_independent_review",
    sourceCommitSha,
    referenceShell: relativePath(MASTER_PATH),
    artifactRegistry: relativePath(artifactManifestPath),
    producer: "render-room-v3-phase7-furnished-layout-evidence.mjs",
    independentReviewer: null,
    coverage: {
      runtimeCandidateCount: items.length,
      scenarios: SCENARIOS.map((scenario) => scenario.id),
      boardSha256: sha256(board)
    },
    scenarios: manifestScenarios,
    limitations: [
      "Static evidence does not prove live Simulator touch placement, avatar approach/exit, or persistence after relaunch.",
      "The floor_collision scenario intentionally overlaps two blocking items to make collision debugging visible.",
      "Promotion remains blocked until independent review and immutable build evidence are recorded."
    ]
  }
  const manifestPath = join(outputDirectory, "phase7_furnished_layout_manifest.json")
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  writeFileSync(join(outputDirectory, "evidence.md"), createEvidenceMarkdown(manifest), "utf8")
  process.stdout.write(JSON.stringify({
    outputDirectory: relativePath(outputDirectory),
    board: relativePath(boardPath),
    manifest: relativePath(manifestPath),
    runtimeCandidateCount: items.length,
    scenarioCount: SCENARIOS.length,
    status: manifest.status
  }, null, 2) + "\n")
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}

export {
  SCENARIOS,
  getCollisionBounds,
  getSeatDebug,
  getSurfaceSupportDebug,
  prepareScenario
}
