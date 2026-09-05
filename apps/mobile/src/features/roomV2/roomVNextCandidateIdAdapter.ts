const ROOM_VNEXT_CANDIDATE_ID_ALIASES = Object.freeze({
  room_v2_cozy_bed: "universal_cloud_bed_b",
  room_vnext_lounge_chair: "universal_lounge_armchair_a",
  room_vnext_round_table: "universal_round_dining_table_a",
  room_vnext_side_table: "universal_petal_side_table_a",
  room_vnext_lamp: "universal_orbit_floor_lamp_a",
  room_vnext_bookshelf: "universal_open_bookshelf_a",
  room_vnext_rug: "universal_rug_a"
} as const)

export function normalizeRoomVNextCandidateItemId(itemId: string): string {
  const normalizedItemId = itemId.trim()
  if (!normalizedItemId) return itemId
  return ROOM_VNEXT_CANDIDATE_ID_ALIASES[
    normalizedItemId as keyof typeof ROOM_VNEXT_CANDIDATE_ID_ALIASES
  ] ?? normalizedItemId
}
