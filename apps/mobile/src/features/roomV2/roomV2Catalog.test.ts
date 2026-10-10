import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}
require.extensions[".webp"] = require.extensions[".png"]

// The focused TypeScript test runner emits JS to a temporary directory while
// the React Native asset files remain in the source tree. Resolve those image
// requests back to the checked-in assets before Node applies the extension
// stubs above.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const runtimeModule = require("node:module") as {
  _resolveFilename: (request: string, parent: NodeModule | null, ...rest: unknown[]) => string
}
const resolveFilename = runtimeModule._resolveFilename
runtimeModule._resolveFilename = (request, parent, ...rest) => {
  if (request.startsWith("./assets/") && /\.(png|webp)$/.test(request)) {
    return path.resolve(process.cwd(), "src/features/roomV2", request.slice(2))
  }
  // the layered furniture art next to its emitted module: back to the checked-in file in src
  if (request.startsWith(".") && /\.(png|webp)$/.test(request) && parent?.filename) {
    const sourceDirectory = path.dirname(parent.filename).replace(/\/\.blumi-[^/]+-tests-[^/]+(?=\/)/, "/src")
    return path.resolve(sourceDirectory, request)
  }
  return resolveFilename(request, parent, ...rest)
}

// The room seam as App.tsx installs it, with the real layered furniture art (before the room modules load).
/* eslint-disable @typescript-eslint/no-require-imports -- the seam must be in place before the room catalog loads */
const { LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS } = require("./furniture/layeredFurnitureAssets") as
  typeof import("./furniture/layeredFurnitureAssets")
const { createRoomAvatar25dFurnitureCatalog } = require("./furniture/layeredFurnitureCatalog") as
  typeof import("./furniture/layeredFurnitureCatalog")
const { createRoomAvatar25dRoomCalibration } = require("./calibration/roomAvatar25dRoomCalibration") as
  typeof import("./calibration/roomAvatar25dRoomCalibration")
const { roomAvatar25d: seamStub, installRoomAvatarSeam } = require("../avatar/roomAvatarSeam") as
  typeof import("../avatar/roomAvatarSeam")
/* eslint-enable @typescript-eslint/no-require-imports */
installRoomAvatarSeam({
  ...seamStub,
  roomCalibration: createRoomAvatar25dRoomCalibration(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS),
  furnitureCatalog: createRoomAvatar25dFurnitureCatalog(LAYERED_FURNITURE_ASSETS, LAYERED_WALL_ASSETS)
})

const {
  DEFAULT_ROOM_V2_SHELL_ID,
  ROOM_V2_FURNITURE_CATALOG,
  ROOM_V2_SHELL_CATALOG
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2Catalog") as typeof import("./roomV2Catalog")
const {
  roomV2ProductionAssets
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./roomV2ProductionAssets") as typeof import("./roomV2ProductionAssets")

function collectAssetSources(input: unknown): string[] {
  if (!input || typeof input !== "object") {
    return []
  }

  if ("source" in input && typeof (input as { source?: unknown }).source === "string") {
    return [(input as { source: string }).source]
  }

  return Object.values(input).flatMap((value) => collectAssetSources(value))
}

test("the owner-locked room shell stays the default 1254x714 Blumi World shell", () => {
  // The fixed camera angle and shell geometry are the owner's chosen look.
  // Walkable polygons, placement areas and bands stay free to evolve.
  assert.equal(DEFAULT_ROOM_V2_SHELL_ID, "room_v2_shell_blumi_world_v1")
  const shell = ROOM_V2_SHELL_CATALOG.find((candidate) => candidate.id === DEFAULT_ROOM_V2_SHELL_ID)
  assert.ok(shell)
  assert.deepEqual(shell.canvasSize, { width: 1254, height: 714 })
  assert.equal(shell.asset, roomV2ProductionAssets.shells.blumiWorldShellV1)
  assert.equal(
    shell.asset.source,
    path.resolve(process.cwd(), "src/features/roomV2/assets/runtime/room_shell_blumi_world_v1.webp")
  )
})

test("the live shell catalog holds no candidate, pending-QA or draft room_v3 shells", () => {
  assert.ok(ROOM_V2_SHELL_CATALOG.length > 0)
  for (const shell of ROOM_V2_SHELL_CATALOG) {
    assert.notEqual(shell.sourceStatus, "candidate", shell.id)
    assert.notEqual(shell.qaStatus, "pending", shell.id)
    assert.equal(shell.id.startsWith("room_v3_shell_"), false, shell.id)
  }
})

test("runtime assets do not bundle the blocked historical shell draft", () => {
  assert.equal("mintGardenMasterDraft" in roomV2ProductionAssets.shells, false)
  assert.equal(
    collectAssetSources(roomV2ProductionAssets).some((source) =>
      source.includes("/assets/runtime/room-vnext/")
    ),
    false
  )
})

test("active Room V2 seating declares complete seatSpec routing metadata", () => {
  const seats = ROOM_V2_FURNITURE_CATALOG.filter((item) => item.interactionType === "seat")
  assert.ok(seats.length > 0)
  for (const item of seats) {
    assert.ok(item.seatSpec, item.id)
    assert.equal(item.seatSpec.capacity, item.seatSpec.seatPoints.length, item.id)
    for (const seat of item.seatSpec.seatPoints) {
      assert.ok(seat.approachPoint, item.id)
      assert.ok(seat.exitPoint, item.id)
      assert.equal(typeof seat.seatHeight, "number", item.id)
    }
  }
})

test("every seat's art has a measured tap outline that covers all of its drawn pixels", () => {
  // A seat takes taps only on its drawn piece (roomFurnitureTapTargetModel);
  // new or changed seat art without a fresh outline would leave part of the
  // seat untappable, or fall back to its whole, mostly empty canvas.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const { resolveRoomV2Scene } = require("./roomV2Selectors") as typeof import("./roomV2Selectors")
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const tapModel = require("./components/roomFurnitureTapTargetModel") as
    typeof import("./components/roomFurnitureTapTargetModel")
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- pngjs has no type declarations here.
  const { PNG } = require("pngjs") as {
    PNG: { sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } } }
  }
  const seats = ROOM_V2_FURNITURE_CATALOG.filter((item) => item.interactionType === "seat")
  assert.ok(seats.length > 0)
  const checked = new Set<string>()
  for (const seat of seats) {
    for (const rotation of ["front", "right", "back", "left"] as const) {
      const scene = resolveRoomV2Scene({ roomShellCatalog: ROOM_V2_SHELL_CATALOG, furnitureCatalog: ROOM_V2_FURNITURE_CATALOG,
        decor: { roomShellId: DEFAULT_ROOM_V2_SHELL_ID, placedItems: [
          { instanceId: "seat-under-test", itemId: seat.id, x: 0.5, y: 0.7, rotation }] },
        defaultRoomShellId: DEFAULT_ROOM_V2_SHELL_ID })
      const item = scene.renderItems.find((entry) => entry.kind === "furniture")
      assert.ok(item && item.kind === "furniture", `${seat.id} ${rotation}`)
      if (checked.has(item.asset.key)) continue
      checked.add(item.asset.key)
      const outline = tapModel.ROOM_FURNITURE_DRAWN_OUTLINES[item.asset.key]
      assert.ok(outline, `${seat.id} ${rotation}: no tap outline for ${item.asset.key}`)
      const image = PNG.sync.read(readFileSync(String(item.asset.source)))
      assert.ok(Math.abs(outline.aspect - image.width / image.height) < 0.001, `${item.asset.key}: aspect`)
      let uncovered = 0
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          if (image.data[(y * image.width + x) * 4 + 3]! < 32) continue
          if (!tapModel.isPointInOutline(outline.points, (x + 0.5) / image.width, (y + 0.5) / image.height)) uncovered++
        }
      }
      assert.equal(uncovered, 0, `${item.asset.key}: drawn pixels outside its tap outline`)
    }
  }
})

test("every published room_v2 item and the starter bed keep resolving to one canonical catalog entry", () => {
  // Canonical IDs survive art and runtime changes: an item sold through the
  // R1 release catalog must stay resolvable in the live room catalog.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
  const { STARTER_ROOM_BED_ITEM_ID } = require("./roomStarterModel") as typeof import("./roomStarterModel")
  const releaseCatalog = JSON.parse(readFileSync(
    path.resolve(process.cwd(), "../../packages/domain/src/release/blumiR1ReleaseCatalog.json"),
    "utf8"
  )) as unknown
  const publishedRoomIds = new Set<string>()
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect)
    } else if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        if (key === "itemId" && typeof entry === "string" && entry.startsWith("room_v2_")) {
          publishedRoomIds.add(entry)
        } else {
          collect(entry)
        }
      }
    }
  }
  collect(releaseCatalog)
  const catalogIds = new Set(ROOM_V2_FURNITURE_CATALOG.map((item) => item.id))
  assert.equal(catalogIds.size, ROOM_V2_FURNITURE_CATALOG.length, "catalog IDs are unique")
  for (const itemId of publishedRoomIds) {
    assert.ok(catalogIds.has(itemId), `${itemId} must resolve in the live room catalog`)
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS fixture loading as above
  const { isLegacyItemId, LEGACY_ROOM_ITEM_IDS } = require("@blumi/domain") as typeof import("@blumi/domain")
  // the chair keeps its canonical id through the art change (now its layered drawing); retired ids never resolve
  assert.ok(catalogIds.has("room_v2_chair_blush"), "the blush chair keeps resolving under its own id")
  for (const itemId of LEGACY_ROOM_ITEM_IDS) assert.equal(catalogIds.has(itemId), false, `${itemId} is retired`)
  // the starter bed is the domain's reserved free bed: never a retired id; it resolves once its art lands (4.7)
  assert.equal(isLegacyItemId(STARTER_ROOM_BED_ITEM_ID), false)
})


test("the editor tray never offers a held piece, even to an owner", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS fixture loading as above
  const { filterRoomEditorTrayCatalog } = require("./editor/roomEditorTrayCatalog") as typeof import("./editor/roomEditorTrayCatalog")
  const offered = filterRoomEditorTrayCatalog([
    { id: "room_v2_chair_blush" },
    { id: "room_v3_sofa_japon_cream" },
    { id: "room_v3_armchair_japon_cream" },
    { id: "qa_room_probe" },
    { id: "standin_room_piece" }
  ]).map((item) => item.id)
  assert.deepEqual(offered, ["standin_room_piece"])
})

test("the held-piece tray override is the local QA guard's decision and changes nothing else", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS fixture loading as above
  const { resolveRoomEditorTrayCatalog, ROOM_EDITOR_TRAY_CATALOG } = require("./editor/roomEditorTrayCatalog") as typeof import("./editor/roomEditorTrayCatalog")
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS fixture loading as above
  const { isReleaseCatalogItemHeld } = require("@blumi/domain") as typeof import("@blumi/domain")
  const catalog = [{ id: "room_v3_sofa_japon_cream" }, { id: "standin_room_piece" }]
  assert.deepEqual(
    resolveRoomEditorTrayCatalog(catalog, { showHeldPieces: false }).map((item) => item.id),
    ["standin_room_piece"]
  )
  assert.deepEqual(
    resolveRoomEditorTrayCatalog(catalog, { showHeldPieces: true }).map((item) => item.id),
    ["room_v3_sofa_japon_cream", "standin_room_piece"]
  )
  // Node tests, like release bundles, run without a dev build: the shipped tray stays filtered.
  assert.equal(ROOM_EDITOR_TRAY_CATALOG.some((item) => isReleaseCatalogItemHeld(item.id)), false)
})
