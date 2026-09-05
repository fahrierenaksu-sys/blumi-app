import { useCallback, useEffect, useMemo, useState } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import type { ReportReason } from "@blumi/contracts"
import { MOBILE_HTTP_BASE_URL } from "../../config/env"
import { loadAccountScopedStorage } from "../persistence/accountScopedStorage"
import {
  applyBlockHydrationFailure,
  applyBlockHydrationSuccess,
  createBlockOwnerState,
  isBlockOwnerReady,
  replaceBlockedUsers,
  shouldApplyBlockServerResponse,
  type BlockHydrationSource,
  type BlockOwnerState
} from "./blockScopeModel"
import {
  fetchSafetyBlocks,
  type BlockedProfileSummary
} from "./safetyApi"

const LEGACY_STORAGE_KEY = "@blumi/blocked_users"
const STORAGE_PREFIX = "@blumi/blocked_users:v2"
const MIGRATION_PREFIX = "@blumi/blocked_users:migrated:v2"

interface OwnerCache {
  state: BlockOwnerState
  localHydrationStarted: boolean
  serverRequestGeneration: number
  mutationGeneration: number
  blockedProfilesById: Record<string, BlockedProfileSummary>
}

type Listener = () => void
const ownerCaches = new Map<string, OwnerCache>()
const listeners = new Set<Listener>()

function normalizeOwnerUserId(ownerUserId: string): string {
  return ownerUserId.trim()
}

function getOwnerCache(ownerUserId: string): OwnerCache {
  const normalizedOwner = normalizeOwnerUserId(ownerUserId)
  const existing = ownerCaches.get(normalizedOwner)
  if (existing) return existing
  const created: OwnerCache = {
    state: createBlockOwnerState(normalizedOwner),
    localHydrationStarted: false,
    serverRequestGeneration: 0,
    mutationGeneration: 0,
    blockedProfilesById: {}
  }
  ownerCaches.set(normalizedOwner, created)
  return created
}

function notify(): void {
  for (const listener of listeners) listener()
}

function storageKey(ownerUserId: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(ownerUserId)}`
}

function migrationMarkerKey(ownerUserId: string): string {
  return `${MIGRATION_PREFIX}:${encodeURIComponent(ownerUserId)}`
}

function updateOwnerState(
  ownerUserId: string,
  update: (state: BlockOwnerState) => BlockOwnerState
): void {
  const cache = getOwnerCache(ownerUserId)
  const nextState = update(cache.state)
  if (nextState === cache.state) return
  cache.state = nextState
  notify()
}

function persistBlocked(ownerUserId: string): void {
  const cache = getOwnerCache(ownerUserId)
  void AsyncStorage.setItem(
    storageKey(ownerUserId),
    JSON.stringify(cache.state.blockedUserIds)
  ).catch(() => {
    updateOwnerState(ownerUserId, (state) =>
      applyBlockHydrationFailure(state, ownerUserId, "local")
    )
  })
}

export function blockUser(
  ownerUserId: string,
  blockedUserId: string,
  options: { persist?: boolean } = {}
): void {
  getOwnerCache(ownerUserId).mutationGeneration += 1
  const current = getOwnerCache(ownerUserId).state.blockedUserIds
  updateOwnerState(ownerUserId, (state) =>
    replaceBlockedUsers(state, ownerUserId, [...current, blockedUserId])
  )
  if (options.persist !== false) persistBlocked(ownerUserId)
}

export function unblockUser(
  ownerUserId: string,
  blockedUserId: string,
  options: { persist?: boolean } = {}
): void {
  getOwnerCache(ownerUserId).mutationGeneration += 1
  delete getOwnerCache(ownerUserId).blockedProfilesById[blockedUserId]
  const current = getOwnerCache(ownerUserId).state.blockedUserIds
  updateOwnerState(ownerUserId, (state) =>
    replaceBlockedUsers(
      state,
      ownerUserId,
      current.filter((userId) => userId !== blockedUserId)
    )
  )
  if (options.persist !== false) persistBlocked(ownerUserId)
}

export function applyBlockedUserIds(
  ownerUserId: string,
  userIds: string[],
  options: { persist?: boolean; source?: BlockHydrationSource } = {}
): void {
  const source = options.source ?? "local"
  if (source !== "server") {
    getOwnerCache(ownerUserId).blockedProfilesById = {}
  }
  updateOwnerState(ownerUserId, (state) =>
    applyBlockHydrationSuccess(state, ownerUserId, userIds, source)
  )
  if (options.persist !== false) persistBlocked(ownerUserId)
}

export function isUserBlocked(ownerUserId: string, blockedUserId: string): boolean {
  return getOwnerCache(ownerUserId).state.blockedUserIds.includes(blockedUserId)
}

export async function hydrateBlockedUsersFromServer(
  ownerUserId: string,
  sessionToken: string
): Promise<void> {
  const cache = getOwnerCache(ownerUserId)
  const requestGeneration = cache.serverRequestGeneration + 1
  cache.serverRequestGeneration = requestGeneration
  const startedMutationGeneration = cache.mutationGeneration
  try {
    const blocks = await fetchSafetyBlocks(
      MOBILE_HTTP_BASE_URL,
      sessionToken
    )
    if (blocks.some((block) => block.actorUserId !== ownerUserId)) {
      throw new Error("Blumi could not verify this safety list.")
    }
    if (!shouldApplyBlockServerResponse({
      currentRequestGeneration: cache.serverRequestGeneration,
      responseRequestGeneration: requestGeneration,
      currentMutationGeneration: cache.mutationGeneration,
      startedMutationGeneration
    })) return
    cache.blockedProfilesById = Object.fromEntries(
      blocks.flatMap((block) =>
        block.blockedProfile
          ? [[block.blockedUserId, { ...block.blockedProfile }] as const]
          : []
      )
    )
    applyBlockedUserIds(
      ownerUserId,
      blocks.map((block) => block.blockedUserId),
      { persist: false, source: "server" }
    )
  } catch (error) {
    if (cache.serverRequestGeneration !== requestGeneration) return
    updateOwnerState(ownerUserId, (state) =>
      applyBlockHydrationFailure(state, ownerUserId, "server")
    )
    throw error
  }
}

export interface UserReport {
  targetUserId: string
  reason: ReportReason
  details?: string
  createdAt: string
}

const reportQueues = new Map<string, UserReport[]>()

export function submitReport(
  ownerUserId: string,
  report: Omit<UserReport, "createdAt">
): void {
  const current = reportQueues.get(ownerUserId) ?? []
  reportQueues.set(ownerUserId, [
    ...current,
    { ...report, createdAt: new Date().toISOString() }
  ])
  blockUser(ownerUserId, report.targetUserId)
}

export function getPendingReports(ownerUserId: string): UserReport[] {
  return [...(reportQueues.get(ownerUserId) ?? [])]
}

async function hydrateLocal(ownerUserId: string): Promise<void> {
  const cache = getOwnerCache(ownerUserId)
  if (cache.localHydrationStarted) return
  cache.localHydrationStarted = true

  const result = await loadAccountScopedStorage({
    storage: AsyncStorage,
    entries: [{
      scopedKey: storageKey(ownerUserId),
      legacyKey: LEGACY_STORAGE_KEY
    }],
    migrationMarkerKey: migrationMarkerKey(ownerUserId)
  })
  if (result.status === "error") {
    updateOwnerState(ownerUserId, (state) =>
      applyBlockHydrationFailure(state, ownerUserId, "local")
    )
    return
  }

  try {
    const raw = result.rawValues[0]
    const parsed = raw === null ? [] : JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
      throw new Error("Invalid safety storage")
    }
    applyBlockedUserIds(ownerUserId, parsed, {
      persist: false,
      source: "local"
    })
  } catch {
    updateOwnerState(ownerUserId, (state) =>
      applyBlockHydrationFailure(state, ownerUserId, "local")
    )
  }
}

export interface BlockStoreView {
  blockedUserIds: string[]
  blockedProfilesById: Readonly<Record<string, BlockedProfileSummary>>
  isReady: boolean
  hydrationStatus: "loading" | "ready" | "failed"
  isBlocked: (blockedUserId: string) => boolean
  blockUser: (blockedUserId: string, options?: { persist?: boolean }) => void
  unblockUser: (blockedUserId: string, options?: { persist?: boolean }) => void
}

export function useBlockStore(
  ownerUserId: string | undefined,
  requireServerHydration = false
): BlockStoreView {
  const [, setTick] = useState(0)
  const normalizedOwner = normalizeOwnerUserId(ownerUserId ?? "")
  const cache = getOwnerCache(normalizedOwner)

  const sync = useCallback(() => setTick((tick) => tick + 1), [])
  useEffect(() => {
    listeners.add(sync)
    return () => { listeners.delete(sync) }
  }, [sync])

  useEffect(() => {
    if (!normalizedOwner) return
    void hydrateLocal(normalizedOwner)
  }, [normalizedOwner])

  return useMemo(() => {
    const state = cache.state
    const relevantStatus = requireServerHydration
      ? state.serverStatus
      : state.localStatus
    return {
      blockedUserIds: [...state.blockedUserIds],
      blockedProfilesById: { ...cache.blockedProfilesById },
      isReady: Boolean(normalizedOwner) && isBlockOwnerReady(state, requireServerHydration),
      hydrationStatus: relevantStatus,
      isBlocked: (blockedUserId: string) =>
        isUserBlocked(normalizedOwner, blockedUserId),
      blockUser: (blockedUserId: string, options?: { persist?: boolean }) =>
        blockUser(normalizedOwner, blockedUserId, options),
      unblockUser: (blockedUserId: string, options?: { persist?: boolean }) =>
        unblockUser(normalizedOwner, blockedUserId, options)
    }
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
  }, [
    cache,
    cache.state.blockedUserIds,
    cache.state.localStatus,
    cache.state.serverStatus,
    cache.blockedProfilesById,
    normalizedOwner,
    requireServerHydration
  ])
}
