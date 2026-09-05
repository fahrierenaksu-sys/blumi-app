import assert from "node:assert/strict"
import test from "node:test"
import type { UserRoomDecor } from "../roomV2/roomV2.types"
import { readStoredRoomV2Decor } from "../roomV2/roomV2Persistence"
import {
  applyRoomStudioRecipe,
  backToMyRoom,
  createRoomStudioPreview,
  createRoomStudioSession,
  hydrateRoomStudioSession,
  restoreRoomStudioLayout,
  replaceRoomStudioModule,
  updateRoomStudioModule,
  type RoomStudioRecipeV1
} from "./roomStudioSession"

const ORIGINAL: UserRoomDecor = {
  schemaVersion: 3,
  geometryVersion: "blumi_room_v3_2026",
  roomShellId: "room_v2_shell_blumi_world_v1",
  placedItems: [{
    instanceId: "saved-bed",
    itemId: "room_v2_cozy_bed",
    x: 0.44,
    y: 0.72,
    rotation: "front"
  }]
}

const BALANCED: RoomStudioRecipeV1 = {
  id: "pink-cloud-bedroom-balanced-v1",
  shellId: "room_v2_shell_blumi_world_v1",
  presentationPresetId: "home-studio-balanced-v1",
  modules: [{
    instanceId: "studio-sleep",
    moduleItemId: "room_studio_sleep_module_v1",
    x: 0.39,
    y: 0.67,
    rotation: "front",
    placementSurface: "floor",
    required: true
  }, {
    instanceId: "studio-cozy",
    moduleItemId: "room_studio_cozy_corner_v1",
    x: 0.74,
    y: 0.74,
    rotation: "right",
    placementSurface: "floor",
    required: true
  }, {
    instanceId: "studio-wall",
    moduleItemId: "room_studio_wall_story_v1",
    x: 0.69,
    y: 0.44,
    rotation: "front",
    placementSurface: "wall",
    required: true
  }, {
    instanceId: "studio-accents",
    moduleItemId: "room_studio_soft_accents_v1",
    x: 0.59,
    y: 0.76,
    rotation: "left",
    placementSurface: "floor",
    required: false
  }]
}

test("preview compiles a recipe without mutating the saved room", () => {
  const preview = createRoomStudioPreview(ORIGINAL, BALANCED)

  assert.deepEqual(preview.placedItems.map((item) => item.itemId), [
    "room_studio_sleep_module_v1",
    "room_studio_cozy_corner_v1",
    "room_studio_wall_story_v1",
    "room_studio_soft_accents_v1"
  ])
  assert.equal(preview.schemaVersion, ORIGINAL.schemaVersion)
  assert.equal(preview.geometryVersion, ORIGINAL.geometryVersion)
  assert.deepEqual(ORIGINAL.placedItems.map((item) => item.itemId), [
    "room_v2_cozy_bed"
  ])
  assert.notEqual(preview.placedItems, ORIGINAL.placedItems)
})

test("a new Studio session keeps immutable original, recipe baseline, and draft copies", () => {
  const session = createRoomStudioSession(ORIGINAL, BALANCED)
  session.draftDecor.placedItems[0]!.x = 0.8

  assert.equal(session.activeRecipeId, BALANCED.id)
  assert.equal(session.originalDecor.placedItems[0]!.x, 0.44)
  assert.equal(session.recipeBaseline.placedItems[0]!.x, 0.39)
  assert.notEqual(session.recipeBaseline, session.draftDecor)
  assert.notEqual(session.recipeBaseline.placedItems, session.draftDecor.placedItems)
})

test("guided remix moves and rotates exactly one module without changing baselines", () => {
  const session = createRoomStudioSession(ORIGINAL, BALANCED)
  const moved = updateRoomStudioModule(session, "studio-cozy", {
    x: 0.68,
    y: 0.71,
    rotation: "back"
  })

  assert.deepEqual(
    moved.draftDecor.placedItems.find((item) => item.instanceId === "studio-cozy"),
    {
      instanceId: "studio-cozy",
      itemId: "room_studio_cozy_corner_v1",
      x: 0.68,
      y: 0.71,
      rotation: "back",
      placementSurface: "floor",
      geometryVersion: "home-studio-scene-modules-v1"
    }
  )
  assert.equal(session.draftDecor.placedItems[1]!.rotation, "right")
  assert.equal(moved.recipeBaseline.placedItems[1]!.rotation, "right")
})

test("restore layout returns a fresh copy of the active recipe baseline", () => {
  const moved = updateRoomStudioModule(
    createRoomStudioSession(ORIGINAL, BALANCED),
    "studio-sleep",
    { x: 0.55 }
  )
  const restored = restoreRoomStudioLayout(moved)

  assert.deepEqual(restored.draftDecor, restored.recipeBaseline)
  assert.notEqual(restored.draftDecor, restored.recipeBaseline)
  assert.equal(restored.draftDecor.placedItems[0]!.x, 0.39)
})

test("Back to my room restores the entry snapshot without losing it", () => {
  const session = createRoomStudioSession(ORIGINAL, BALANCED)
  const restored = backToMyRoom(session)

  assert.deepEqual(restored.draftDecor, ORIGINAL)
  assert.deepEqual(restored.originalDecor, ORIGINAL)
  assert.notEqual(restored.draftDecor, restored.originalDecor)
})

test("switching ready-room recipes preserves the original entry room", () => {
  const airy: RoomStudioRecipeV1 = {
    ...BALANCED,
    id: "pink-cloud-bedroom-airy-v1",
    presentationPresetId: "home-studio-airy-v1",
    modules: BALANCED.modules.map((module, index) => ({
      ...module,
      x: module.x - index * 0.01,
      y: module.y - 0.03
    }))
  }
  const initial = createRoomStudioSession(ORIGINAL, BALANCED)
  const switched = applyRoomStudioRecipe(initial, airy)

  assert.equal(switched.activeRecipeId, airy.id)
  assert.equal(switched.draftDecor.placedItems[0]!.y, 0.64)
  assert.deepEqual(switched.originalDecor, initial.originalDecor)
})

test("recipe input fails closed for unknown shells, duplicate SKUs, and invalid coordinates", () => {
  assert.throws(
    () => createRoomStudioPreview(ORIGINAL, {
      ...BALANCED,
      shellId: "expanded-shell" as never
    }),
    /room_studio_shell_not_canonical/
  )
  assert.throws(
    () => createRoomStudioPreview(ORIGINAL, {
      ...BALANCED,
      modules: BALANCED.modules.map((module, index) => ({
        ...module,
        moduleItemId: index < 2 ? "duplicate-module" : module.moduleItemId
      }))
    }),
    /room_studio_module_item_duplicate/
  )
  assert.throws(
    () => createRoomStudioPreview(ORIGINAL, {
      ...BALANCED,
      modules: BALANCED.modules.map((module, index) => ({
        ...module,
        x: index === 0 ? Number.NaN : module.x
      }))
    }),
    /room_studio_module_position_invalid/
  )
})

test("guided remix rejects unknown modules and invalid patches", () => {
  const session = createRoomStudioSession(ORIGINAL, BALANCED)

  assert.throws(
    () => updateRoomStudioModule(session, "missing", { x: 0.5 }),
    /room_studio_module_missing/
  )
  assert.throws(
    () => updateRoomStudioModule(session, "studio-cozy", { y: 1.2 }),
    /room_studio_module_position_invalid/
  )
})

test("guided remix replaces a module only with an explicitly compatible alternative", () => {
  const session = createRoomStudioSession(ORIGINAL, BALANCED)
  const compatibleAlternatives = {
    room_studio_soft_accents_v1: [
      "room_studio_soft_accents_warm_variant_v1"
    ]
  } as const

  const replaced = replaceRoomStudioModule(
    session,
    "studio-accents",
    "room_studio_soft_accents_warm_variant_v1",
    compatibleAlternatives
  )

  assert.equal(
    replaced.draftDecor.placedItems.find(
      (item) => item.instanceId === "studio-accents"
    )?.itemId,
    "room_studio_soft_accents_warm_variant_v1"
  )
  assert.equal(
    session.draftDecor.placedItems.find(
      (item) => item.instanceId === "studio-accents"
    )?.itemId,
    "room_studio_soft_accents_v1"
  )
  assert.throws(
    () => replaceRoomStudioModule(
      session,
      "studio-sleep",
      "room_studio_soft_accents_warm_variant_v1",
      compatibleAlternatives
    ),
    /room_studio_module_replacement_incompatible/
  )
})

test("save and reopen preserve exact module coordinates, directions, surfaces, and geometry", () => {
  const draft = updateRoomStudioModule(
    createRoomStudioSession(ORIGINAL, BALANCED),
    "studio-cozy",
    { x: 0.68, y: 0.71, rotation: "back" }
  ).draftDecor
  const reopened = readStoredRoomV2Decor(JSON.stringify(draft))

  assert.equal(reopened.status, "ready")
  if (reopened.status !== "ready") return
  assert.deepEqual(reopened.decor, draft)
  assert.deepEqual(
    reopened.decor.placedItems.map((item) => item.placementSurface),
    ["floor", "floor", "wall", "floor"]
  )
  assert.ok(reopened.decor.placedItems.every(
    (item) => item.geometryVersion === "home-studio-scene-modules-v1"
  ))
})

test("reopen hydrates the saved draft instead of recompiling a ready-room recipe", () => {
  const draft = updateRoomStudioModule(
    createRoomStudioSession(ORIGINAL, BALANCED),
    "studio-sleep",
    { x: 0.22, y: 0.58, rotation: "left" }
  ).draftDecor

  const reopened = hydrateRoomStudioSession(draft, BALANCED.id)

  assert.equal(reopened.activeRecipeId, BALANCED.id)
  assert.deepEqual(reopened.draftDecor, draft)
  assert.deepEqual(reopened.recipeBaseline, draft)
  assert.deepEqual(reopened.originalDecor, draft)
  assert.notEqual(reopened.draftDecor, draft)
})
