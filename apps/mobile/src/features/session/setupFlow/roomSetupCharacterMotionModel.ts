import type { RoomV2AvatarMotionState } from "../../roomV2/roomV2.types"

export type RoomSetupCharacterPhase = "entering" | "idle" | "reacting"

export const ROOM_SETUP_CHARACTER_MOTION = Object.freeze({
  entranceDurationMs: 920,
  reactionDurationMs: 1_100,
  ambientIntervalMs: 5_400,
  ambientCueDurationMs: 760
})

export function getRoomSetupAvatarMotionState(
  phase: RoomSetupCharacterPhase
): RoomV2AvatarMotionState {
  return phase === "idle" ? "idle" : "walking"
}
