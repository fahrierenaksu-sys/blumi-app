export interface BlumiInventorySnapshot {
  coins: number
  ownedAvatarItemIds: string[]
  ownedRoomItemIds: string[]
  unlockedFeatureIds: string[]
  updatedAt: string
}

export interface InventoryUnlockResult {
  success: boolean
  reason?:
    | "already_owned"
    | "not_enough_coins"
    | "invalid_price"
    | "invalid_item"
    | "server_error"
}

export function copyInventorySnapshot(
  snapshot: BlumiInventorySnapshot
): BlumiInventorySnapshot {
  return {
    ...snapshot,
    ownedAvatarItemIds: [...snapshot.ownedAvatarItemIds],
    ownedRoomItemIds: [...snapshot.ownedRoomItemIds],
    unlockedFeatureIds: [...snapshot.unlockedFeatureIds]
  }
}

export function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))]
}

export function normalizeInventorySnapshot(input: {
  value: unknown
  defaults: BlumiInventorySnapshot
  validAvatarIds: ReadonlySet<string>
  validRoomIds: ReadonlySet<string>
  now?: string
}): BlumiInventorySnapshot | null {
  if (!input.value || typeof input.value !== "object") return null
  const candidate = input.value as Partial<BlumiInventorySnapshot>
  if (
    typeof candidate.coins !== "number" ||
    !Number.isFinite(candidate.coins) ||
    !Array.isArray(candidate.ownedAvatarItemIds) ||
    !Array.isArray(candidate.ownedRoomItemIds)
  ) {
    return null
  }

  return {
    coins: Math.max(0, Math.floor(candidate.coins)),
    ownedAvatarItemIds: uniqueStrings([
      ...input.defaults.ownedAvatarItemIds,
      ...candidate.ownedAvatarItemIds
    ]).filter((itemId) => input.validAvatarIds.has(itemId)),
    ownedRoomItemIds: uniqueStrings([
      ...input.defaults.ownedRoomItemIds,
      ...candidate.ownedRoomItemIds
    ]).filter((itemId) => input.validRoomIds.has(itemId)),
    unlockedFeatureIds: uniqueStrings(candidate.unlockedFeatureIds ?? []),
    updatedAt: typeof candidate.updatedAt === "string"
      ? candidate.updatedAt
      : input.now ?? new Date().toISOString()
  }
}

export function applyInventoryUnlock(input: {
  current: BlumiInventorySnapshot
  itemId: string
  priceCoins: number
  ownedKey: "ownedAvatarItemIds" | "ownedRoomItemIds"
  now?: string
}): {
  nextInventory: BlumiInventorySnapshot
  result: InventoryUnlockResult
} {
  const current = copyInventorySnapshot(input.current)
  const ownedIds = current[input.ownedKey]
  if (ownedIds.includes(input.itemId)) {
    return { nextInventory: current, result: { success: false, reason: "already_owned" } }
  }
  if (!Number.isFinite(input.priceCoins) || input.priceCoins < 0) {
    return { nextInventory: current, result: { success: false, reason: "invalid_price" } }
  }

  const priceCoins = Math.floor(input.priceCoins)
  if (current.coins < priceCoins) {
    return { nextInventory: current, result: { success: false, reason: "not_enough_coins" } }
  }

  return {
    nextInventory: {
      ...current,
      coins: current.coins - priceCoins,
      [input.ownedKey]: uniqueStrings([...ownedIds, input.itemId]),
      updatedAt: input.now ?? new Date().toISOString()
    },
    result: { success: true }
  }
}

export function serializeInventorySnapshot(snapshot: BlumiInventorySnapshot): string {
  return JSON.stringify(copyInventorySnapshot(snapshot))
}
