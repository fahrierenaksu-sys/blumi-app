/**
 * The room pet is off unless EXPO_PUBLIC_BLUMI_ROOM_PET is exactly "1".
 * Off: My Room builds no pet map, runs no pet timer and draws no pet slot.
 */
export function isRoomPetEnabled(rawValue: string | undefined): boolean {
  return rawValue?.trim() === "1"
}

export const IS_BLUMI_ROOM_PET_ENABLED = isRoomPetEnabled(process.env.EXPO_PUBLIC_BLUMI_ROOM_PET)
