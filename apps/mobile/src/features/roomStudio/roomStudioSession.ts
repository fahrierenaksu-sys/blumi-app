import type {
  PlacedRoomItem,
  RoomFurnitureRotation,
  RoomPlacementSurface,
  UserRoomDecor
} from "../roomV2/roomV2.types"
import type { RoomStudioThemeId } from "./roomStudioThemeMatrix"

export const ROOM_STUDIO_CANONICAL_SHELL_ID =
  "room_v2_shell_blumi_world_v1" as const
export const ROOM_STUDIO_GEOMETRY_VERSION =
  "home-studio-scene-modules-v1" as const

const ROOM_STUDIO_DIRECTIONS = new Set<RoomFurnitureRotation>([
  "front",
  "right",
  "back",
  "left"
])

export interface RoomStudioRecipeV1 {
  id: string
  shellId: typeof ROOM_STUDIO_CANONICAL_SHELL_ID
  presentationPresetId: string
  /** Optional for backwards-compatible saved QA recipes; curated recipes set it. */
  themeId?: RoomStudioThemeId
  modules: RoomStudioModulePlacement[]
}

export interface RoomStudioModulePlacement {
  instanceId: string
  moduleItemId: string
  x: number
  y: number
  rotation: RoomFurnitureRotation
  placementSurface: RoomPlacementSurface
  required: boolean
}

export interface RoomStudioSession {
  originalDecor: UserRoomDecor
  recipeBaseline: UserRoomDecor
  draftDecor: UserRoomDecor
  activeRecipeId: string
}

export type RoomStudioModulePatch = Partial<Pick<
  RoomStudioModulePlacement,
  "x" | "y" | "rotation"
>>

export type RoomStudioCompatibleAlternatives = Readonly<
  Record<string, readonly string[]>
>

export function createRoomStudioPreview(
  originalDecor: UserRoomDecor,
  recipe: RoomStudioRecipeV1
): UserRoomDecor {
  validateRoomStudioRecipe(recipe)
  return {
    ...(originalDecor.schemaVersion === undefined
      ? {}
      : { schemaVersion: originalDecor.schemaVersion }),
    ...(originalDecor.geometryVersion === undefined
      ? {}
      : { geometryVersion: originalDecor.geometryVersion }),
    roomShellId: recipe.shellId,
    placedItems: recipe.modules.map(compileRoomStudioModule)
  }
}

export function createRoomStudioSession(
  originalDecor: UserRoomDecor,
  recipe: RoomStudioRecipeV1
): RoomStudioSession {
  const recipeBaseline = createRoomStudioPreview(originalDecor, recipe)
  return {
    originalDecor: copyRoomStudioDecor(originalDecor),
    recipeBaseline: copyRoomStudioDecor(recipeBaseline),
    draftDecor: copyRoomStudioDecor(recipeBaseline),
    activeRecipeId: recipe.id
  }
}

/**
 * Rehydrates a previously saved QA draft without recompiling a recipe. This
 * is deliberately separate from createRoomStudioSession so reopen preserves
 * the exact coordinates and directions the user saved.
 */
export function hydrateRoomStudioSession(
  savedDecor: UserRoomDecor,
  activeRecipeId = "saved-qa-draft"
): RoomStudioSession {
  if (savedDecor.roomShellId !== ROOM_STUDIO_CANONICAL_SHELL_ID) {
    throw new Error("room_studio_shell_not_canonical")
  }
  const savedCopy = copyRoomStudioDecor(savedDecor)
  return {
    originalDecor: copyRoomStudioDecor(savedCopy),
    recipeBaseline: copyRoomStudioDecor(savedCopy),
    draftDecor: copyRoomStudioDecor(savedCopy),
    activeRecipeId: requireNonblank(activeRecipeId, "room_studio_recipe_id_invalid")
  }
}

export function applyRoomStudioRecipe(
  session: RoomStudioSession,
  recipe: RoomStudioRecipeV1
): RoomStudioSession {
  const recipeBaseline = createRoomStudioPreview(session.originalDecor, recipe)
  return {
    originalDecor: copyRoomStudioDecor(session.originalDecor),
    recipeBaseline: copyRoomStudioDecor(recipeBaseline),
    draftDecor: copyRoomStudioDecor(recipeBaseline),
    activeRecipeId: recipe.id
  }
}

export function updateRoomStudioModule(
  session: RoomStudioSession,
  instanceId: string,
  patch: RoomStudioModulePatch
): RoomStudioSession {
  const normalizedInstanceId = requireNonblank(
    instanceId,
    "room_studio_module_missing"
  )
  const existing = session.draftDecor.placedItems.find(
    (item) => item.instanceId === normalizedInstanceId
  )
  if (!existing) throw new Error("room_studio_module_missing")

  const nextX = patch.x ?? existing.x
  const nextY = patch.y ?? existing.y
  validateNormalizedPosition(nextX, nextY)
  const nextRotation = patch.rotation ?? existing.rotation
  if (!ROOM_STUDIO_DIRECTIONS.has(nextRotation)) {
    throw new Error("room_studio_module_rotation_invalid")
  }

  return {
    originalDecor: copyRoomStudioDecor(session.originalDecor),
    recipeBaseline: copyRoomStudioDecor(session.recipeBaseline),
    draftDecor: {
      ...copyRoomStudioDecor(session.draftDecor),
      placedItems: session.draftDecor.placedItems.map((item) =>
        item.instanceId === normalizedInstanceId
          ? {
              ...item,
              x: nextX,
              y: nextY,
              rotation: nextRotation
            }
          : copyRoomStudioPlacedItem(item)
      )
    },
    activeRecipeId: session.activeRecipeId
  }
}

export function replaceRoomStudioModule(
  session: RoomStudioSession,
  instanceId: string,
  replacementItemId: string,
  compatibleAlternatives: RoomStudioCompatibleAlternatives
): RoomStudioSession {
  const normalizedInstanceId = requireNonblank(
    instanceId,
    "room_studio_module_missing"
  )
  const normalizedReplacementItemId = requireNonblank(
    replacementItemId,
    "room_studio_module_replacement_invalid"
  )
  const existing = session.draftDecor.placedItems.find(
    (item) => item.instanceId === normalizedInstanceId
  )
  if (!existing) throw new Error("room_studio_module_missing")

  const compatible = compatibleAlternatives[existing.itemId] ?? []
  if (!compatible.includes(normalizedReplacementItemId)) {
    throw new Error("room_studio_module_replacement_incompatible")
  }
  if (session.draftDecor.placedItems.some(
    (item) => item.instanceId !== normalizedInstanceId &&
      item.itemId === normalizedReplacementItemId
  )) {
    throw new Error("room_studio_module_item_duplicate")
  }

  return {
    originalDecor: copyRoomStudioDecor(session.originalDecor),
    recipeBaseline: copyRoomStudioDecor(session.recipeBaseline),
    draftDecor: {
      ...copyRoomStudioDecor(session.draftDecor),
      placedItems: session.draftDecor.placedItems.map((item) =>
        item.instanceId === normalizedInstanceId
          ? { ...copyRoomStudioPlacedItem(item), itemId: normalizedReplacementItemId }
          : copyRoomStudioPlacedItem(item)
      )
    },
    activeRecipeId: session.activeRecipeId
  }
}

export function restoreRoomStudioLayout(
  session: RoomStudioSession
): RoomStudioSession {
  return {
    originalDecor: copyRoomStudioDecor(session.originalDecor),
    recipeBaseline: copyRoomStudioDecor(session.recipeBaseline),
    draftDecor: copyRoomStudioDecor(session.recipeBaseline),
    activeRecipeId: session.activeRecipeId
  }
}

export function backToMyRoom(
  session: RoomStudioSession
): RoomStudioSession {
  return {
    originalDecor: copyRoomStudioDecor(session.originalDecor),
    recipeBaseline: copyRoomStudioDecor(session.recipeBaseline),
    draftDecor: copyRoomStudioDecor(session.originalDecor),
    activeRecipeId: session.activeRecipeId
  }
}

export function validateRoomStudioRecipe(
  recipe: RoomStudioRecipeV1
): void {
  requireNonblank(recipe.id, "room_studio_recipe_id_invalid")
  requireNonblank(
    recipe.presentationPresetId,
    "room_studio_presentation_preset_invalid"
  )
  if (recipe.shellId !== ROOM_STUDIO_CANONICAL_SHELL_ID) {
    throw new Error("room_studio_shell_not_canonical")
  }
  if (!Array.isArray(recipe.modules) || recipe.modules.length < 1 || recipe.modules.length > 6) {
    throw new Error("room_studio_module_count_invalid")
  }

  const instanceIds = new Set<string>()
  const moduleItemIds = new Set<string>()
  for (const module of recipe.modules) {
    const instanceId = requireNonblank(
      module.instanceId,
      "room_studio_module_instance_invalid"
    )
    const moduleItemId = requireNonblank(
      module.moduleItemId,
      "room_studio_module_item_invalid"
    )
    if (instanceIds.has(instanceId)) {
      throw new Error("room_studio_module_instance_duplicate")
    }
    if (moduleItemIds.has(moduleItemId)) {
      throw new Error("room_studio_module_item_duplicate")
    }
    instanceIds.add(instanceId)
    moduleItemIds.add(moduleItemId)
    validateNormalizedPosition(module.x, module.y)
    if (!ROOM_STUDIO_DIRECTIONS.has(module.rotation)) {
      throw new Error("room_studio_module_rotation_invalid")
    }
    if (!isPlacementSurface(module.placementSurface)) {
      throw new Error("room_studio_module_surface_invalid")
    }
    if (typeof module.required !== "boolean") {
      throw new Error("room_studio_module_required_invalid")
    }
  }
}

function compileRoomStudioModule(
  module: RoomStudioModulePlacement
): PlacedRoomItem {
  return {
    instanceId: module.instanceId,
    itemId: module.moduleItemId,
    x: module.x,
    y: module.y,
    rotation: module.rotation,
    placementSurface: module.placementSurface,
    geometryVersion: ROOM_STUDIO_GEOMETRY_VERSION
  }
}

function isPlacementSurface(value: unknown): value is RoomPlacementSurface {
  return value === "floor" || value === "wall" ||
    value === "tabletop" || value === "ceiling"
}

function validateNormalizedPosition(x: number, y: number): void {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1
  ) {
    throw new Error("room_studio_module_position_invalid")
  }
}

function requireNonblank(value: string, error: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(error)
  return value.trim()
}

function copyRoomStudioPlacedItem(item: PlacedRoomItem): PlacedRoomItem {
  return {
    ...item,
    ...(item.supportLocalPosition
      ? { supportLocalPosition: { ...item.supportLocalPosition } }
      : {})
  }
}

function copyRoomStudioDecor(decor: UserRoomDecor): UserRoomDecor {
  return {
    ...decor,
    ...(decor.migration ? { migration: { ...decor.migration } } : {}),
    placedItems: decor.placedItems.map(copyRoomStudioPlacedItem)
  }
}
