import {
  ROOM_STUDIO_CANONICAL_SHELL_ID,
  type RoomStudioCompatibleAlternatives,
  type RoomStudioModulePlacement,
  type RoomStudioRecipeV1
} from "./roomStudioSession"
import type { RoomPlacementSurface } from "../roomV2/roomV2.types"
import {
  getRoomStudioThemeOptions,
  getRoomStudioZoneOptions,
  ROOM_STUDIO_THEME_IDS,
  ROOM_STUDIO_ZONE_IDS,
  type RoomStudioZoneId,
  type RoomStudioThemeId
} from "./roomStudioThemeMatrix"

export const ROOM_STUDIO_MODULE_ITEM_IDS = {
  sleep: "room_studio_sleep_module_v1",
  cozyCorner: "room_studio_cozy_corner_v1",
  wallStory: "room_studio_wall_story_v1",
  softAccents: "room_studio_soft_accents_v1"
} as const

export const PINK_CLOUD_BEDROOM_RECIPE_IDS = [
  "pink-cloud-bedroom-balanced-v1",
  "pink-cloud-bedroom-airy-v1",
  "pink-cloud-bedroom-extra-cozy-v1",
  "pink-cloud-bedroom-honey-v1"
] as const

export type PinkCloudBedroomRecipeId =
  (typeof PINK_CLOUD_BEDROOM_RECIPE_IDS)[number]

const RECIPE_THEME_IDS: Readonly<Record<PinkCloudBedroomRecipeId, RoomStudioThemeId>> = {
  "pink-cloud-bedroom-balanced-v1": "rose",
  "pink-cloud-bedroom-airy-v1": "sky",
  "pink-cloud-bedroom-extra-cozy-v1": "lilac",
  "pink-cloud-bedroom-honey-v1": "honey"
}

const compatibleAlternatives = Object.fromEntries(
  ROOM_STUDIO_ZONE_IDS.flatMap((zone) => {
    const options = getRoomStudioZoneOptions(zone)
    return options.map((option) => [
      option.id,
      Object.freeze(options.filter((candidate) => candidate.id !== option.id).map((candidate) => candidate.id))
    ] as const)
  })
)

export const ROOM_STUDIO_COMPATIBLE_ALTERNATIVES = Object.freeze(
  compatibleAlternatives
) satisfies RoomStudioCompatibleAlternatives

const INSTANCE_IDS = {
  sleep: "studio-sleep",
  cozyCorner: "studio-cozy",
  wallStory: "studio-wall",
  softAccents: "studio-accents"
} as const

function modulePlacements(
  positions: Readonly<{
    sleep: readonly [number, number]
    cozyCorner: readonly [number, number]
    wallStory: readonly [number, number]
    softAccents: readonly [number, number]
  }>,
  theme: RoomStudioThemeId = "rose"
): RoomStudioModulePlacement[] {
  const options = Object.fromEntries(
    getRoomStudioThemeOptions(theme).map((item) => [item.zone, item.id])
  ) as Record<"sleep" | "cozyCorner" | "wallStory" | "softAccents", string>
  return [
    placement(INSTANCE_IDS.sleep, options.sleep, positions.sleep, "floor", true),
    placement(INSTANCE_IDS.cozyCorner, options.cozyCorner, positions.cozyCorner, "floor", true),
    placement(INSTANCE_IDS.wallStory, options.wallStory, positions.wallStory, "wall", true),
    placement(INSTANCE_IDS.softAccents, options.softAccents, positions.softAccents, "floor", false)
  ]
}

function placement(
  instanceId: string,
  moduleItemId: string,
  [x, y]: readonly [number, number],
  placementSurface: RoomPlacementSurface,
  required: boolean
): RoomStudioModulePlacement {
  return {
    instanceId,
    moduleItemId,
    x,
    y,
    rotation: "front",
    placementSurface,
    required
  }
}

export function getPinkCloudBedroomRecipeForTheme(
  theme: RoomStudioThemeId
): RoomStudioRecipeV1 {
  const recipeId = PINK_CLOUD_BEDROOM_RECIPE_IDS.find(
    (id) => RECIPE_THEME_IDS[id] === theme
  )
  if (!recipeId) throw new Error("room_studio_theme_unknown")
  return getPinkCloudBedroomRecipe(recipeId)
}

export function getRoomStudioZoneForInstance(
  instanceId: string
): RoomStudioZoneId {
  if (instanceId === INSTANCE_IDS.sleep) return "sleep"
  if (instanceId === INSTANCE_IDS.cozyCorner) return "cozyCorner"
  if (instanceId === INSTANCE_IDS.wallStory) return "wallStory"
  if (instanceId === INSTANCE_IDS.softAccents) return "softAccents"
  throw new Error("room_studio_module_instance_unknown")
}

export function applyRoomStudioThemeOptions(
  recipe: RoomStudioRecipeV1,
  selections: Readonly<Partial<Record<RoomStudioZoneId, string>>>
): RoomStudioRecipeV1 {
  const optionsById = new Map(
    ROOM_STUDIO_THEME_IDS.flatMap((theme) =>
      getRoomStudioThemeOptions(theme).map((option) => [option.id, option] as const)
    )
  )
  const selectedOptions = new Map<RoomStudioZoneId, string>()
  for (const zone of ROOM_STUDIO_ZONE_IDS) {
    const value = selections[zone]
    if (value === undefined) continue
    const option = optionsById.get(value)
    if (!option || option.zone !== zone) {
      throw new Error("room_studio_theme_option_incompatible")
    }
    selectedOptions.set(zone, value)
  }

  return {
    ...recipe,
    modules: recipe.modules.map((module) => {
      const zone = getRoomStudioZoneForInstance(module.instanceId)
      const selected = selectedOptions.get(zone)
      return selected ? { ...module, moduleItemId: selected } : { ...module }
    })
  }
}

const RECIPES: Readonly<Record<PinkCloudBedroomRecipeId, RoomStudioRecipeV1>> = {
  "pink-cloud-bedroom-balanced-v1": {
    id: "pink-cloud-bedroom-balanced-v1",
    shellId: ROOM_STUDIO_CANONICAL_SHELL_ID,
    presentationPresetId: "home-studio-balanced-v1",
    themeId: RECIPE_THEME_IDS["pink-cloud-bedroom-balanced-v1"],
    modules: modulePlacements({
      sleep: [0.39, 0.67],
      cozyCorner: [0.74, 0.74],
      wallStory: [0.69, 0.44],
      softAccents: [0.59, 0.76]
    }, "rose")
  },
  "pink-cloud-bedroom-airy-v1": {
    id: "pink-cloud-bedroom-airy-v1",
    shellId: ROOM_STUDIO_CANONICAL_SHELL_ID,
    presentationPresetId: "home-studio-airy-v1",
    themeId: RECIPE_THEME_IDS["pink-cloud-bedroom-airy-v1"],
    modules: modulePlacements({
      sleep: [0.35, 0.62],
      cozyCorner: [0.77, 0.68],
      wallStory: [0.67, 0.38],
      softAccents: [0.54, 0.70]
    }, "sky")
  },
  "pink-cloud-bedroom-extra-cozy-v1": {
    id: "pink-cloud-bedroom-extra-cozy-v1",
    shellId: ROOM_STUDIO_CANONICAL_SHELL_ID,
    presentationPresetId: "home-studio-extra-cozy-v1",
    themeId: RECIPE_THEME_IDS["pink-cloud-bedroom-extra-cozy-v1"],
    modules: modulePlacements({
      sleep: [0.41, 0.69],
      cozyCorner: [0.71, 0.72],
      wallStory: [0.69, 0.47],
      softAccents: [0.61, 0.76]
    }, "lilac")
  },
  "pink-cloud-bedroom-honey-v1": {
    id: "pink-cloud-bedroom-honey-v1",
    shellId: ROOM_STUDIO_CANONICAL_SHELL_ID,
    presentationPresetId: "home-studio-honey-v1",
    themeId: RECIPE_THEME_IDS["pink-cloud-bedroom-honey-v1"],
    modules: modulePlacements({
      sleep: [0.39, 0.67],
      cozyCorner: [0.74, 0.74],
      wallStory: [0.69, 0.44],
      softAccents: [0.59, 0.76]
    }, "honey")
  }
}

export const PINK_CLOUD_BEDROOM_RECIPES = PINK_CLOUD_BEDROOM_RECIPE_IDS.map(
  getPinkCloudBedroomRecipe
)

export function getPinkCloudBedroomRecipe(
  id: PinkCloudBedroomRecipeId
): RoomStudioRecipeV1 {
  const recipe = RECIPES[id]
  if (!recipe) throw new Error("room_studio_recipe_unknown")
  return {
    ...recipe,
    modules: recipe.modules.map((module) => ({ ...module }))
  }
}
