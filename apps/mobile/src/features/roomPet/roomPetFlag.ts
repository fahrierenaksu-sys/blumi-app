/**
 * The room pet is off unless EXPO_PUBLIC_BLUMI_ROOM_PET is exactly "1".
 * Nothing renders the pet yet; the flag gates the future renderer hook.
 */
export function isRoomPetEnabled(rawValue: string | undefined): boolean {
  return rawValue?.trim() === "1"
}

export const IS_BLUMI_ROOM_PET_ENABLED = isRoomPetEnabled(process.env.EXPO_PUBLIC_BLUMI_ROOM_PET)
