import {
  createCandidateAvatarAppearance,
  createCandidateAvatarSnapshot,
  type CandidateAvatarSnapshot
} from "../avatarV2/candidateAvatarSnapshot"
import { ROOM_AVATAR_CATALOG } from "../avatarV2/room/avatarRoom.mock"
import { getRoomAvatarRenderLayers } from "../avatarV2/room/avatarRoomSelectors"
import type { MiniRoomParticipantAvatarSnapshot } from "./scene/miniRoomSceneTypes"

export function createMiniRoomPartnerAvatarSnapshot(input: {
  userId: string
  displayName: string
  candidateAvatarSnapshot?: CandidateAvatarSnapshot
}): MiniRoomParticipantAvatarSnapshot {
  const candidate = createCandidateAvatarSnapshot({
    userId: input.userId,
    displayName: input.displayName,
    avatarSnapshot: input.candidateAvatarSnapshot
  })
  const isRemote = candidate.source === "remote_candidate_avatar"
  const snapshotSource = isRemote
    ? "remote_participant_avatar"
    : "partner_preview_fallback"
  const appearance = createCandidateAvatarAppearance(candidate)

  return {
    userId: input.userId,
    displayName: candidate.displayName,
    role: "partner",
    source: snapshotSource,
    appearance: {
      base: candidate.bodyPreset === "male" ? "male_base_01" : "female_base_01",
      snapshotSource,
      roomAvatarAppearance: appearance,
      roomAvatarLayers: getRoomAvatarRenderLayers({
        appearance,
        catalog: ROOM_AVATAR_CATALOG
      }),
      fallbackReason: isRemote
        ? undefined
        : "A consistent Blumi preview is shown because the remote avatar snapshot is unavailable."
    }
  }
}
