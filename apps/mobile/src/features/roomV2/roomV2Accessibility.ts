import type {
  RoomFurnitureRotation,
  RoomV2AvatarMotionState
} from "./roomV2.types"

const ROOM_AVATAR_MOTION_LABELS: Record<RoomV2AvatarMotionState, string> = {
  idle: "Standing",
  walking: "Walking",
  sitting: "Sitting",
  waving: "Waving",
  dancing: "Dancing"
}

export function getRoomV2AvatarAccessibilityValue(input: {
  state?: RoomV2AvatarMotionState
  direction?: RoomFurnitureRotation
  seatedFurnitureName?: string
}): string {
  const state = input.state ?? "idle"
  const direction = input.direction ?? "front"
  if (state === "sitting" && input.seatedFurnitureName) {
    return `Sitting on ${input.seatedFurnitureName}, ${direction} view`
  }
  return `${ROOM_AVATAR_MOTION_LABELS[state]}, ${direction} view`
}
