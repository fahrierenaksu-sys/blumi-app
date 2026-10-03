import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { loadAccountScopedStorage } from "../../persistence/accountScopedStorage"
import { DEFAULT_ROOM_V2_SHELL_ID } from "../roomV2Catalog"
import { useInventoryStore } from "../../inventory/inventoryStore"
import type {
  PlacedRoomItem,
  UserRoomDecor
} from "../roomV2.types"
import {
  LEGACY_ROOM_V2_DECOR_STORAGE_KEY,
  readStoredRoomV2Decor,
  type RoomV2StorageNamespace
} from "../roomV2Persistence"
import { canEditRoomV2Decor } from "../roomV2EditGate"
import { isRoomV2ExistingDecorOnlyEdit } from "../roomV2ExistingDecorEditGate"
import { selectRoomV2Shell } from "../roomV2DecorActions"
import { resolveRoomV2ProviderRuntimeConfig } from "../roomV2ProviderRuntime"
import {
  fetchPersonalRoomDecor,
  savePersonalRoomDecor
} from "../personalRoomDecorApi"
import {
  readPersonalRoomSyncMetadata,
  resolvePersonalRoomHydration
} from "../personalRoomDecorSyncModel"
import { getRoomV2PersistenceErrorMessageForDisplay } from "../roomV2PersistenceErrorCopy"
import type { ConfirmedRoomV2SaveResult } from "../roomV2EditorConfirmedSave"
import {
  getGlobalStatus,
  subscribeToStatus
} from "../../realtime/globalRealtimeProvider"
import { createReconnectTransitionTracker } from "../../realtime/reconnectTransitionTracker"

function hasConflictedRoomSyncMetadata(raw: string | null): boolean {
  if (!raw) return false
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === "object" && value !== null &&
      (value as { requiresExplicitSave?: unknown }).requiresExplicitSave === true
  } catch {
    return false
  }
}

interface RoomV2ContextValue {
  userRoomDecor: UserRoomDecor
  /** Server-confirmed snapshot only; never populated from a local cache. */
  confirmedPersistedRoomDecor?: UserRoomDecor
  persistenceState: "loading" | "ready" | "failed"
  persistenceErrorMessage?: string
  retryPersistence: () => void
  setUserRoomDecor: (nextDecor: UserRoomDecor) => boolean
  saveUserRoomDecorConfirmed: (
    nextDecor: UserRoomDecor
  ) => Promise<ConfirmedRoomV2SaveResult>
  selectRoomShell: (roomShellId: string) => void
  resetRoomDecor: () => void
  addPlacedItem: (item: PlacedRoomItem) => void
  updatePlacedItem: (
    instanceId: string,
    patch: Partial<PlacedRoomItem>
  ) => void
  removePlacedItem: (instanceId: string) => void
}

const RoomV2Context = createContext<RoomV2ContextValue | null>(null)

interface RoomV2ProviderProps {
  children: ReactNode
  storageScopeId?: string
  requireServerInventory?: boolean
  storageNamespace?: RoomV2StorageNamespace
  qaOnlyOwnedRoomItemIds?: readonly string[]
  isQaRuntimeAuthorized?: boolean
  isVNextRuntimeProof?: boolean
  allowStarterOnboardingEdits?: boolean
  excludedRoomItemIds?: readonly string[]
  baseHttpUrl?: string
  serverSessionToken?: string
}

export function RoomV2Provider({
  children,
  storageScopeId,
  requireServerInventory = false,
  storageNamespace = "production",
  qaOnlyOwnedRoomItemIds,
  isQaRuntimeAuthorized = false,
  isVNextRuntimeProof = false,
  allowStarterOnboardingEdits = false,
  excludedRoomItemIds,
  baseHttpUrl,
  serverSessionToken
}: RoomV2ProviderProps) {
  const inventoryStore = useInventoryStore(
    storageScopeId,
    requireServerInventory
  )
  const [userRoomDecor, setUserRoomDecorState] = useState<UserRoomDecor>(
    createDefaultRoomV2Decor
  )
  const roomDecorIntentRef = useRef<{
    storageKey: string | null | undefined
    decor: UserRoomDecor
    editVersion: number
  }>({
    storageKey: undefined,
    decor: createDefaultRoomV2Decor(),
    editVersion: 0
  })
  const [confirmedPersistedRoomDecor, setConfirmedPersistedRoomDecor] = useState<
    UserRoomDecor | undefined
  >()
  const [persistenceState, setPersistenceState] = useState<
    "loading" | "ready" | "failed"
  >("loading")
  const [persistenceErrorMessage, setPersistenceErrorMessage] = useState<
    string | undefined
  >()
  const [persistenceRetryVersion, setPersistenceRetryVersion] = useState(0)
  const hasHydratedRef = useRef(false)
  const serverHydrationReadyRef = useRef(false)
  const serverRevisionRef = useRef(0)
  const lastSyncedDecorJsonRef = useRef("")
  const pendingServerDecorRef = useRef<{
    decor: UserRoomDecor
    decorJson: string
    isSavedOnDevice: boolean
    editVersion: number
  } | null>(null)
  const serverSaveLoopRunningRef = useRef(false)
  const serverSaveDrainRef = useRef<Promise<void> | null>(null)
  const finishServerSaveRef = useRef<(() => void) | null>(null)
  const cacheWriteDrainRef = useRef<Promise<void>>(Promise.resolve())
  const hydrationGenerationRef = useRef(0)
  const hydrationStorageKeyRef = useRef<string | null | undefined>(undefined)
  const sameOwnerHydrationRef = useRef(false)
  const retainedDraftRef = useRef<{ storageKey: string; decor: UserRoomDecor } | null>(null)
  const conflictedDraftRef = useRef<{ storageKey: string; decor: UserRoomDecor } | null>(null)
  const obsoleteSaveSnapshotRef = useRef<{
    storageKey: string
    revision: number
    decorJson: string
  } | null>(null)
  const providerMountedRef = useRef(true)
  // Content key: the inventory snapshot is also replaced for unrelated changes.
  const ownedRoomItemIdKey = JSON.stringify(inventoryStore.inventory.ownedRoomItemIds)
  const qaOwnedRoomItemIdKey = JSON.stringify(qaOnlyOwnedRoomItemIds ?? [])
  const excludedRoomItemIdKey = JSON.stringify(excludedRoomItemIds ?? [])
  const runtimeConfig = useMemo(
    () => resolveRoomV2ProviderRuntimeConfig({
      storageScopeId,
      storageNamespace,
      isDevelopmentRuntime: typeof __DEV__ === "boolean" && __DEV__,
      isQaRuntimeAuthorized,
      isVNextRuntimeProof,
      allowStarterOnboardingEdits,
      excludedRoomItemIds: JSON.parse(excludedRoomItemIdKey) as string[],
      inventoryIsReady: inventoryStore.isReady,
      inventoryOwnedItemIds: JSON.parse(ownedRoomItemIdKey) as string[],
      qaOnlyOwnedRoomItemIds: JSON.parse(qaOwnedRoomItemIdKey) as string[]
    }),
    [
      ownedRoomItemIdKey,
      inventoryStore.isReady,
      qaOwnedRoomItemIdKey,
      isQaRuntimeAuthorized,
      isVNextRuntimeProof,
      allowStarterOnboardingEdits,
      excludedRoomItemIdKey,
      storageNamespace,
      storageScopeId
    ]
  )
  const storageKey = runtimeConfig.storageKey
  const syncMetadataKey = storageKey ? `${storageKey}:server-sync` : undefined
  const migrationMarkerKey = runtimeConfig.migrationMarkerKey
  const effectiveOwnedRoomItemIds = runtimeConfig.ownedRoomItemIds
  const inventoryReadyForRoomEdits = runtimeConfig.inventoryReadyForRoomEdits
  const ownershipSanitizedRoomDecor = useMemo(
    () => sanitizeRoomV2DecorForOwnership(userRoomDecor, effectiveOwnedRoomItemIds),
    [userRoomDecor, effectiveOwnedRoomItemIds]
  )

  const publishRoomDecor = useCallback((
    nextDecor: UserRoomDecor,
    source: "local" | "authoritative" = "authoritative"
  ): UserRoomDecor => {
    const previous = roomDecorIntentRef.current
    const sameScope = previous.storageKey === storageKey
    if (sameScope && source === "local" &&
      JSON.stringify(previous.decor) === JSON.stringify(nextDecor)) return previous.decor
    const decor = copyRoomV2Decor(nextDecor)
    roomDecorIntentRef.current = {
      storageKey,
      decor,
      editVersion: (sameScope ? previous.editVersion : 0) +
        (source === "local" ? 1 : 0)
    }
    if (source === "local" && conflictedDraftRef.current?.storageKey === storageKey) {
      conflictedDraftRef.current = { storageKey: storageKey!, decor: copyRoomV2Decor(decor) }
    }
    setUserRoomDecorState(decor)
    return decor
  }, [storageKey])

  const updateRoomDecor = useCallback((
    update: (current: UserRoomDecor) => UserRoomDecor
  ): UserRoomDecor => {
    const current = roomDecorIntentRef.current.storageKey === storageKey
      ? roomDecorIntentRef.current.decor
      : createDefaultRoomV2Decor()
    const next = update(current)
    return next === current ? current : publishRoomDecor(next, "local")
  }, [publishRoomDecor, storageKey])

  const queueCacheWrite = useCallback((write: () => Promise<void>): Promise<void> => {
    const result = cacheWriteDrainRef.current.then(write)
    cacheWriteDrainRef.current = result.then(() => undefined, () => undefined)
    return result
  }, [])

  const writeConflictedDraftCache = useCallback((input: {
    key: string
    metadataKey: string
    revision: number
    canonicalDecorJson: string
    draft: UserRoomDecor
  }): Promise<void> => queueCacheWrite(() => {
    const currentIntent = roomDecorIntentRef.current
    const latestDecor = currentIntent.storageKey === input.key
      ? currentIntent.decor
      : input.draft
    return AsyncStorage.multiSet([
      [input.key, JSON.stringify(latestDecor)],
      [input.metadataKey, JSON.stringify({
        revision: input.revision,
        decorJson: input.canonicalDecorJson,
        requiresExplicitSave: true
      })]
    ])
  }), [queueCacheWrite])

  useEffect(() => {
    providerMountedRef.current = true
    return () => {
      providerMountedRef.current = false
    }
  }, [])

  // Hydration samples the draft only when credentials or storage identity change.
  const readUserRoomDecor = useEffectEvent(() => userRoomDecor)
  useEffect(() => {
    const sampledUserRoomDecor = readUserRoomDecor()
    let mounted = true
    const generation = ++hydrationGenerationRef.current
    const sameOwner = hydrationStorageKeyRef.current === storageKey
    if (!sameOwner) conflictedDraftRef.current = null
    const hydrationStartRevision = sameOwner ? serverRevisionRef.current : 0
    sameOwnerHydrationRef.current = sameOwner && Boolean(storageKey)
    const currentRoomDecor = roomDecorIntentRef.current.storageKey === storageKey
      ? roomDecorIntentRef.current.decor
      : sampledUserRoomDecor
    const pendingLocalDraft = sameOwner
      ? conflictedDraftRef.current?.storageKey === storageKey
        ? conflictedDraftRef.current.decor
        : hasHydratedRef.current &&
        JSON.stringify(currentRoomDecor) !== lastSyncedDecorJsonRef.current
        ? copyRoomV2Decor(currentRoomDecor)
        : retainedDraftRef.current?.storageKey === storageKey
          ? retainedDraftRef.current.decor
          : null
      : null
    retainedDraftRef.current = pendingLocalDraft && storageKey
      ? { storageKey, decor: pendingLocalDraft }
      : null
    hydrationStorageKeyRef.current = storageKey
    const abortController = new AbortController()
    hasHydratedRef.current = false
    serverHydrationReadyRef.current = false
    serverRevisionRef.current = 0
    lastSyncedDecorJsonRef.current = ""
    pendingServerDecorRef.current = null
    if (!sameOwner) {
      setConfirmedPersistedRoomDecor(undefined)
      setPersistenceState("loading")
      setPersistenceErrorMessage(undefined)
      publishRoomDecor(createDefaultRoomV2Decor())
    }

    if (!storageKey) {
      sameOwnerHydrationRef.current = false
      hasHydratedRef.current = true
      setPersistenceState("ready")
      return () => {
        mounted = false
        abortController.abort()
      }
    }

    void (async () => {
      // A PUT may have reached the server under the previous token. Read only
      // after its response and any already-started cache write have settled.
      await Promise.all([
        serverSaveDrainRef.current,
        cacheWriteDrainRef.current
      ])
      if (!mounted || generation !== hydrationGenerationRef.current) return
      const serverSnapshotPromise = serverSessionToken && baseHttpUrl
        ? fetchPersonalRoomDecor(
            baseHttpUrl,
            serverSessionToken,
            fetch,
            abortController.signal
          ).then(
            (snapshot) => ({ status: "ready" as const, snapshot }),
            (error: unknown) => ({ status: "failed" as const, error })
          )
        : Promise.resolve({ status: "skipped" as const })
      const [localResult, rawSyncMetadata, serverSnapshotResult] = await Promise.all([
        loadAccountScopedStorage({
          storage: AsyncStorage,
          entries: [{
            scopedKey: storageKey,
            legacyKey: storageNamespace === "production"
              ? LEGACY_ROOM_V2_DECOR_STORAGE_KEY
              : storageKey
          }],
          migrationMarkerKey: migrationMarkerKey!
        }),
        syncMetadataKey
          ? AsyncStorage.getItem(syncMetadataKey).catch(() => null)
          : Promise.resolve(null),
        serverSnapshotPromise
      ])
      if (!mounted || generation !== hydrationGenerationRef.current) return

      const stored = localResult.status === "ready"
        ? readStoredRoomV2Decor(localResult.rawValues[0] ?? null)
        : { status: "invalid" as const }
      const localDecor = stored.status === "ready" ? stored.decor : null
      const localReadFailed =
        localResult.status === "error" || stored.status === "invalid"
      const storedConflict = hasConflictedRoomSyncMetadata(rawSyncMetadata)

      if (!serverSessionToken || !baseHttpUrl) {
        const latestPendingDraft = retainedDraftRef.current?.storageKey === storageKey
          ? retainedDraftRef.current.decor
          : pendingLocalDraft
        publishRoomDecor(
          latestPendingDraft ?? (sameOwner ? sampledUserRoomDecor : localDecor) ?? createDefaultRoomV2Decor()
        )
        retainedDraftRef.current = null
        sameOwnerHydrationRef.current = false
        hasHydratedRef.current = true
        if (localReadFailed) {
          setPersistenceState("failed")
          setPersistenceErrorMessage(
            "Your saved room could not be opened. A fresh local layout is ready."
          )
        } else {
          setPersistenceState("ready")
          setPersistenceErrorMessage(undefined)
        }
        return
      }

      try {
        if (serverSnapshotResult.status === "failed") throw serverSnapshotResult.error
        if (serverSnapshotResult.status !== "ready") {
          throw new Error("Room hydration started without an authenticated server read.")
        }
        const serverSnapshot = serverSnapshotResult.snapshot
        if (!mounted || generation !== hydrationGenerationRef.current) return
        const resolution = resolvePersonalRoomHydration({
          localDecor,
          serverSnapshot,
          syncMetadata: readPersonalRoomSyncMetadata(rawSyncMetadata)
        })
        const latestPendingDraft = retainedDraftRef.current?.storageKey === storageKey
          ? retainedDraftRef.current.decor
          : pendingLocalDraft ?? (storedConflict ? localDecor : null)
        const obsoleteSave = obsoleteSaveSnapshotRef.current
        const hasExplicitConflict =
          conflictedDraftRef.current?.storageKey === storageKey || storedConflict
        const canReplayPendingDraft = Boolean(
          latestPendingDraft && !hasExplicitConflict && (
            (serverSnapshot?.revision ?? 0) === hydrationStartRevision ||
            (obsoleteSave?.storageKey === storageKey &&
              serverSnapshot?.revision === obsoleteSave.revision &&
              JSON.stringify(serverSnapshot.decor) === obsoleteSave.decorJson)
          )
        )
        const preserveConflictedDraft = Boolean(
          latestPendingDraft &&
          JSON.stringify(latestPendingDraft) !== JSON.stringify(serverSnapshot?.decor ?? null) &&
          (hasExplicitConflict || (sameOwner && !canReplayPendingDraft))
        )
        if (obsoleteSave?.storageKey === storageKey) obsoleteSaveSnapshotRef.current = null
        const resolvedDecor = canReplayPendingDraft || preserveConflictedDraft
          ? copyRoomV2Decor(latestPendingDraft!)
          : resolution.decor ?? createDefaultRoomV2Decor()
        if (preserveConflictedDraft) {
          conflictedDraftRef.current = { storageKey, decor: copyRoomV2Decor(resolvedDecor) }
        }
        retainedDraftRef.current = null
        sameOwnerHydrationRef.current = false
        serverRevisionRef.current = resolution.revision
        lastSyncedDecorJsonRef.current = resolution.lastSyncedDecorJson
        serverHydrationReadyRef.current = true
        hasHydratedRef.current = true
        publishRoomDecor(resolvedDecor)
        setConfirmedPersistedRoomDecor(
          serverSnapshot ? copyRoomV2Decor(serverSnapshot.decor) : undefined
        )

        let localCacheWriteFailed = false
        if ((!resolution.needsServerSave || canReplayPendingDraft || preserveConflictedDraft) && syncMetadataKey) {
          try {
            await queueCacheWrite(() => AsyncStorage.multiSet([
              [storageKey, JSON.stringify(resolvedDecor)],
              [syncMetadataKey, JSON.stringify({
                revision: resolution.revision,
                decorJson: resolution.lastSyncedDecorJson,
                ...(preserveConflictedDraft ? { requiresExplicitSave: true } : {})
              })]
            ]))
          } catch {
            localCacheWriteFailed = true
          }
        }
        if (!mounted || generation !== hydrationGenerationRef.current) return
        if (preserveConflictedDraft || (resolution.conflictRecovered && !canReplayPendingDraft)) {
          setPersistenceState("failed")
          setPersistenceErrorMessage(
            "A newer room from another device was restored. Review it before editing."
          )
        } else if (localReadFailed || localCacheWriteFailed) {
          setPersistenceState("failed")
          setPersistenceErrorMessage(
            "Your server room was restored, but this device could not refresh its local copy."
          )
        } else {
          setPersistenceState("ready")
          setPersistenceErrorMessage(undefined)
        }
      } catch (error) {
        if (!mounted || abortController.signal.aborted ||
          generation !== hydrationGenerationRef.current) return
        const latestPendingDraft = retainedDraftRef.current?.storageKey === storageKey
          ? retainedDraftRef.current.decor
          : pendingLocalDraft
        publishRoomDecor(
          latestPendingDraft ?? (sameOwner ? sampledUserRoomDecor : localDecor) ?? createDefaultRoomV2Decor()
        )
        retainedDraftRef.current = null
        sameOwnerHydrationRef.current = false
        hasHydratedRef.current = true
        setPersistenceState("failed")
        setPersistenceErrorMessage(
          getRoomV2PersistenceErrorMessageForDisplay("load", error, {
            hasLocalRoom: localDecor !== null
          })
        )
      }
    })()

    return () => {
      mounted = false
      sameOwnerHydrationRef.current = false
      hydrationGenerationRef.current += 1
      abortController.abort()
    }
  }, [
    baseHttpUrl,
    migrationMarkerKey,
    publishRoomDecor,
    persistenceRetryVersion,
    queueCacheWrite,
    serverSessionToken,
    storageKey,
    storageNamespace,
    syncMetadataKey
  ])

  useEffect(() => {
    if (!inventoryReadyForRoomEdits) return
    updateRoomDecor((current) =>
      sanitizeRoomV2DecorForOwnership(current, effectiveOwnedRoomItemIds)
    )
  }, [inventoryReadyForRoomEdits, effectiveOwnedRoomItemIds, updateRoomDecor])

  const flushPendingServerDecor = useCallback(async (): Promise<void> => {
    if (
      serverSaveLoopRunningRef.current ||
      !serverSessionToken ||
      !baseHttpUrl ||
      !serverHydrationReadyRef.current
    ) {
      return
    }

    serverSaveLoopRunningRef.current = true
    const generation = hydrationGenerationRef.current
    serverSaveDrainRef.current = new Promise<void>((resolve) => {
      finishServerSaveRef.current = resolve
    })
    try {
      while (
        providerMountedRef.current &&
        serverHydrationReadyRef.current &&
        pendingServerDecorRef.current
      ) {
        const pending = pendingServerDecorRef.current
        pendingServerDecorRef.current = null
        if (pending.decorJson === lastSyncedDecorJsonRef.current) continue

        try {
          const result = await savePersonalRoomDecor(
            baseHttpUrl,
            serverSessionToken,
            {
              expectedRevision: serverRevisionRef.current,
              decor: pending.decor
            }
          )
          if (!providerMountedRef.current) return
          if (generation !== hydrationGenerationRef.current) {
            const obsoleteSnapshot = result.kind === "saved" ? result.snapshot : null
            if (obsoleteSnapshot) {
              obsoleteSaveSnapshotRef.current = {
                storageKey: storageKey!,
                revision: obsoleteSnapshot.revision,
                decorJson: JSON.stringify(obsoleteSnapshot.decor)
              }
            }
            return
          }

          const snapshot = result.kind === "saved"
            ? result.snapshot
            : result.current
          const canonicalDecor = copyRoomV2Decor(snapshot.decor)
          const canonicalDecorJson = JSON.stringify(canonicalDecor)
          if (result.kind === "conflict") {
            conflictedDraftRef.current = {
              storageKey: storageKey!,
              decor: copyRoomV2Decor(roomDecorIntentRef.current.decor)
            }
          }
          serverRevisionRef.current = snapshot.revision
          lastSyncedDecorJsonRef.current = canonicalDecorJson
          setConfirmedPersistedRoomDecor(canonicalDecor)

          let localCacheWriteFailed = false
          if (syncMetadataKey) {
            try {
              await queueCacheWrite(() => AsyncStorage.multiSet([
                [storageKey!, canonicalDecorJson],
                [syncMetadataKey, JSON.stringify({
                  revision: snapshot.revision,
                  decorJson: canonicalDecorJson
                })]
              ]))
            } catch {
              localCacheWriteFailed = true
            }
          }
          if (!providerMountedRef.current || generation !== hydrationGenerationRef.current) return

          if (result.kind === "conflict") {
            pendingServerDecorRef.current = null
            const latestIntent = roomDecorIntentRef.current
            const preserveLatest = latestIntent.storageKey === storageKey &&
              latestIntent.editVersion !== pending.editVersion &&
              JSON.stringify(latestIntent.decor) !== canonicalDecorJson
            if (preserveLatest) {
              conflictedDraftRef.current = { storageKey: storageKey!, decor: copyRoomV2Decor(latestIntent.decor) }
              try {
                await writeConflictedDraftCache({
                  key: storageKey!, metadataKey: syncMetadataKey!,
                  revision: snapshot.revision, canonicalDecorJson,
                  draft: latestIntent.decor
                })
              } catch {
                localCacheWriteFailed = true
              }
              if (!providerMountedRef.current || generation !== hydrationGenerationRef.current) return
            } else {
              conflictedDraftRef.current = null
              publishRoomDecor(canonicalDecor)
            }
            setPersistenceState("failed")
            setPersistenceErrorMessage(
              "A newer room from another device was restored. Review it before editing."
            )
            break
          }
          if (localCacheWriteFailed) {
            setPersistenceState("failed")
            setPersistenceErrorMessage(
              "Your room is saved to Blumi, but this device could not refresh its local copy."
            )
          } else if (!pendingServerDecorRef.current) {
            setPersistenceState("ready")
            setPersistenceErrorMessage(undefined)
          }
        } catch (error) {
          if (!providerMountedRef.current || generation !== hydrationGenerationRef.current) return
          if (!pendingServerDecorRef.current) {
            pendingServerDecorRef.current = pending
          }
          serverHydrationReadyRef.current = false
          setPersistenceState("failed")
          setPersistenceErrorMessage(
            getRoomV2PersistenceErrorMessageForDisplay("sync", error, {
              isSavedOnDevice: pending.isSavedOnDevice
            })
          )
          break
        }
      }
    } finally {
      serverSaveLoopRunningRef.current = false
      finishServerSaveRef.current?.()
      finishServerSaveRef.current = null
      serverSaveDrainRef.current = null
    }
  }, [baseHttpUrl, publishRoomDecor, queueCacheWrite, serverSessionToken, storageKey, syncMetadataKey, writeConflictedDraftCache])

  useEffect(() => {
    if (
      !hasHydratedRef.current ||
      !inventoryReadyForRoomEdits ||
      !storageKey
    ) return
    const sanitizedDecor = ownershipSanitizedRoomDecor
    const decorJson = JSON.stringify(sanitizedDecor)
    const intentAtStart = roomDecorIntentRef.current
    const editVersionAtStart = intentAtStart.storageKey === storageKey
      ? intentAtStart.editVersion
      : 0
    if (
      intentAtStart.storageKey !== storageKey ||
      JSON.stringify(intentAtStart.decor) !== decorJson
    ) return
    let active = true
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    void (async () => {
      let isSavedOnDevice = true
      try {
        await queueCacheWrite(() => AsyncStorage.setItem(storageKey, decorJson))
      } catch {
        isSavedOnDevice = false
        if (active) {
          setPersistenceState("failed")
          setPersistenceErrorMessage(
            "This room is open, but changes could not be saved on this device."
          )
        }
      }

      if (
        !active ||
        !serverSessionToken ||
        !baseHttpUrl ||
        !serverHydrationReadyRef.current ||
        decorJson === lastSyncedDecorJsonRef.current
      ) {
        return
      }

      const latestIntent = roomDecorIntentRef.current
      if (
        latestIntent.storageKey !== storageKey ||
        latestIntent.editVersion !== editVersionAtStart ||
        JSON.stringify(latestIntent.decor) !== decorJson
      ) {
        return
      }
      if (conflictedDraftRef.current?.storageKey === storageKey) return

      pendingServerDecorRef.current = {
        decor: copyRoomV2Decor(sanitizedDecor),
        decorJson,
        isSavedOnDevice,
        editVersion: editVersionAtStart
      }
      timeoutId = setTimeout(() => {
        void flushPendingServerDecor()
      }, 350)
    })()

    return () => {
      active = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [
    baseHttpUrl,
    inventoryReadyForRoomEdits,
    flushPendingServerDecor,
    queueCacheWrite,
    serverSessionToken,
    storageKey,
    syncMetadataKey,
    ownershipSanitizedRoomDecor
  ])

  const retryPersistence = useCallback((): void => {
    setPersistenceRetryVersion((current) => current + 1)
  }, [])

  useEffect(() => {
    if (
      storageNamespace !== "production" ||
      !storageScopeId?.trim() ||
      !serverSessionToken?.trim() ||
      !baseHttpUrl?.trim()
    ) {
      return
    }

    const isReconnect = createReconnectTransitionTracker(getGlobalStatus())
    return subscribeToStatus((status) => {
      if (isReconnect(status)) retryPersistence()
    })
  }, [baseHttpUrl, retryPersistence, serverSessionToken, storageNamespace, storageScopeId])

  const setUserRoomDecor = useCallback((nextDecor: UserRoomDecor): boolean => {
    const isCurrentScopeEditable =
      hydrationStorageKeyRef.current === storageKey &&
      (hasHydratedRef.current || sameOwnerHydrationRef.current)
    if (
      isCurrentScopeEditable &&
      canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)
    ) {
      const sanitizedDecor = sanitizeRoomV2DecorForOwnership(
        nextDecor,
        effectiveOwnedRoomItemIds
      )
      if (!hasHydratedRef.current && storageKey) {
        retainedDraftRef.current = {
          storageKey,
          decor: copyRoomV2Decor(sanitizedDecor)
        }
      }
      publishRoomDecor(sanitizedDecor, "local")
      return true
    }
    if (
      isCurrentScopeEditable &&
      persistenceState !== "loading" &&
      isRoomV2ExistingDecorOnlyEdit(userRoomDecor, nextDecor)
    ) {
      const copiedDecor = copyRoomV2Decor(nextDecor)
      if (!hasHydratedRef.current && storageKey) {
        retainedDraftRef.current = {
          storageKey,
          decor: copyRoomV2Decor(copiedDecor)
        }
      }
      publishRoomDecor(copiedDecor, "local")
      return true
    }
    return false
  }, [
    effectiveOwnedRoomItemIds,
    inventoryReadyForRoomEdits,
    publishRoomDecor,
    persistenceState,
    storageKey,
    userRoomDecor
  ])

  const saveUserRoomDecorConfirmed = useCallback(async (
    nextDecor: UserRoomDecor
  ): Promise<ConfirmedRoomV2SaveResult> => {
    const canAcceptEdit =
      hydrationStorageKeyRef.current === storageKey &&
      hasHydratedRef.current &&
      (canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits) ||
      (
        persistenceState !== "loading" &&
        isRoomV2ExistingDecorOnlyEdit(userRoomDecor, nextDecor)
      ))
    if (
      !canAcceptEdit ||
      !serverSessionToken ||
      !baseHttpUrl ||
      !storageKey ||
      !syncMetadataKey ||
      !serverHydrationReadyRef.current ||
      serverSaveLoopRunningRef.current ||
      pendingServerDecorRef.current
    ) {
      return { status: "failed" }
    }

    const sanitizedDecor = sanitizeRoomV2DecorForOwnership(
      nextDecor,
      effectiveOwnedRoomItemIds
    )
    const intentAtSaveStart = roomDecorIntentRef.current
    const editVersionAtSaveStart = intentAtSaveStart.storageKey === storageKey
      ? intentAtSaveStart.editVersion
      : 0
    const hadConflictedDraft = conflictedDraftRef.current?.storageKey === storageKey
    serverSaveLoopRunningRef.current = true
    const generation = hydrationGenerationRef.current
    serverSaveDrainRef.current = new Promise<void>((resolve) => {
      finishServerSaveRef.current = resolve
    })
    try {
      const result = await savePersonalRoomDecor(
        baseHttpUrl,
        serverSessionToken,
        {
          expectedRevision: serverRevisionRef.current,
          decor: sanitizedDecor
        }
      )
      if (!providerMountedRef.current || generation !== hydrationGenerationRef.current) {
        if (providerMountedRef.current && result.kind === "saved") {
          const obsoleteSnapshot = result.snapshot
          obsoleteSaveSnapshotRef.current = {
            storageKey,
            revision: obsoleteSnapshot.revision,
            decorJson: JSON.stringify(obsoleteSnapshot.decor)
          }
        }
        return { status: "failed" }
      }

      const snapshot = result.kind === "saved"
        ? result.snapshot
        : result.current
      const canonicalDecor = copyRoomV2Decor(snapshot.decor)
      const canonicalDecorJson = JSON.stringify(canonicalDecor)
      serverRevisionRef.current = snapshot.revision
      lastSyncedDecorJsonRef.current = canonicalDecorJson
      setConfirmedPersistedRoomDecor(canonicalDecor)

      const intentAtResponse = roomDecorIntentRef.current
      const hasNewerLocalEdit = intentAtResponse.storageKey === storageKey &&
        intentAtResponse.editVersion !== editVersionAtSaveStart
      if (result.kind === "conflict") {
        pendingServerDecorRef.current = null
        conflictedDraftRef.current = {
          storageKey,
          decor: copyRoomV2Decor(intentAtResponse.storageKey === storageKey
            ? intentAtResponse.decor : canonicalDecor)
        }
        // A retry can conflict again even though no edit happened during this
        // request. In that case the latest local intent is the already-retained
        // conflicted draft; publishing the new canonical snapshot here would
        // replace it before the post-cache-write rebase can preserve it.
        if (!hasNewerLocalEdit && !hadConflictedDraft) publishRoomDecor(canonicalDecor)
      } else if (!hasNewerLocalEdit) {
        // Publish the acknowledged server snapshot before waiting for disk.
        // A token refresh can begin during that wait and must not mistake the
        // prior React state for a newer unsaved draft.
        publishRoomDecor(canonicalDecor)
        const pendingAtCommit = pendingServerDecorRef.current as {
          decor: UserRoomDecor
          decorJson: string
          isSavedOnDevice: boolean
        } | null
        if (pendingAtCommit?.decorJson !== canonicalDecorJson) {
          pendingServerDecorRef.current = null
        }
      }

      let localCacheWriteFailed = false
      try {
        await queueCacheWrite(() => AsyncStorage.multiSet([
          [storageKey, canonicalDecorJson],
          [syncMetadataKey, JSON.stringify({
            revision: snapshot.revision,
            decorJson: canonicalDecorJson
          })]
        ]))
      } catch {
        localCacheWriteFailed = true
      }
      if (!providerMountedRef.current || generation !== hydrationGenerationRef.current) return { status: "failed" }

      if (result.kind === "conflict") {
        const latestIntent = roomDecorIntentRef.current
        const preserveLatest = latestIntent.storageKey === storageKey &&
          (hadConflictedDraft || latestIntent.editVersion !== editVersionAtSaveStart) &&
          JSON.stringify(latestIntent.decor) !== canonicalDecorJson
        if (preserveLatest) {
          conflictedDraftRef.current = { storageKey, decor: copyRoomV2Decor(latestIntent.decor) }
          try {
            await writeConflictedDraftCache({
              key: storageKey, metadataKey: syncMetadataKey,
              revision: snapshot.revision, canonicalDecorJson,
              draft: latestIntent.decor
            })
          } catch {
            localCacheWriteFailed = true
          }
          if (!providerMountedRef.current || generation !== hydrationGenerationRef.current) return { status: "failed" }
        } else {
          conflictedDraftRef.current = null
          publishRoomDecor(canonicalDecor)
        }
        setPersistenceState("failed")
        setPersistenceErrorMessage(
          "A newer room from another device was restored. Review it before editing."
        )
        return { status: "conflict" }
      }

      conflictedDraftRef.current = null

      const latestIntent = roomDecorIntentRef.current
      const hasUnsentLatestEdit = latestIntent.storageKey === storageKey &&
        latestIntent.editVersion !== editVersionAtSaveStart &&
        JSON.stringify(latestIntent.decor) !== canonicalDecorJson
      if (hasUnsentLatestEdit) {
        const latestDecor = copyRoomV2Decor(latestIntent.decor)
        const latestDecorJson = JSON.stringify(latestDecor)
        try {
          // The explicit write may have followed an older autosave in the
          // serialized cache queue. Re-assert the newest user intent after it.
          await queueCacheWrite(() => AsyncStorage.setItem(storageKey, latestDecorJson))
        } catch {
          localCacheWriteFailed = true
        }
        if (!providerMountedRef.current || generation !== hydrationGenerationRef.current) return { status: "failed" }

        const currentIntent = roomDecorIntentRef.current
        const currentDecor = currentIntent.storageKey === storageKey
          ? copyRoomV2Decor(currentIntent.decor)
          : latestDecor
        const currentDecorJson = JSON.stringify(currentDecor)
        pendingServerDecorRef.current = currentDecorJson === lastSyncedDecorJsonRef.current
          ? null
          : {
              decor: currentDecor,
              decorJson: currentDecorJson,
              isSavedOnDevice: !localCacheWriteFailed,
              editVersion: currentIntent.editVersion
            }
      }

      if (localCacheWriteFailed) {
        setPersistenceState("failed")
        setPersistenceErrorMessage(
          "Your room is saved to Blumi, but this device could not refresh its local copy."
        )
      } else {
        setPersistenceState("ready")
        setPersistenceErrorMessage(undefined)
      }
      return { status: "saved", decor: canonicalDecor }
    } catch (error) {
      if (providerMountedRef.current && generation === hydrationGenerationRef.current) {
        setPersistenceState("failed")
        setPersistenceErrorMessage(
          getRoomV2PersistenceErrorMessageForDisplay("sync", error, {
            isSavedOnDevice: false
          })
        )
      }
      return { status: "failed" }
    } finally {
      serverSaveLoopRunningRef.current = false
      finishServerSaveRef.current?.()
      finishServerSaveRef.current = null
      serverSaveDrainRef.current = null
      if (
        providerMountedRef.current &&
        generation === hydrationGenerationRef.current &&
        serverHydrationReadyRef.current &&
        pendingServerDecorRef.current
      ) {
        setTimeout(() => { void flushPendingServerDecor() }, 350)
      }
    }
  }, [
    baseHttpUrl,
    effectiveOwnedRoomItemIds,
    flushPendingServerDecor,
    inventoryReadyForRoomEdits,
    publishRoomDecor,
    persistenceState,
    queueCacheWrite,
    serverSessionToken,
    storageKey,
    syncMetadataKey,
    userRoomDecor,
    writeConflictedDraftCache
  ])

  const selectRoomShell = useCallback((roomShellId: string): void => {
    if (
      hydrationStorageKeyRef.current !== storageKey ||
      !hasHydratedRef.current ||
      !canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)
    ) return
    if (!roomShellId.trim()) return
    updateRoomDecor((current) => selectRoomV2Shell(current, roomShellId))
  }, [inventoryReadyForRoomEdits, persistenceState, storageKey, updateRoomDecor])

  const resetRoomDecor = useCallback((): void => {
    if (
      hydrationStorageKeyRef.current !== storageKey ||
      !hasHydratedRef.current ||
      !canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)
    ) return
    publishRoomDecor(sanitizeRoomV2DecorForOwnership(
      createDefaultRoomV2Decor(),
      effectiveOwnedRoomItemIds
    ), "local")
  }, [effectiveOwnedRoomItemIds, inventoryReadyForRoomEdits, persistenceState, publishRoomDecor, storageKey])

  const addPlacedItem = useCallback((item: PlacedRoomItem): void => {
    if (
      hydrationStorageKeyRef.current !== storageKey ||
      !hasHydratedRef.current ||
      !canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)
    ) return
    if (!effectiveOwnedRoomItemIds.includes(item.itemId)) return
    updateRoomDecor((current) =>
      appendRoomV2PlacedItem(
        sanitizeRoomV2DecorForOwnership(current, effectiveOwnedRoomItemIds),
        item
      )
    )
  }, [effectiveOwnedRoomItemIds, inventoryReadyForRoomEdits, persistenceState, storageKey, updateRoomDecor])

  const updatePlacedItem = useCallback(
    (instanceId: string, patch: Partial<PlacedRoomItem>): void => {
      if (
        hydrationStorageKeyRef.current !== storageKey ||
        !hasHydratedRef.current ||
        !canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)
      ) return
      updateRoomDecor((current) =>
        sanitizeRoomV2DecorForOwnership(
          patchRoomV2PlacedItem(current, instanceId, patch),
          effectiveOwnedRoomItemIds
        )
      )
    },
    [effectiveOwnedRoomItemIds, inventoryReadyForRoomEdits, persistenceState, storageKey, updateRoomDecor]
  )

  const removePlacedItem = useCallback((instanceId: string): void => {
    if (
      hydrationStorageKeyRef.current !== storageKey ||
      !hasHydratedRef.current ||
      !canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)
    ) return
    updateRoomDecor((current) =>
      removeRoomV2PlacedItem(current, instanceId)
    )
  }, [inventoryReadyForRoomEdits, persistenceState, storageKey, updateRoomDecor])

  const value = useMemo<RoomV2ContextValue>(
    () => {
      const hasCurrentRoomScope = hydrationStorageKeyRef.current === storageKey
      const visibleRoomDecor = hasCurrentRoomScope
        ? userRoomDecor
        : createDefaultRoomV2Decor()
      return {
        userRoomDecor: inventoryReadyForRoomEdits && hasCurrentRoomScope
          ? ownershipSanitizedRoomDecor
          : visibleRoomDecor,
        confirmedPersistedRoomDecor: hasCurrentRoomScope
          ? confirmedPersistedRoomDecor
          : undefined,
        persistenceState: hasCurrentRoomScope ? persistenceState : "loading",
        persistenceErrorMessage: hasCurrentRoomScope ? persistenceErrorMessage : undefined,
        retryPersistence,
        setUserRoomDecor,
        saveUserRoomDecorConfirmed,
        selectRoomShell,
        resetRoomDecor,
        addPlacedItem,
        updatePlacedItem,
        removePlacedItem
      }
    },
    [storageKey, userRoomDecor, ownershipSanitizedRoomDecor, confirmedPersistedRoomDecor, persistenceState, persistenceErrorMessage, inventoryReadyForRoomEdits, retryPersistence, setUserRoomDecor, saveUserRoomDecorConfirmed, selectRoomShell, resetRoomDecor, addPlacedItem, updatePlacedItem, removePlacedItem]
  )

  return (
    <RoomV2Context.Provider value={value}>
      {children}
    </RoomV2Context.Provider>
  )
}

export function useRoomV2(): RoomV2ContextValue {
  const context = useContext(RoomV2Context)
  if (!context) {
    throw new Error("useRoomV2 must be used within RoomV2Provider")
  }
  return context
}

export function createDefaultRoomV2Decor(): UserRoomDecor {
  return {
    roomShellId: DEFAULT_ROOM_V2_SHELL_ID,
    placedItems: []
  }
}

export function copyRoomV2Decor(decor: UserRoomDecor): UserRoomDecor {
  return {
    ...decor,
    placedItems: Array.isArray(decor.placedItems)
      ? decor.placedItems.map((item) => ({
          ...item,
          ...(item.supportLocalPosition
            ? { supportLocalPosition: { ...item.supportLocalPosition } }
            : {})
        }))
      : []
  }
}

export function sanitizeRoomV2DecorForOwnership(
  decor: UserRoomDecor,
  ownedRoomItemIds: string[]
): UserRoomDecor {
  const ownedItemIds = new Set(ownedRoomItemIds)
  const placedItemIds = new Set<string>()
  const placedItems = Array.isArray(decor.placedItems)
    ? decor.placedItems.filter((item) => {
        if (!ownedItemIds.has(item.itemId) || placedItemIds.has(item.itemId)) return false
        placedItemIds.add(item.itemId)
        return true
      })
    : []
  // An unchanged ownership snapshot must not rebuild the scene or schedule
  // a local edit. Publication still copies accepted external input.
  if (Array.isArray(decor.placedItems) && placedItems.length === decor.placedItems.length) return decor
  return {
    ...decor,
    placedItems: placedItems.map((item) => ({
      ...item,
      ...(item.supportLocalPosition
        ? { supportLocalPosition: { ...item.supportLocalPosition } }
        : {})
    }))
  }
}

export function patchRoomV2PlacedItem(
  decor: UserRoomDecor,
  instanceId: string,
  patch: Partial<PlacedRoomItem>
): UserRoomDecor {
  let didUpdate = false
  const placedItems = decor.placedItems.map((item) => {
    if (item.instanceId !== instanceId) return { ...item }
    didUpdate = true
    return {
      ...item,
      ...patch,
      instanceId: item.instanceId
    }
  })

  if (!didUpdate) {
    return copyRoomV2Decor(decor)
  }

  return {
    ...decor,
    placedItems
  }
}

export function appendRoomV2PlacedItem(
  decor: UserRoomDecor,
  item: PlacedRoomItem
): UserRoomDecor {
  return {
    ...decor,
    placedItems: [
      ...decor.placedItems.map((placedItem) => ({ ...placedItem })),
      { ...item }
    ]
  }
}

export function removeRoomV2PlacedItem(
  decor: UserRoomDecor,
  instanceId: string
): UserRoomDecor {
  return {
    ...decor,
    placedItems: decor.placedItems.filter((item) => item.instanceId !== instanceId)
  }
}
