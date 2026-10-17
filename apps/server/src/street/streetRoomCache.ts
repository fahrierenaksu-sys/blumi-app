/** Bounds the cache; the oldest entry goes first. */
const STREET_ROOM_CACHE_MAX_ENTRIES = 5_000

/**
 * Reuses each owner's room for a short time across street reads, so a burst
 * of refetches (the app refetches when its thread list changes) reads rooms
 * and inventories once. Only rooms are cached: matches, blocks, bans and
 * closed windows are read fresh every time.
 */
export function createStreetRoomCache<Room>(input: {
  getMany: (userIds: readonly string[]) => Promise<ReadonlyMap<string, Room>>
  ttlMs: number
  now?: () => number
}): (userIds: readonly string[]) => Promise<ReadonlyMap<string, Room>> {
  const now = input.now ?? Date.now
  const entries = new Map<string, { at: number; room: Room | null }>()

  return async (userIds) => {
    const at = now()
    const result = new Map<string, Room>()
    const missing: string[] = []
    for (const userId of new Set(userIds)) {
      const hit = entries.get(userId)
      if (hit && at - hit.at >= 0 && at - hit.at < input.ttlMs) {
        if (hit.room !== null) result.set(userId, hit.room)
      } else {
        missing.push(userId)
      }
    }
    if (missing.length === 0) return result
    const fresh = await input.getMany(missing)
    for (const userId of missing) {
      const room = fresh.get(userId) ?? null
      entries.delete(userId)
      if (entries.size >= STREET_ROOM_CACHE_MAX_ENTRIES) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(userId, { at, room })
      if (room !== null) result.set(userId, room)
    }
    return result
  }
}
