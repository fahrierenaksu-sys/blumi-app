import legacyItemIds from "./legacyItemIds.json"

/**
 * Every retired item id (`legacyItemIds.json`, frozen: entries are only ever added). Rows that still hold one are
 * read past, never rewritten, and the id is never given to a new item (guard: `legacyItemIds.test.ts`). The room
 * part holds the old flat furniture and the universal core candidates; the avatar part lands with the avatar
 * catalog change.
 */
export const LEGACY_ROOM_ITEM_IDS: readonly string[] = Object.freeze([...legacyItemIds.room])
export const LEGACY_AVATAR_ITEM_IDS: readonly string[] = Object.freeze([...legacyItemIds.avatar])

const LEGACY_ITEM_ID_SET: ReadonlySet<string> = new Set([...LEGACY_ROOM_ITEM_IDS, ...LEGACY_AVATAR_ITEM_IDS])

export function isLegacyItemId(itemId: string): boolean {
  return LEGACY_ITEM_ID_SET.has(itemId)
}
