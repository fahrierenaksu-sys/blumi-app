import { readStoredRoomV2Decor } from "../roomV2/roomV2Persistence"
import type { UserRoomDecor } from "../roomV2/roomV2.types"

export interface RoomStudioStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

const PREFIX = "@blumi/room_studio/qa:v1"

export async function loadRoomStudioQaDecor(
  storage: RoomStudioStorage,
  ownerUserId: string | undefined
): Promise<UserRoomDecor | undefined> {
  const key = getRoomStudioQaStorageKey(ownerUserId)
  if (!key) return undefined
  try {
    const result = readStoredRoomV2Decor(await storage.getItem(key))
    return result.status === "ready" ? result.decor : undefined
  } catch {
    return undefined
  }
}

export async function saveRoomStudioQaDecor(
  storage: RoomStudioStorage,
  ownerUserId: string | undefined,
  decor: UserRoomDecor
): Promise<void> {
  const key = getRoomStudioQaStorageKey(ownerUserId)
  if (!key) throw new Error("room_studio_qa_owner_missing")
  if (decor.roomShellId !== "room_v2_shell_blumi_world_v1") {
    throw new Error("room_studio_qa_shell_not_canonical")
  }
  await storage.setItem(key, JSON.stringify(decor))
}

export function getRoomStudioQaStorageKey(
  ownerUserId: string | undefined
): string | null {
  const normalized = ownerUserId?.trim()
  return normalized ? `${PREFIX}:${encodeURIComponent(normalized)}` : null
}
