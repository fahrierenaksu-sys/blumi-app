import assert from "node:assert/strict"
import test from "node:test"
import { getMyRoomEditorCopy } from "../myRoomCopy"
import {
  filterRoomEditorInventoryEntries,
  getEditRoomWorldStatus,
  getRoomEditorInventoryStatusLabel,
  getRoomEditorPlacementStateByRenderId,
  getRoomEditorSubtitle,
  getSelectedPlacedRotationOptions,
  resolveSelectedRoomEditorInventoryEntry,
  type RoomEditorInventoryEntry
} from "./roomEditorPresentationModel"
import { createTestFurniture, createTestPlaced, createTestRenderItem } from "./roomEditorTestFixtures"

const en = getMyRoomEditorCopy("en")
const tr = getMyRoomEditorCopy("tr")

function entry(id: string, name: string, category: RoomEditorInventoryEntry["item"]["category"], owned = true): RoomEditorInventoryEntry {
  return { item: createTestFurniture({ id, name, category }), owned }
}

const entries = [
  entry("chair", "Cloud Chair", "seating"),
  entry("desk", "Soft-Neutral Desk", "table"),
  entry("lamp", "Moon Lamp", "lighting", false),
  entry("sofa", "Cloud Sofa", "seating")
]

test("room world status maps readiness to icon, localized label, and colour", () => {
  assert.deepEqual(getEditRoomWorldStatus("ready", en), { icon: "walk", label: en.readiness.ready, color: "#8FFFD1" })
  assert.deepEqual(getEditRoomWorldStatus("constrained", tr), { icon: "resize", label: tr.readiness.constrained, color: "#FFE1A8" })
  assert.deepEqual(getEditRoomWorldStatus("blocked", en), { icon: "alert-circle", label: en.readiness.blocked, color: "#FFB4C8" })
})

test("header subtitle prefers live feedback, then the selection's rotation affordance", () => {
  const base = { copy: en, placementFeedback: undefined, selectedInstanceId: undefined, canRotateSelectedPlacedItem: true }
  assert.equal(getRoomEditorSubtitle(base), en.defaultSubtitle)
  assert.equal(getRoomEditorSubtitle({ ...base, selectedInstanceId: "chair_1" }), en.rotatableSubtitle)
  assert.equal(
    getRoomEditorSubtitle({ ...base, selectedInstanceId: "chair_1", canRotateSelectedPlacedItem: false }),
    en.fixedSubtitle
  )
  assert.equal(getRoomEditorSubtitle({ ...base, selectedInstanceId: "chair_1", placementFeedback: "Hi" }), "Hi")
  // An empty feedback string is still shown (nullish, not falsy, fallback).
  assert.equal(getRoomEditorSubtitle({ ...base, placementFeedback: "" }), "")
})

test("collection status label is localized for loading and failed states", () => {
  const loading = { isLoading: true, isFailed: false }
  const failed = { isLoading: false, isFailed: true }
  const ready = { isLoading: false, isFailed: false }
  assert.equal(
    getRoomEditorInventoryStatusLabel({ locale: "en", copy: en, inventoryViewState: loading, inventoryEntryCount: 3 }),
    "Loading your collection…"
  )
  assert.equal(
    getRoomEditorInventoryStatusLabel({ locale: "tr", copy: tr, inventoryViewState: loading, inventoryEntryCount: 3 }),
    "Eşya koleksiyonun yükleniyor…"
  )
  assert.equal(
    getRoomEditorInventoryStatusLabel({ locale: "en", copy: en, inventoryViewState: failed, inventoryEntryCount: 3 }),
    "Your collection could not be verified."
  )
  assert.equal(
    getRoomEditorInventoryStatusLabel({ locale: "tr", copy: tr, inventoryViewState: failed, inventoryEntryCount: 3 }),
    "Eşya koleksiyonun doğrulanamadı."
  )
  assert.equal(
    getRoomEditorInventoryStatusLabel({ locale: "en", copy: en, inventoryViewState: ready, inventoryEntryCount: 3 }),
    "3 pieces ready to place"
  )
  assert.equal(
    getRoomEditorInventoryStatusLabel({ locale: "tr", copy: tr, inventoryViewState: ready, inventoryEntryCount: 2 }),
    "Yerleştirmeye hazır 2 eşya"
  )
})

test("tray filtering combines category and punctuation-safe name search", () => {
  const ids = (list: readonly RoomEditorInventoryEntry[]) => list.map((item) => item.item.id)
  assert.deepEqual(ids(filterRoomEditorInventoryEntries(entries, "all", "")), ["chair", "desk", "lamp", "sofa"])
  assert.deepEqual(ids(filterRoomEditorInventoryEntries(entries, "seating", "")), ["chair", "sofa"])
  assert.deepEqual(ids(filterRoomEditorInventoryEntries(entries, "all", "  CLOUD ")), ["chair", "sofa"])
  assert.deepEqual(ids(filterRoomEditorInventoryEntries(entries, "all", "soft neutral")), ["desk"])
  assert.deepEqual(ids(filterRoomEditorInventoryEntries(entries, "table", "cloud")), [])
  assert.deepEqual(ids(filterRoomEditorInventoryEntries(entries, "all", "---")), ["chair", "desk", "lamp", "sofa"])
})

test("inspector selection falls back to the first owned unplaced piece, then the first piece", () => {
  assert.equal(resolveSelectedRoomEditorInventoryEntry(entries, "lamp", new Set())?.item.id, "lamp")
  assert.equal(resolveSelectedRoomEditorInventoryEntry(entries, undefined, new Set(["chair"]))?.item.id, "desk")
  assert.equal(resolveSelectedRoomEditorInventoryEntry(entries, "gone", new Set(["chair", "desk", "sofa"]))?.item.id, "chair")
  assert.equal(resolveSelectedRoomEditorInventoryEntry([], "chair", new Set()), undefined)
})

test("placed rotation options come from the selected placed item's catalog entry", () => {
  const asset = { key: "k", source: 1 as never }
  const catalog = [
    createTestFurniture({ assetsByRotation: { front: asset, left: asset } }),
    createTestFurniture({ id: "desk" })
  ]
  const placed = [createTestPlaced(), createTestPlaced({ instanceId: "desk_1", itemId: "desk" })]
  assert.deepEqual(getSelectedPlacedRotationOptions(placed, "chair_1", catalog), ["front", "left"])
  assert.deepEqual(getSelectedPlacedRotationOptions(placed, "desk_1", catalog), [])
  assert.deepEqual(getSelectedPlacedRotationOptions(placed, undefined, catalog), [])
  assert.deepEqual(getSelectedPlacedRotationOptions(placed, "missing", catalog), [])
})

test("renderer placement state marks the preview and, only when invalid, its blockers", () => {
  assert.equal(getRoomEditorPlacementStateByRenderId(undefined), undefined)
  const item = createTestRenderItem({ renderId: "chair_2" })
  assert.deepEqual(
    getRoomEditorPlacementStateByRenderId({ item, isValid: true, blockingRenderIds: ["desk"] }),
    { chair_2: "valid" }
  )
  assert.deepEqual(
    getRoomEditorPlacementStateByRenderId({ item, isValid: false, blockingRenderIds: ["desk", "sofa"] }),
    { chair_2: "invalid", desk: "invalid", sofa: "invalid" }
  )
  assert.deepEqual(getRoomEditorPlacementStateByRenderId({ item, isValid: false }), { chair_2: "invalid" })
})
