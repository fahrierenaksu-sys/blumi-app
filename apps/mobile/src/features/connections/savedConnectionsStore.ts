import AsyncStorage from "@react-native-async-storage/async-storage"
import { useCallback, useEffect, useState } from "react"
import { loadAccountScopedStorage } from "../persistence/accountScopedStorage"
import {
  getSavedConnectionsStorageKeys,
  LEGACY_SAVED_CONNECTIONS_STORAGE_KEY,
  LEGACY_SKIPPED_CONNECTIONS_STORAGE_KEY,
  normalizeSavedConnectionsOwnerId
} from "./savedConnectionsPersistence"

export type SavedConnectionStatus =
  | "local-only"
  | "pending"
  | "mutual"
  | "unmatched"

export interface SavedConnection {
  userId: string
  displayName: string
  savedAt: string
  connected?: boolean
  durationSeconds?: number
  status?: SavedConnectionStatus
}

export interface SkippedConnection {
  userId: string
  skippedAt: string
}

interface OwnerCache {
  saved: SavedConnection[] | null
  skipped: SkippedConnection[] | null
  hydratePromise: Promise<void> | null
  hydrationState: "idle" | "loading" | "ready" | "failed"
}

type Listener = () => void

const ownerCaches = new Map<string, OwnerCache>()
const ownerListeners = new Map<string, Set<Listener>>()

function getOwnerCache(ownerUserId: string): OwnerCache {
  const ownerId = normalizeSavedConnectionsOwnerId(ownerUserId)
  const existing = ownerCaches.get(ownerId)
  if (existing) return existing
  const created: OwnerCache = {
    saved: null,
    skipped: null,
    hydratePromise: null,
    hydrationState: "idle"
  }
  ownerCaches.set(ownerId, created)
  return created
}

function notify(ownerUserId: string): void {
  ownerListeners.get(ownerUserId)?.forEach((listener) => listener())
}

async function hydrate(ownerUserId: string): Promise<void> {
  const ownerId = normalizeSavedConnectionsOwnerId(ownerUserId)
  const cache = getOwnerCache(ownerId)
  if (cache.hydrationState === "ready") return
  if (cache.hydratePromise) return cache.hydratePromise

  const keys = getSavedConnectionsStorageKeys(ownerId)
  const hydration = (async () => {
    cache.hydrationState = "loading"
    const result = await loadAccountScopedStorage({
      storage: AsyncStorage,
      entries: [
        {
          scopedKey: keys.saved,
          legacyKey: LEGACY_SAVED_CONNECTIONS_STORAGE_KEY
        },
        {
          scopedKey: keys.skipped,
          legacyKey: LEGACY_SKIPPED_CONNECTIONS_STORAGE_KEY
        }
      ],
      migrationMarkerKey: keys.migrationMarker
    })
    if (result.status === "error") {
      cache.hydrationState = "failed"
      throw new Error("Blumi could not read your saved connections safely.")
    }
    cache.saved = parseSavedConnections(result.rawValues[0] ?? null)
    cache.skipped = parseSkippedConnections(result.rawValues[1] ?? null)
    cache.hydrationState = "ready"
  })()
  cache.hydratePromise = hydration
  try {
    await hydration
  } finally {
    if (cache.hydratePromise === hydration) cache.hydratePromise = null
  }
}

async function persistSaved(ownerUserId: string): Promise<void> {
  const cache = getOwnerCache(ownerUserId)
  if (!cache.saved || cache.hydrationState !== "ready") return
  const keys = getSavedConnectionsStorageKeys(ownerUserId)
  await AsyncStorage.setItem(keys.saved, JSON.stringify(cache.saved)).catch(() => undefined)
}

async function persistSkipped(ownerUserId: string): Promise<void> {
  const cache = getOwnerCache(ownerUserId)
  if (!cache.skipped || cache.hydrationState !== "ready") return
  const keys = getSavedConnectionsStorageKeys(ownerUserId)
  await AsyncStorage.setItem(keys.skipped, JSON.stringify(cache.skipped)).catch(() => undefined)
}

export async function getSavedConnections(
  ownerUserId: string
): Promise<SavedConnection[]> {
  await hydrate(ownerUserId)
  return [...(getOwnerCache(ownerUserId).saved ?? [])]
}

export async function getSkippedConnections(
  ownerUserId: string
): Promise<SkippedConnection[]> {
  await hydrate(ownerUserId)
  return [...(getOwnerCache(ownerUserId).skipped ?? [])]
}

export async function saveConnection(input: {
  ownerUserId: string
  userId: string
  displayName: string
  connected?: boolean
  durationSeconds?: number
  status?: SavedConnectionStatus
}): Promise<void> {
  const ownerId = normalizeSavedConnectionsOwnerId(input.ownerUserId)
  await hydrate(ownerId)
  const cache = getOwnerCache(ownerId)
  const saved = cache.saved ?? []
  cache.saved = [
    {
      userId: input.userId,
      displayName: input.displayName,
      savedAt: new Date().toISOString(),
      connected: input.connected,
      durationSeconds: input.durationSeconds,
      status: input.status ?? "local-only"
    },
    ...saved.filter((entry) => entry.userId !== input.userId)
  ]
  await persistSaved(ownerId)
  notify(ownerId)
}

export async function updateSavedConnectionStatus(input: {
  ownerUserId: string
  userId: string
  status: SavedConnectionStatus
}): Promise<void> {
  const ownerId = normalizeSavedConnectionsOwnerId(input.ownerUserId)
  await hydrate(ownerId)
  const cache = getOwnerCache(ownerId)
  cache.saved = (cache.saved ?? []).map((entry) =>
    entry.userId === input.userId ? { ...entry, status: input.status } : entry
  )
  await persistSaved(ownerId)
  notify(ownerId)
}

export async function recordMutualConnection(input: {
  ownerUserId: string
  currentUserId: string
  participantUserIds: readonly [string, string]
}): Promise<SavedConnection | undefined> {
  const ownerId = normalizeSavedConnectionsOwnerId(input.ownerUserId)
  if (ownerId !== input.currentUserId) {
    throw new Error("Connection owner must match the signed-in user.")
  }
  await hydrate(ownerId)
  const cache = getOwnerCache(ownerId)
  const saved = cache.saved ?? []
  const partnerUserId = input.participantUserIds.find(
    (userId) => userId !== input.currentUserId
  )
  if (!partnerUserId) return undefined

  const existing = saved.find((entry) => entry.userId === partnerUserId)
  const updated: SavedConnection = existing
    ? { ...existing, status: "mutual" }
    : {
        userId: partnerUserId,
        displayName: partnerUserId,
        savedAt: new Date().toISOString(),
        status: "mutual"
      }
  cache.saved = [updated, ...saved.filter((entry) => entry.userId !== partnerUserId)]
  await persistSaved(ownerId)
  notify(ownerId)
  return { ...updated }
}

export async function removeSavedConnection(input: {
  ownerUserId: string
  userId: string
}): Promise<void> {
  const ownerId = normalizeSavedConnectionsOwnerId(input.ownerUserId)
  await hydrate(ownerId)
  const cache = getOwnerCache(ownerId)
  const saved = cache.saved ?? []
  const next = saved.filter((entry) => entry.userId !== input.userId)
  if (next.length === saved.length) return
  cache.saved = next
  await persistSaved(ownerId)
  notify(ownerId)
}

export async function passConnection(input: {
  ownerUserId: string
  userId: string
}): Promise<void> {
  const ownerId = normalizeSavedConnectionsOwnerId(input.ownerUserId)
  await hydrate(ownerId)
  const cache = getOwnerCache(ownerId)
  const skipped = cache.skipped ?? []
  cache.skipped = [
    { userId: input.userId, skippedAt: new Date().toISOString() },
    ...skipped.filter((entry) => entry.userId !== input.userId)
  ]
  cache.saved = (cache.saved ?? []).map((entry) =>
    entry.userId === input.userId
      ? { ...entry, status: "unmatched" }
      : entry
  )
  await Promise.all([persistSaved(ownerId), persistSkipped(ownerId)])
  notify(ownerId)
}

export async function undoPassConnection(input: {
  ownerUserId: string
  userId: string
}): Promise<void> {
  const ownerId = normalizeSavedConnectionsOwnerId(input.ownerUserId)
  await hydrate(ownerId)
  const cache = getOwnerCache(ownerId)
  const skipped = cache.skipped ?? []
  const next = skipped.filter((entry) => entry.userId !== input.userId)
  if (next.length === skipped.length) return
  cache.skipped = next
  await persistSkipped(ownerId)
  notify(ownerId)
}

export async function skipDiscoveryCandidate(input: {
  ownerUserId: string
  userId: string
}): Promise<void> {
  const ownerId = normalizeSavedConnectionsOwnerId(input.ownerUserId)
  await hydrate(ownerId)
  const cache = getOwnerCache(ownerId)
  const skipped = cache.skipped ?? []
  cache.skipped = [
    { userId: input.userId, skippedAt: new Date().toISOString() },
    ...skipped.filter((entry) => entry.userId !== input.userId)
  ]
  await persistSkipped(ownerId)
  notify(ownerId)
}

export interface SavedConnectionsView {
  saved: SavedConnection[]
  skipped: SkippedConnection[]
  isHydrating: boolean
  refresh: () => Promise<void>
}

export function useSavedConnections(ownerUserId: string): SavedConnectionsView {
  const ownerId = normalizeSavedConnectionsOwnerId(ownerUserId)
  const initialCache = getOwnerCache(ownerId)
  const [saved, setSaved] = useState<SavedConnection[]>(() => [
    ...(initialCache.saved ?? [])
  ])
  const [skipped, setSkipped] = useState<SkippedConnection[]>(() => [
    ...(initialCache.skipped ?? [])
  ])
  const [isHydrating, setIsHydrating] = useState(
    initialCache.saved === null || initialCache.skipped === null
  )

  const sync = useCallback((): void => {
    const cache = getOwnerCache(ownerId)
    setSaved([...(cache.saved ?? [])])
    setSkipped([...(cache.skipped ?? [])])
  }, [ownerId])

  const refresh = useCallback(async (): Promise<void> => {
    setIsHydrating(true)
    try {
      await hydrate(ownerId)
      sync()
    } finally {
      setIsHydrating(false)
    }
  }, [ownerId, sync])

  useEffect(() => {
    let active = true
    const listeners = ownerListeners.get(ownerId) ?? new Set<Listener>()
    const listener: Listener = () => {
      if (active) sync()
    }
    listeners.add(listener)
    ownerListeners.set(ownerId, listeners)
    setSaved([])
    setSkipped([])
    setIsHydrating(true)
    void hydrate(ownerId)
      .then(() => {
        if (!active) return
        sync()
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setIsHydrating(false)
      })
    return () => {
      active = false
      listeners.delete(listener)
      if (listeners.size === 0) ownerListeners.delete(ownerId)
    }
  }, [ownerId, sync])

  return { saved, skipped, isHydrating, refresh }
}

function parseSavedConnections(rawValue: string | null): SavedConnection[] {
  const values = parseJsonArray(rawValue)
  return values.filter(isSavedConnection).map((entry) => ({ ...entry }))
}

function parseSkippedConnections(rawValue: string | null): SkippedConnection[] {
  const values = parseJsonArray(rawValue)
  return values.filter(isSkippedConnection).map((entry) => ({ ...entry }))
}

function parseJsonArray(rawValue: string | null): unknown[] {
  if (!rawValue) return []
  try {
    const parsed: unknown = JSON.parse(rawValue)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isSavedConnection(value: unknown): value is SavedConnection {
  if (!value || typeof value !== "object") return false
  const entry = value as Partial<SavedConnection>
  return (
    typeof entry.userId === "string" &&
    typeof entry.displayName === "string" &&
    typeof entry.savedAt === "string"
  )
}

function isSkippedConnection(value: unknown): value is SkippedConnection {
  if (!value || typeof value !== "object") return false
  const entry = value as Partial<SkippedConnection>
  return typeof entry.userId === "string" && typeof entry.skippedAt === "string"
}
