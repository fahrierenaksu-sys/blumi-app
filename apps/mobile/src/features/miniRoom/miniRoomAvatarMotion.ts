import type { RoomAvatar25dSpec } from "../avatar/roomAvatarSeamContract"
import { roomAvatar25d } from "../avatar/roomAvatarSeam"
import type { RoomV2AvatarMotionState } from "../roomV2/roomV2.types"
import type {
  AvatarAppearance,
  AvatarFacing,
  AvatarState
} from "./scene/miniRoomSceneTypes"

interface MiniRoomAvatarMotionInput {
  appearance: AvatarAppearance
  motion: AvatarState["motion"]
  facing: AvatarFacing
}

/** 2.5D avatar: the whole avatar's 2.5D spec, or null (the seam is not installed, or an item has no art). */
export function getMiniRoomAvatar25dSpec(input: MiniRoomAvatarMotionInput): RoomAvatar25dSpec | null {
  return roomAvatar25d.resolveRoomAvatar25d({
    loadout: input.appearance.avatarLoadout,
    state: toRoomAvatarMotionState(input.motion),
    direction: input.facing
  })
}

/**
 * Whether this avatar can be drawn walking or sitting. Standing idle always can; every other pose
 * needs the 2.5D renderer to resolve the whole avatar.
 */
export function canMiniRoomAvatarUseMotion(
  input: MiniRoomAvatarMotionInput
): boolean {
  if (toRoomAvatarMotionState(input.motion) === "idle") return true
  return getMiniRoomAvatar25dSpec(input) !== null
}

function toRoomAvatarMotionState(
  motion: AvatarState["motion"]
): RoomV2AvatarMotionState {
  if (motion === "walking" || motion === "sitting") return motion
  return "idle"
}
