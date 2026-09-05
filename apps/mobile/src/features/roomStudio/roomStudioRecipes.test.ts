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
import { getRoomStudioThemeOptions } from "./roomStudioThemeMatrix"
import { validateRoomStudioRecipe } from "./roomStudioSession"

test("pilot exposes four curated themes on the canonical shell", () => {
  assert.deepEqual(PINK_CLOUD_BEDROOM_RECIPE_IDS, [
    "pink-cloud-bedroom-balanced-v1",
    "pink-cloud-bedroom-airy-v1",
    "pink-cloud-bedroom-extra-cozy-v1",
    "pink-cloud-bedroom-honey-v1"
  ])
  assert.equal(PINK_CLOUD_BEDROOM_RECIPES.length, 4)

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

test("recipe coordinates match the approved v0.4 layout anchors", () => {
  const balanced = getPinkCloudBedroomRecipe("pink-cloud-bedroom-balanced-v1")
  const airy = getPinkCloudBedroomRecipe("pink-cloud-bedroom-airy-v1")
  const extraCozy = getPinkCloudBedroomRecipe("pink-cloud-bedroom-extra-cozy-v1")
  const honey = getPinkCloudBedroomRecipe("pink-cloud-bedroom-honey-v1")

  assert.deepEqual(balanced.modules.map(({ x, y }) => [x, y]), [
    [0.39, 0.67], [0.74, 0.74], [0.69, 0.44], [0.59, 0.76]
  ])
  assert.deepEqual(airy.modules.map(({ x, y }) => [x, y]), [
    [0.35, 0.62], [0.77, 0.68], [0.67, 0.38], [0.54, 0.70]
  ])
  assert.deepEqual(extraCozy.modules.map(({ x, y }) => [x, y]), [
    [0.41, 0.69], [0.71, 0.72], [0.69, 0.47], [0.61, 0.76]
  ])
  assert.deepEqual(honey.modules.map(({ x, y }) => [x, y]), [
    [0.39, 0.67], [0.74, 0.74], [0.69, 0.44], [0.59, 0.76]
  ])
})

test("recipe lookup and compatibility data return immutable copies and fail closed", () => {
  const first = getPinkCloudBedroomRecipe("pink-cloud-bedroom-balanced-v1")
  first.modules[0]!.x = 0.99
  const second = getPinkCloudBedroomRecipe("pink-cloud-bedroom-balanced-v1")

  assert.equal(second.modules[0]!.x, 0.39)
  assert.deepEqual(
    ROOM_STUDIO_COMPATIBLE_ALTERNATIVES[ROOM_STUDIO_MODULE_ITEM_IDS.softAccents],
    [
      "room_studio_soft_accents_sky_v1",
      "room_studio_soft_accents_honey_v1",
      "room_studio_soft_accents_lilac_v1"
    ]
  )
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
