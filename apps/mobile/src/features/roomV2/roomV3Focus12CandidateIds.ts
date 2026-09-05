/**
 * Lightweight ID contract shared by the development-only Focus 12 QA catalog
 * and the QA ownership filter. It intentionally contains no asset imports so
 * provider tests and production runtime code never load candidate images.
 */
export const ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS = [
  "universal_cloud_sectional_sofa_a",
  "universal_cozy_tv_media_unit_a",
  "universal_home_arcade_a"
] as const

export type RoomV3Focus12QaCandidateId =
  (typeof ROOM_V3_FOCUS_12_QA_CANDIDATE_IDS)[number]
