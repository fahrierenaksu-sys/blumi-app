import { useCallback, useEffect, useMemo, useState } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { AVATAR_V2_CATALOG } from "../avatarV2/avatarV2.mock"
import { loadAccountScopedStorage } from "../persistence/accountScopedStorage"
import { ROOM_V2_FURNITURE_CATALOG } from "../roomV2/roomV2.mock"
import {
  claimDailyEconomyReward,
  fetchEconomyInventory,
  purchaseEconomyItem,
  type EconomyPurchaseType
} from "./economyApi"
import {
  applyInventoryUnlock,
  copyInventorySnapshot,
  normalizeInventorySnapshot,
  serializeInventorySnapshot,
  uniqueStrings,
  type BlumiInventorySnapshot,
  type InventoryUnlockResult
} from "./inventoryModel"
import {
  createOwnerInventoryState,
  failOwnerInventoryHydration,
  isOwnerInventoryReady,
  replaceOwnerInventory,
  shouldApplyInventoryHydrationResponse,
  shouldApplyServerInventorySnapshot,
  type InventoryHydrationStatus,
  type OwnerInventoryState
} from "./inventoryScopeModel"

export type { BlumiInventorySnapshot, InventoryUnlockResult } from "./inventoryModel"

const INVENTORY_STORAGE_PREFIX = "@blumi/inventory/v2"
const INVENTORY_MIGRATION_PREFIX = "@blumi/inventory/migrated:v2"
const LEGACY_INVENTORY_STORAGE_KEY = "@blumi/inventory/local_inventory_v1"
const ANONYMOUS_OWNER = "__no_inventory_owner__"
const STARTER_COINS = 1250

export interface InventoryStoreView {
  inventory: BlumiInventorySnapshot
  isReady: boolean
  hydrationStatus: InventoryHydrationStatus
  ownsAvatarItem: (itemId: string) => boolean
  ownsRoomItem: (itemId: string) => boolean
  unlockAvatarItem: (itemId: string, priceCoins: number) => InventoryUnlockResult
  unlockRoomItem: (itemId: string, priceCoins: number) => InventoryUnlockResult
  hydrateFromServer: (sessionToken: string) => Promise<InventoryUnlockResult>
  claimDailyRewardFromServer: (sessionToken: string) => Promise<number | null>
  purchaseAvatarItem: (sessionToken: string, itemId: string) => Promise<InventoryUnlockResult>
  purchaseRoomItem: (sessionToken: string, itemId: string) => Promise<InventoryUnlockResult>
  unlockFeature: (featureId: string) => void
}

const DEFAULT_OWNED_AVATAR_ITEM_IDS = AVATAR_V2_CATALOG
  .filter((item) => item.ownedByDefault)
  .map((item) => item.id)
const DEFAULT_OWNED_ROOM_ITEM_IDS = ROOM_V2_FURNITURE_CATALOG
  .filter((item) => item.ownedByDefault)
  .map((item) => item.id)
const VALID_AVATAR_ITEM_IDS = new Set(AVATAR_V2_CATALOG.map((item) => item.id))
const VALID_ROOM_ITEM_IDS = new Set(ROOM_V2_FURNITURE_CATALOG.map((item) => item.id))

interface OwnerInventoryCache {
  state: OwnerInventoryState
  loadPromise: Promise<void> | null
  serverHydrationGeneration: number
  serverMutationGeneration: number
  serverMutationTail: Promise<void>
}

type Listener = () => void
const ownerCaches = new Map<string, OwnerInventoryCache>()
const ownerListeners = new Map<string, Set<Listener>>()

function normalizeOwnerId(ownerUserId: string | undefined): string {
  return ownerUserId?.trim() || ANONYMOUS_OWNER
}

function inventoryStorageKey(ownerUserId: string): string {
  return `${INVENTORY_STORAGE_PREFIX}:${encodeURIComponent(ownerUserId)}`
}

function inventoryMigrationKey(ownerUserId: string): string {
  return `${INVENTORY_MIGRATION_PREFIX}:${encodeURIComponent(ownerUserId)}`
}

function createDefaultInventorySnapshot(): BlumiInventorySnapshot {
  return {
    coins: STARTER_COINS,
    ownedAvatarItemIds: [...DEFAULT_OWNED_AVATAR_ITEM_IDS],
    ownedRoomItemIds: [...DEFAULT_OWNED_ROOM_ITEM_IDS],
    unlockedFeatureIds: [],
    updatedAt: new Date(0).toISOString()
  }
}

function getOwnerCache(ownerUserId: string): OwnerInventoryCache {
  const existing = ownerCaches.get(ownerUserId)
  if (existing) return existing
  const created = {
    state: createOwnerInventoryState(ownerUserId, createDefaultInventorySnapshot()),
    loadPromise: null,
    serverHydrationGeneration: 0,
    serverMutationGeneration: 0,
    serverMutationTail: Promise.resolve()
  }
  ownerCaches.set(ownerUserId, created)
  return created
}

function notify(ownerUserId: string): void {
  ownerListeners.get(ownerUserId)?.forEach((listener) => listener())
}

function normalizeStoredInventory(value: unknown): BlumiInventorySnapshot | null {
  return normalizeInventorySnapshot({
    value,
    defaults: createDefaultInventorySnapshot(),
    validAvatarIds: VALID_AVATAR_ITEM_IDS,
    validRoomIds: VALID_ROOM_ITEM_IDS
  })
}

async function loadInventorySnapshot(ownerUserId: string): Promise<void> {
  const cache = getOwnerCache(ownerUserId)
  if (cache.state.localStatus === "ready") return
  if (cache.loadPromise) return cache.loadPromise

  if (ownerUserId === ANONYMOUS_OWNER) {
    cache.state = replaceOwnerInventory({
      current: cache.state,
      ownerUserId,
      source: "local",
      inventory: createDefaultInventorySnapshot()
    })
    notify(ownerUserId)
    return
  }

  cache.state = { ...cache.state, localStatus: "loading" }
  notify(ownerUserId)
  const load = (async () => {
    const result = await loadAccountScopedStorage({
      storage: AsyncStorage,
      entries: [{
        scopedKey: inventoryStorageKey(ownerUserId),
        legacyKey: LEGACY_INVENTORY_STORAGE_KEY
      }],
      migrationMarkerKey: inventoryMigrationKey(ownerUserId)
    })
    if (result.status === "error") {
      cache.state = failOwnerInventoryHydration({
        current: cache.state,
        ownerUserId,
        source: "local"
      })
      return
    }
    const rawValue = result.rawValues[0]
    const stored = rawValue ? normalizeStoredInventory(JSON.parse(rawValue) as unknown) : null
    cache.state = replaceOwnerInventory({
      current: cache.state,
      ownerUserId,
      source: "local",
      inventory: stored ?? createDefaultInventorySnapshot()
    })
  })().catch(() => {
    cache.state = failOwnerInventoryHydration({
      current: cache.state,
      ownerUserId,
      source: "local"
    })
  }).finally(() => {
    cache.loadPromise = null
    notify(ownerUserId)
  })
  cache.loadPromise = load
  return load
}

async function persistInventory(
  ownerUserId: string,
  snapshot: BlumiInventorySnapshot
): Promise<void> {
  await AsyncStorage.setItem(
    inventoryStorageKey(ownerUserId),
    serializeInventorySnapshot(snapshot)
  ).catch(() => undefined)
}

function replaceInventoryState(
  ownerUserId: string,
  snapshot: BlumiInventorySnapshot,
  source: "local" | "server",
  forceServerSnapshot = false
): boolean {
  const normalized = normalizeStoredInventory(snapshot)
  if (!normalized) return false
  const cache = getOwnerCache(ownerUserId)
  if (
    source === "server" &&
    !forceServerSnapshot &&
    !shouldApplyServerInventorySnapshot(
      cache.state.inventory,
      normalized,
      cache.state.serverStatus === "ready"
    )
  ) return false
  cache.state = replaceOwnerInventory({
    current: cache.state,
    ownerUserId,
    source,
    inventory: normalized
  })
  notify(ownerUserId)
  void persistInventory(ownerUserId, cache.state.inventory)
  return true
}

async function enqueueServerInventoryMutation<Result>(
  ownerUserId: string,
  mutation: () => Promise<Result>
): Promise<Result> {
  const cache = getOwnerCache(ownerUserId)
  cache.serverMutationGeneration += 1
  const previous = cache.serverMutationTail
  const operation = previous.catch(() => undefined).then(mutation)
  cache.serverMutationTail = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}

function updateLocalInventory(
  ownerUserId: string,
  createNext: (current: BlumiInventorySnapshot) => BlumiInventorySnapshot
): void {
  const cache = getOwnerCache(ownerUserId)
  const next = createNext(copyInventorySnapshot(cache.state.inventory))
  replaceInventoryState(ownerUserId, next, "local")
}

export function ownsAvatarInventoryItem(
  inventory: BlumiInventorySnapshot,
  itemId: string
): boolean {
  return inventory.ownedAvatarItemIds.includes(itemId)
}

export function ownsRoomInventoryItem(
  inventory: BlumiInventorySnapshot,
  itemId: string
): boolean {
  return inventory.ownedRoomItemIds.includes(itemId)
}

export function useInventoryStore(
  ownerUserId?: string,
  requireServerHydration = false
): InventoryStoreView {
  const ownerId = normalizeOwnerId(ownerUserId)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const listeners = ownerListeners.get(ownerId) ?? new Set<Listener>()
    const listener = () => setTick((current) => current + 1)
    listeners.add(listener)
    ownerListeners.set(ownerId, listeners)
    void loadInventorySnapshot(ownerId)
    setTick((current) => current + 1)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) ownerListeners.delete(ownerId)
    }
  }, [ownerId])

  const cache = getOwnerCache(ownerId)
  const isReady = isOwnerInventoryReady(cache.state, ownerId, requireServerHydration)
  const visibleInventory = isReady
    ? copyInventorySnapshot(cache.state.inventory)
    : createDefaultInventorySnapshot()

  const ownsAvatarItem = useCallback((itemId: string) =>
    ownsAvatarInventoryItem(
      isOwnerInventoryReady(getOwnerCache(ownerId).state, ownerId, requireServerHydration)
        ? getOwnerCache(ownerId).state.inventory
        : createDefaultInventorySnapshot(),
      itemId
    ), [ownerId, requireServerHydration])

  const ownsRoomItem = useCallback((itemId: string) =>
    ownsRoomInventoryItem(
      isOwnerInventoryReady(getOwnerCache(ownerId).state, ownerId, requireServerHydration)
        ? getOwnerCache(ownerId).state.inventory
        : createDefaultInventorySnapshot(),
      itemId
    ), [ownerId, requireServerHydration])

  const unlockItem = useCallback((
    itemId: string,
    priceCoins: number,
    ownedKey: "ownedAvatarItemIds" | "ownedRoomItemIds"
  ): InventoryUnlockResult => {
    const validIds = ownedKey === "ownedAvatarItemIds"
      ? VALID_AVATAR_ITEM_IDS
      : VALID_ROOM_ITEM_IDS
    if (!validIds.has(itemId)) return { success: false, reason: "invalid_item" }
    let result: InventoryUnlockResult = { success: false }
    updateLocalInventory(ownerId, (current) => {
      const unlock = applyInventoryUnlock({ current, itemId, priceCoins, ownedKey })
      result = unlock.result
      return unlock.nextInventory
    })
    return result
  }, [ownerId])

  const hydrateFromServer = useCallback(async (
    sessionToken: string
  ): Promise<InventoryUnlockResult> => {
    const ownerCache = getOwnerCache(ownerId)
    const hydrationGeneration = ownerCache.serverHydrationGeneration + 1
    ownerCache.serverHydrationGeneration = hydrationGeneration
    const startedMutationGeneration = ownerCache.serverMutationGeneration
    if (ownerCache.state.serverStatus !== "ready") {
      ownerCache.state = { ...ownerCache.state, serverStatus: "loading" }
    }
    notify(ownerId)
    try {
      const inventory = await fetchEconomyInventory(MOBILE_HTTP_BASE_URL, sessionToken)
      if (!shouldApplyInventoryHydrationResponse({
        currentHydrationGeneration: ownerCache.serverHydrationGeneration,
        responseHydrationGeneration: hydrationGeneration,
        currentMutationGeneration: ownerCache.serverMutationGeneration,
        startedMutationGeneration
      })) return { success: true }
      replaceInventoryState(ownerId, inventory, "server")
      return { success: true }
    } catch {
      if (ownerCache.state.serverStatus !== "ready") {
        ownerCache.state = failOwnerInventoryHydration({
          current: ownerCache.state,
          ownerUserId: ownerId,
          source: "server"
        })
      }
      notify(ownerId)
      return { success: false, reason: "server_error" }
    }
  }, [ownerId])

  const claimDailyRewardFromServer = useCallback(async (
    sessionToken: string
  ): Promise<number | null> => {
    try {
      return await enqueueServerInventoryMutation(ownerId, async () => {
        const result = await claimDailyEconomyReward(MOBILE_HTTP_BASE_URL, sessionToken)
        replaceInventoryState(ownerId, result.inventory, "server", true)
        return result.claimed ? result.rewardCoins : 0
      })
    } catch {
      return null
    }
  }, [ownerId])

  const purchaseItem = useCallback(async (
    sessionToken: string,
    itemId: string,
    type: EconomyPurchaseType
  ): Promise<InventoryUnlockResult> => {
    const validIds = type === "avatar" ? VALID_AVATAR_ITEM_IDS : VALID_ROOM_ITEM_IDS
    if (!validIds.has(itemId)) return { success: false, reason: "invalid_item" }
    try {
      return await enqueueServerInventoryMutation(ownerId, async () => {
        const inventory = await purchaseEconomyItem(
          MOBILE_HTTP_BASE_URL,
          sessionToken,
          { type, itemId }
        )
        replaceInventoryState(ownerId, inventory, "server", true)
        return { success: true }
      })
    } catch (error) {
      return { success: false, reason: mapServerPurchaseError(error) }
    }
  }, [ownerId])

  const unlockFeature = useCallback((featureId: string): void => {
    updateLocalInventory(ownerId, (current) =>
      current.unlockedFeatureIds.includes(featureId)
        ? current
        : {
            ...current,
            unlockedFeatureIds: uniqueStrings([...current.unlockedFeatureIds, featureId]),
            updatedAt: new Date().toISOString()
          }
    )
  }, [ownerId])

  return useMemo(() => ({
    inventory: visibleInventory,
    isReady,
    hydrationStatus: requireServerHydration
      ? cache.state.serverStatus
      : cache.state.localStatus,
    ownsAvatarItem,
    ownsRoomItem,
    unlockAvatarItem: (itemId: string, priceCoins: number) =>
      unlockItem(itemId, priceCoins, "ownedAvatarItemIds"),
    unlockRoomItem: (itemId: string, priceCoins: number) =>
      unlockItem(itemId, priceCoins, "ownedRoomItemIds"),
    hydrateFromServer,
    claimDailyRewardFromServer,
    purchaseAvatarItem: (sessionToken: string, itemId: string) =>
      purchaseItem(sessionToken, itemId, "avatar"),
    purchaseRoomItem: (sessionToken: string, itemId: string) =>
      purchaseItem(sessionToken, itemId, "room"),
    unlockFeature
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }), [
    tick,
    ownerId,
    requireServerHydration,
    isReady,
    cache.state.localStatus,
    cache.state.serverStatus,
    ownsAvatarItem,
    ownsRoomItem,
    unlockItem,
    hydrateFromServer,
    claimDailyRewardFromServer,
    purchaseItem,
    unlockFeature
  ])
}

function mapServerPurchaseError(error: unknown): InventoryUnlockResult["reason"] {
  const message = error instanceof Error ? error.message.toLowerCase() : ""
  if (message.includes("already own")) return "already_owned"
  if (message.includes("not enough")) return "not_enough_coins"
  if (message.includes("not available") || message.includes("valid shop")) {
    return "invalid_item"
  }
  return "server_error"
}
