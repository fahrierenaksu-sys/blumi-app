import assert from "node:assert/strict"
import test from "node:test"
import {
  PINK_CLOUD_BEDROOM_RECIPES,
  PINK_CLOUD_BEDROOM_RECIPE_IDS,
  ROOM_STUDIO_COMPATIBLE_ALTERNATIVES,
  ROOM_STUDIO_MODULE_ITEM_IDS,
  applyRoomStudioThemeOptions,
  getPinkCloudBedroomRecipeForTheme,
  getRoomStudioZoneForInstance,
  getPinkCloudBedroomRecipe
} from "./roomStudioRecipes"
import { ROOM_STUDIO_THEME_IDS, getRoomStudioThemeOptions } from "./roomStudioThemeMatrix"
import { validateRoomStudioRecipe } from "./roomStudioSession"

test("pilot exposes four curated themes on the canonical shell", () => {
  assert.ok(PINK_CLOUD_BEDROOM_RECIPE_IDS.length > 0)
  assert.equal(new Set(PINK_CLOUD_BEDROOM_RECIPE_IDS).size, PINK_CLOUD_BEDROOM_RECIPE_IDS.length)
  for (const recipeId of PINK_CLOUD_BEDROOM_RECIPE_IDS) {
    assert.equal(getPinkCloudBedroomRecipe(recipeId).id, recipeId)
  }

  for (const recipe of PINK_CLOUD_BEDROOM_RECIPES) {
    assert.doesNotThrow(() => validateRoomStudioRecipe(recipe))
    assert.equal(recipe.shellId, "room_v2_shell_blumi_world_v1")
    assert.equal(recipe.modules.length, 4)
    assert.deepEqual(
      recipe.modules.map((module) => module.moduleItemId),
      getRoomStudioThemeOptions(recipe.themeId ?? "rose").map(({ id }) => id)
    )
    assert.deepEqual(
      recipe.modules.map((module) => module.placementSurface),
      ["floor", "floor", "wall", "floor"]
    )
  }
})

test("recipe lookup and compatibility data return immutable copies and fail closed", () => {
  const first = getPinkCloudBedroomRecipe("pink-cloud-bedroom-balanced-v1")
  const originalX = first.modules[0]!.x
  first.modules[0]!.x = originalX + 0.1
  const second = getPinkCloudBedroomRecipe("pink-cloud-bedroom-balanced-v1")

  assert.equal(second.modules[0]!.x, originalX)

  // Every alternative is a known module of the same room zone.
  const zoneByModuleId = new Map(
    ROOM_STUDIO_THEME_IDS.flatMap((themeId) =>
      getRoomStudioThemeOptions(themeId).map((option) => [option.id, option.zone] as const)
    )
  )
  const softAccents = ROOM_STUDIO_MODULE_ITEM_IDS.softAccents
  assert.ok(ROOM_STUDIO_COMPATIBLE_ALTERNATIVES[softAccents].length > 0)
  for (const [moduleId, alternatives] of Object.entries(ROOM_STUDIO_COMPATIBLE_ALTERNATIVES)) {
    const zone = zoneByModuleId.get(moduleId)
    assert.ok(zone, `${moduleId} is a known module`)
    for (const alternative of alternatives) {
      assert.equal(zoneByModuleId.get(alternative), zone, `${alternative} belongs to ${zone}`)
    }
  }
  assert.throws(
    () => getPinkCloudBedroomRecipe("unknown" as never),
    /room_studio_recipe_unknown/
  )
})

test("theme selection changes one zone while preserving curated placement", () => {
  const recipe = getPinkCloudBedroomRecipeForTheme("rose")
  const skySleep = getRoomStudioThemeOptions("sky").find((option) => option.zone === "sleep")!
  const next = applyRoomStudioThemeOptions(recipe, { sleep: skySleep.id })

  assert.equal(next.modules.find((module) => module.instanceId === "studio-sleep")?.moduleItemId, skySleep.id)
  assert.equal(next.modules.find((module) => module.instanceId === "studio-cozy")?.moduleItemId, ROOM_STUDIO_MODULE_ITEM_IDS.cozyCorner)
  assert.deepEqual(next.modules.map(({ x, y }) => [x, y]), recipe.modules.map(({ x, y }) => [x, y]))
  assert.equal(getRoomStudioZoneForInstance("studio-wall"), "wallStory")
  assert.throws(
    () => applyRoomStudioThemeOptions(recipe, { sleep: getRoomStudioThemeOptions("sky").find((option) => option.zone === "wallStory")!.id }),
    /room_studio_theme_option_incompatible/
  )
})
