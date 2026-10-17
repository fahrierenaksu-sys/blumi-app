/**
 * Whether the server says this member has a room pet. The server alone
 * decides: it grants the starter cat on the first read while the pet flag is
 * on. Anything else (route missing, feature unavailable, bad payload, a pet
 * hidden from the room) means the room draws no pet.
 */
export type ServerRoomPetPresence = "present" | "absent"

export function readServerRoomPetPresence(status: number, payload: unknown): ServerRoomPetPresence {
  if (status !== 200 || !isRecord(payload) || !isRecord(payload.pet)) return "absent"
  const { petId, speciesItemId, roomState } = payload.pet
  if (typeof petId !== "string" || petId.length === 0) return "absent"
  if (typeof speciesItemId !== "string" || speciesItemId.length === 0) return "absent"
  return roomState === "home" ? "present" : "absent"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
