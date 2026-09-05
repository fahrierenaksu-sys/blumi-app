import {
  UNIVERSAL_CORE_ROOM_ITEM_IDS,
  type UniversalCoreRoomItemId
} from "@blumi/domain"

/**
 * Mobile art, QA ownership, Shop pricing, and the server purchase boundary all
 * consume the same shared 45-item identity. Keeping the shared array reference
 * prevents a mobile-only candidate from drifting away from the economy gate.
 */
export const ROOM_V3_UNIVERSAL_CORE_RUNTIME_CANDIDATE_IDS =
  UNIVERSAL_CORE_ROOM_ITEM_IDS

export type RoomV3UniversalCoreRuntimeCandidateId =
  UniversalCoreRoomItemId
