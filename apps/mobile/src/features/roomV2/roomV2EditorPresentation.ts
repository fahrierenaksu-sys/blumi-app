import type {
  FurnitureItem,
  RoomFurnitureRotation
} from "./roomV2.types"

const DEFAULT_EDITOR_HINT = "Drag in the room · choose a direction" as const
const FRONT_SEATING_HINT = "Turn front to sit · drag to move" as const
const DEFAULT_EDITOR_SUBTITLE = "Choose a piece, then place it your way" as const
const ROTATABLE_SELECTED_ITEM_SUBTITLE = "Drag to move · rotate or save" as const
const FIXED_VIEW_SELECTED_ITEM_SUBTITLE = "Drag to move · then save" as const

export function getRoomV2EditorInspectorHint(input: {
  interactionType: FurnitureItem["interactionType"]
  rotation: RoomFurnitureRotation
}): typeof DEFAULT_EDITOR_HINT | typeof FRONT_SEATING_HINT {
  return input.interactionType === "seat" && input.rotation !== "front"
    ? FRONT_SEATING_HINT
    : DEFAULT_EDITOR_HINT
}

export function hasMultipleRoomV2RotationOptions(
  rotationOptions: readonly RoomFurnitureRotation[]
): boolean {
  return rotationOptions.length > 1
}

export function getRoomV2EditorSubtitle(input: {
  placementFeedback: string | undefined
  hasSelectedItem: boolean
  canRotateSelectedItem: boolean
}): string {
  if (input.placementFeedback) return input.placementFeedback
  if (!input.hasSelectedItem) return DEFAULT_EDITOR_SUBTITLE
  return input.canRotateSelectedItem
    ? ROTATABLE_SELECTED_ITEM_SUBTITLE
    : FIXED_VIEW_SELECTED_ITEM_SUBTITLE
}
