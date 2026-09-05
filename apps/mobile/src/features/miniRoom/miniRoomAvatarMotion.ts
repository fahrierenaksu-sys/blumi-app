import { ROOM_AVATAR_CATALOG } from "../avatarV2/room/avatarRoom.mock"
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

export function canMiniRoomAvatarUseMotion(
  input: MiniRoomAvatarMotionInput
): boolean {
  const requestedState = toRoomAvatarMotionState(input.motion)
  if (requestedState === "idle") return true
  if (!input.appearance.roomAvatarAppearance) return false

  const layers = resolveAppearanceLayers(input, requestedState)
  return getRoomV2AvatarMotionAssetDiagnostics({
    layers,
    requestedState,
    requestedDirection: input.facing
  }).isProductionReady
}

function toRoomAvatarMotionState(
  motion: AvatarState["motion"]
): RoomV2AvatarMotionState {
  if (motion === "walking" || motion === "sitting") return motion
  return "idle"
}
