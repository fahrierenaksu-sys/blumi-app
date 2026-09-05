import assert from "node:assert/strict"
import test from "node:test"
import {
  ROOM_STUDIO_MODULE_ITEM_IDS,
  resolveRoomStudioQaCatalog
} from "./roomStudioQaCatalog"
import { ROOM_STUDIO_ASSET_IDS } from "./roomStudioAssetManifest"
import type { RoomStudioRuntimeGateResult } from "./roomStudioRuntimeGate"

const TEST_ASSET_BINDINGS = Object.fromEntries(
  ROOM_STUDIO_ASSET_IDS.map((id, index) => [id, 101 + index])
)

const DISABLED_GATE: RoomStudioRuntimeGateResult = {
  enabled: false,
  mode: "disabled",
  canPreview: false,
  canRotate: false,
  reason: "disabled"
}

const PREVIEW_GATE: RoomStudioRuntimeGateResult = {
  enabled: true,
  mode: "preview-only",
  canPreview: true,
  canRotate: false,
  reason: "directional-assets-blocked"
}

test("Home Studio QA catalog stays closed when the runtime gate is disabled or visually blocked", () => {
  assert.deepEqual(resolveRoomStudioQaCatalog(DISABLED_GATE, TEST_ASSET_BINDINGS), {
    enabled: false,
    catalog: [],
    ownedItemIds: []
  })
  assert.deepEqual(resolveRoomStudioQaCatalog({
    enabled: true,
    mode: "blocked",
    canPreview: false,
    canRotate: false,
    reason: "visual-review-blocked"
  }, TEST_ASSET_BINDINGS), {
    enabled: false,
    catalog: [],
    ownedItemIds: []
  })
})

test("preview-only QA catalog exposes the complete 4x4 scene matrix", () => {
  const result = resolveRoomStudioQaCatalog(PREVIEW_GATE, TEST_ASSET_BINDINGS)

  assert.equal(result.enabled, true)
  assert.deepEqual(result.ownedItemIds, ROOM_STUDIO_ASSET_IDS)
  assert.deepEqual(result.catalog.map((item) => item.id), result.ownedItemIds)
  assert.equal(result.catalog.every((item) => item.sourceStatus === "candidate"), true)
  assert.equal(result.catalog.every((item) => item.qaStatus === "blocked"), true)
  assert.equal(result.catalog.every((item) => item.locked === true), true)
})

test("preview-only QA catalog never fakes directional rotation before four-way art is approved", () => {
  const result = resolveRoomStudioQaCatalog(PREVIEW_GATE, TEST_ASSET_BINDINGS)

  for (const item of result.catalog) {
    assert.equal(item.rotationPolicy, undefined)
    assert.equal(item.assetsByRotation, undefined)
    assert.equal(item.thumbnail?.key, item.asset.key)
  }
})

test("guided remix gate upgrades the same isolated catalog without mutating previous results", () => {
  const preview = resolveRoomStudioQaCatalog(PREVIEW_GATE, TEST_ASSET_BINDINGS)
  const remix = resolveRoomStudioQaCatalog({
    enabled: true,
    mode: "guided-remix",
    canPreview: true,
    canRotate: true,
    reason: "guided-remix"
  }, TEST_ASSET_BINDINGS)

  preview.catalog[0]!.name = "mutated"
  assert.notEqual(remix.catalog[0]!.name, "mutated")
  assert.deepEqual(
    remix.catalog.map((item) => item.id),
    preview.ownedItemIds
  )
})

test("every candidate is SHA-bound and front-only while rotation art is blocked", () => {
  const result = resolveRoomStudioQaCatalog(PREVIEW_GATE, TEST_ASSET_BINDINGS)
  assert.equal(new Set(
    result.catalog.map((item) => item.qaAssetEvidence.sha256)
  ).size, 16)
  for (const item of result.catalog) {
    assert.match(item.qaAssetEvidence.path, /^art\/room-vnext\/home-studio-pilot-v1\//)
    assert.match(item.qaAssetEvidence.sha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(item.availableDirections, ["front"])
    assert.equal(item.fourDirectionApproved, false)
  }
})

test("candidate placement metadata is physical and independent from the bitmap canvas", () => {
  const result = resolveRoomStudioQaCatalog(PREVIEW_GATE, TEST_ASSET_BINDINGS)
  const sleep = result.catalog.find((item) => item.id === ROOM_STUDIO_MODULE_ITEM_IDS.sleep)!
  const wall = result.catalog.find((item) => item.id === ROOM_STUDIO_MODULE_ITEM_IDS.wallStory)!

  assert.ok(sleep.placementGeometry.footprint.width < sleep.width)
  assert.equal(sleep.placementGeometry.anchor.y, 1)
  assert.equal(wall.placementGeometry.anchor.y, 0.5)
  assert.ok(wall.placementGeometry.footprint.width < wall.width)
})

test("QA catalog fails closed when a real asset binding is missing", () => {
  const incompleteBindings = { ...TEST_ASSET_BINDINGS }
  delete (incompleteBindings as Partial<typeof TEST_ASSET_BINDINGS>)[
    ROOM_STUDIO_MODULE_ITEM_IDS.sleep
  ]
  assert.deepEqual(
    resolveRoomStudioQaCatalog(PREVIEW_GATE, incompleteBindings),
    { enabled: false, catalog: [], ownedItemIds: [] }
  )
})
