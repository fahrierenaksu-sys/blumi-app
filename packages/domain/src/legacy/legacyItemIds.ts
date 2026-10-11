import legacyItemIds from "./legacyItemIds.json"

/**
 * Every retired item id (`legacyItemIds.json`, frozen: entries are only ever added). Rows that still hold one are
 * read past, never rewritten, and the id is never given to a new item (guard: `legacyItemIds.test.ts`). The room
 * part holds the old flat furniture and the universal core candidates. The avatar part holds the old ids that no
 * catalog contains any more (an old inventory may still own them; the inventory read grants their replacement).
 */
export const LEGACY_ROOM_ITEM_IDS: readonly string[] = Object.freeze([...legacyItemIds.room])
export const LEGACY_AVATAR_ITEM_IDS: readonly string[] = Object.freeze([...legacyItemIds.avatar])

/**
 * The old avatar ids that are still in the active catalog and stay wearable and owned until the avatar catalog
 * switch (plan X15), which moves them into the avatar part. Until then they are NOT legacy: `isLegacyItemId` is
 * false for them, so nothing about how they are sold, equipped or read changes. Once moved, every read path treats
 * them as legacy (coercion draws the body's starter piece, saves refuse them, rows stay untouched).
 */
export const RETIRING_AVATAR_ITEM_IDS: readonly string[] = Object.freeze([...legacyItemIds.avatarRetiring])

const LEGACY_ITEM_ID_SET: ReadonlySet<string> = new Set([...LEGACY_ROOM_ITEM_IDS, ...LEGACY_AVATAR_ITEM_IDS])
const RETIRING_AVATAR_ITEM_ID_SET: ReadonlySet<string> = new Set(RETIRING_AVATAR_ITEM_IDS)

export function isLegacyItemId(itemId: string): boolean {
  return LEGACY_ITEM_ID_SET.has(itemId)
}

export function isRetiringAvatarItemId(itemId: string): boolean {
  return RETIRING_AVATAR_ITEM_ID_SET.has(itemId)
}
