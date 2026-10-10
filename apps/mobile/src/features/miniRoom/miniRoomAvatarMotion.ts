import type { RoomAvatar25dSpec } from "../avatar/roomAvatarSeamContract"
import { roomAvatar25d } from "../avatar/roomAvatarSeam"
import { ROOM_AVATAR_CATALOG } from "../avatarV2/room/avatarRoomCatalog"
import { getRoomAvatarRenderLayers } from "../avatarV2/room/avatarRoomSelectors"
import { getRoomV2AvatarMotionAssetDiagnostics } from "../roomV2/roomV2AvatarMotion"
import type { RoomV2AvatarMotionState } from "../roomV2/roomV2.types"
import type {
  AvatarAppearance,
  AvatarFacing,
  AvatarState
} from "./scene/miniRoomSceneTypes"
import type { RoomAvatarCatalogItem } from "../avatarV2/room/avatarRoom.types"

interface MiniRoomAvatarMotionInput {
  appearance: AvatarAppearance
  motion: AvatarState["motion"]
  facing: AvatarFacing
  /** Test-only catalog seam; production always uses the canonical catalog. */
  catalog?: RoomAvatarCatalogItem[]
}

export function getMiniRoomAvatarRenderLayers(
  input: MiniRoomAvatarMotionInput
) {
  if (!input.appearance.roomAvatarAppearance) {
    return input.appearance.roomAvatarLayers ?? []
  }

  const requestedState = toRoomAvatarMotionState(input.motion)
  const requestedLayers = resolveAppearanceLayers(input, requestedState)
  if (requestedState === "idle") return requestedLayers

  const diagnostics = getRoomV2AvatarMotionAssetDiagnostics({
    layers: requestedLayers,
    requestedState,
    requestedDirection: input.facing
  })
  return diagnostics.isProductionReady
    ? requestedLayers
    : resolveAppearanceLayers(input, "idle")
}

function resolveAppearanceLayers(
  input: MiniRoomAvatarMotionInput,
  state: RoomV2AvatarMotionState
) {
  return getRoomAvatarRenderLayers({
    appearance: input.appearance.roomAvatarAppearance,
    catalog: input.catalog ?? ROOM_AVATAR_CATALOG,
    state,
    direction: input.facing
  })
}

/** 2.5D avatar: the whole avatar's 2.5D spec, or null (the stub, or any item without art). */
export function getMiniRoomAvatar25dSpec(input: MiniRoomAvatarMotionInput): RoomAvatar25dSpec | null {
  return roomAvatar25d.resolveRoomAvatar25d({
    loadout: input.appearance.avatarLoadout,
    state: toRoomAvatarMotionState(input.motion),
    direction: input.facing
  })
}

export function canMiniRoomAvatarUseMotion(
  input: MiniRoomAvatarMotionInput
): boolean {
  const requestedState = toRoomAvatarMotionState(input.motion)
  if (requestedState === "idle") return true
  // 2.5D avatar: that renderer draws every pose of the whole avatar (the stub never resolves one).
  if (getMiniRoomAvatar25dSpec(input)) return true
  if (!input.appearance.roomAvatarAppearance) return false

  const layers = resolveAppearanceLayers(input, requestedState)
  return getRoomV2AvatarMotionAssetDiagnostics({
    layers,
    requestedState,
    requestedDirection: input.facing
  }).isProductionReady
}

/** Squash that suggests sitting when only the standing idle art can be shown. */
export const MINI_ROOM_IDLE_FALLBACK_SIT_SCALE_Y = 0.86

/**
 * Vertical scale of a seated avatar (ROOM-04). Real sitting layers are drawn
 * seated, so squashing them distorted the locked chibi proportions; only the
 * standing idle fallback gets the squash.
 */
export function getMiniRoomAvatarSittingScaleY(input: MiniRoomAvatarMotionInput): number {
  if (input.motion !== "sitting") return 1
  return canMiniRoomAvatarUseMotion(input) ? 1 : MINI_ROOM_IDLE_FALLBACK_SIT_SCALE_Y
}

function toRoomAvatarMotionState(
  motion: AvatarState["motion"]
): RoomV2AvatarMotionState {
  if (motion === "walking" || motion === "sitting") return motion
  return "idle"
}
