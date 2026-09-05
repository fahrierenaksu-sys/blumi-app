import type { RoomFurnitureRotation } from "../../roomV2/roomV2.types"
import type { RoomAvatarAssetCoverageSummary } from "./avatarRoom.types"

export type RoomAvatarSeatInteractionDecision =
  | {
      canSit: true
      state: "sitting"
      feedback: "Settled in"
    }
  | {
      canSit: false
      state: null
      feedback:
        | "Turn this seat to front to sit"
        | "Sitting is unavailable for this outfit"
    }

/**
 * Seating must fail closed when any visible avatar layer falls back to a
 * different pose or direction. Moving an idle avatar to the approach point
 * creates a visibly broken half-interaction and must never be used as the
 * fallback for missing directional sitting artwork.
 */
export function resolveRoomAvatarSeatInteractionDecision(input: {
  coverage: RoomAvatarAssetCoverageSummary
  seatDirection: RoomFurnitureRotation
}): RoomAvatarSeatInteractionDecision {
  const canSit =
    input.coverage.requestedState === "sitting" &&
    input.coverage.requestedDirection === input.seatDirection &&
    input.coverage.isProductionReady &&
    input.coverage.supportsRequestedMotionExactly &&
    input.coverage.fallbackLayerCount === 0

  return canSit
    ? { canSit: true, state: "sitting", feedback: "Settled in" }
    : {
        canSit: false,
        state: null,
        feedback:
          input.seatDirection === "front"
            ? "Sitting is unavailable for this outfit"
            : "Turn this seat to front to sit"
      }
}
