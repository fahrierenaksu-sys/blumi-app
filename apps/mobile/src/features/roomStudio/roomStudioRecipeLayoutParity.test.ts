import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  getPinkCloudBedroomRecipe,
  type PinkCloudBedroomRecipeId
} from "./roomStudioRecipes"
import { getRoomStudioThemeOptions } from "./roomStudioThemeMatrix"

interface LayoutModuleJson {
  id: string
  anchor: { normalized: { x: number, y: number } }
}

interface LayoutJson {
  schemaVersion: number
  modules: LayoutModuleJson[]
}

const RECIPE_LAYOUT_FILES: Record<PinkCloudBedroomRecipeId, string> = {
  "pink-cloud-bedroom-balanced-v1": "balanced-v0.4.json",
  "pink-cloud-bedroom-airy-v1": "airy-v0.4.json",
  "pink-cloud-bedroom-extra-cozy-v1": "extra-cozy-v0.4.json",
  "pink-cloud-bedroom-honey-v1": "balanced-v0.4.json"
}

const LAYOUT_TO_ZONE = {
  "sleep-module": "sleep",
  "cozy-corner-module": "cozyCorner",
  "wall-story-module": "wallStory",
  "soft-accents-module": "softAccents"
} as const

test("room studio recipes stay parity-locked to the approved v0.4 layout JSON anchors", () => {
  for (const [recipeId, fileName] of Object.entries(RECIPE_LAYOUT_FILES) as [PinkCloudBedroomRecipeId, string][]) {
    const layout = readLayoutJson(fileName)
    assert.equal(layout.schemaVersion, 1)

    const recipe = getPinkCloudBedroomRecipe(recipeId)
    const actual = recipe.modules.map(({ moduleItemId, x, y }) => ({
      moduleItemId,
      x,
      y
    })).sort(byModuleItemId)
    const expected = layout.modules.map((module) => ({
      moduleItemId: getRoomStudioThemeOptions(recipe.themeId ?? "rose")
        .find((option) => option.zone === LAYOUT_TO_ZONE[module.id as keyof typeof LAYOUT_TO_ZONE])!.id,
      x: module.anchor.normalized.x,
      y: module.anchor.normalized.y
    })).sort(byModuleItemId)

    assert.deepEqual(actual, expected)
  }
})

function readLayoutJson(fileName: string): LayoutJson {
  const filePath = path.resolve(
    __dirname,
    "../../../../../art/room-vnext/home-studio-pilot-v1/layouts",
    fileName
  )
  return JSON.parse(readFileSync(filePath, "utf8")) as LayoutJson
}

function byModuleItemId(
  left: { moduleItemId: string },
  right: { moduleItemId: string }
): number {
  return left.moduleItemId.localeCompare(right.moduleItemId)
}
