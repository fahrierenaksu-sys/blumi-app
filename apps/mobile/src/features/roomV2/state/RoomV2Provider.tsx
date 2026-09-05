import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { loadAccountScopedStorage } from "../../persistence/accountScopedStorage"
import { DEFAULT_ROOM_V2_SHELL_ID } from "../roomV2.mock"
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
  } | null>(null)
  const serverSaveLoopRunningRef = useRef(false)
  const providerMountedRef = useRef(true)
  const ownedRoomItemIds = inventoryStore.inventory.ownedRoomItemIds
  const ownedRoomItemIdKey = ownedRoomItemIds.join("|")
  const runtimeConfig = useMemo(
    () => resolveRoomV2ProviderRuntimeConfig({
      storageScopeId,
      storageNamespace,
      isDevelopmentRuntime: typeof __DEV__ === "boolean" && __DEV__,
      isQaRuntimeAuthorized,
      isVNextRuntimeProof,
      allowStarterOnboardingEdits,
      excludedRoomItemIds,
      inventoryIsReady: inventoryStore.isReady,
      inventoryOwnedItemIds: ownedRoomItemIds,
      qaOnlyOwnedRoomItemIds
    }),
// eslint-disable-next-line react-hooks/exhaustive-deps -- Preserve intentional lifecycle and external-store invalidation semantics.
    [
      ownedRoomItemIdKey,
      qaOnlyOwnedRoomItemIds,
      isQaRuntimeAuthorized,
      isVNextRuntimeProof,
      allowStarterOnboardingEdits,
      excludedRoomItemIds,
      storageNamespace,
      storageScopeId
    ]
  )
  const storageKey = runtimeConfig.storageKey
  const syncMetadataKey = storageKey ? `${storageKey}:server-sync` : undefined
  const migrationMarkerKey = runtimeConfig.migrationMarkerKey
  const effectiveOwnedRoomItemIds = runtimeConfig.ownedRoomItemIds
  const effectiveOwnedRoomItemIdKey = effectiveOwnedRoomItemIds.join("|")
  const inventoryReadyForRoomEdits = runtimeConfig.inventoryReadyForRoomEdits

  useEffect(() => {
    providerMountedRef.current = true
    return () => {
      providerMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const abortController = new AbortController()
    hasHydratedRef.current = false
    serverHydrationReadyRef.current = false
    serverRevisionRef.current = 0
    lastSyncedDecorJsonRef.current = ""
    pendingServerDecorRef.current = null
    setConfirmedPersistedRoomDecor(undefined)
    setPersistenceState("loading")
    setPersistenceErrorMessage(undefined)
    setUserRoomDecorState(createDefaultRoomV2Decor())

    if (!storageKey) {
      hasHydratedRef.current = true
      setPersistenceState("ready")
      return () => {
        mounted = false
        abortController.abort()
      }
    }

    void (async () => {
      const [localResult, rawSyncMetadata] = await Promise.all([
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
          : Promise.resolve(null)
      ])
      if (!mounted) return

      const stored = localResult.status === "ready"
        ? readStoredRoomV2Decor(localResult.rawValues[0] ?? null)
        : { status: "invalid" as const }
      const localDecor = stored.status === "ready" ? stored.decor : null
      const localReadFailed =
        localResult.status === "error" || stored.status === "invalid"

      if (!serverSessionToken || !baseHttpUrl) {
        setUserRoomDecorState(localDecor ?? createDefaultRoomV2Decor())
        hasHydratedRef.current = true
        if (localReadFailed) {
          setPersistenceState("failed")
          setPersistenceErrorMessage(
            "Your saved room could not be opened. A fresh local layout is ready."
          )
        } else {
          setPersistenceState("ready")
        }
        return
      }

      try {
        const serverSnapshot = await fetchPersonalRoomDecor(
          baseHttpUrl,
          serverSessionToken,
          fetch,
          abortController.signal
        )
        if (!mounted) return
        const resolution = resolvePersonalRoomHydration({
          localDecor,
          serverSnapshot,
          syncMetadata: readPersonalRoomSyncMetadata(rawSyncMetadata)
        })
        const resolvedDecor = resolution.decor ?? createDefaultRoomV2Decor()
        serverRevisionRef.current = resolution.revision
        lastSyncedDecorJsonRef.current = resolution.lastSyncedDecorJson
        serverHydrationReadyRef.current = true
        hasHydratedRef.current = true
        setUserRoomDecorState(resolvedDecor)
        setConfirmedPersistedRoomDecor(
          serverSnapshot ? copyRoomV2Decor(serverSnapshot.decor) : undefined
        )

        let localCacheWriteFailed = false
        if (!resolution.needsServerSave && syncMetadataKey) {
          try {
            await AsyncStorage.multiSet([
              [storageKey, JSON.stringify(resolvedDecor)],
              [syncMetadataKey, JSON.stringify({
                revision: resolution.revision,
                decorJson: resolution.lastSyncedDecorJson
              })]
            ])
          } catch {
            localCacheWriteFailed = true
          }
        }
        if (!mounted) return
        if (resolution.conflictRecovered) {
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
        }
      } catch (error) {
        if (!mounted || abortController.signal.aborted) return
        setUserRoomDecorState(localDecor ?? createDefaultRoomV2Decor())
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
      abortController.abort()
    }
  }, [
    baseHttpUrl,
    migrationMarkerKey,
    persistenceRetryVersion,
    serverSessionToken,
    storageKey,
    storageNamespace,
    syncMetadataKey
  ])

  useEffect(() => {
    if (!inventoryReadyForRoomEdits) return
    setUserRoomDecorState((current) =>
      sanitizeRoomV2DecorForOwnership(current, effectiveOwnedRoomItemIds)
    )
  }, [inventoryReadyForRoomEdits, effectiveOwnedRoomItemIds])

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

          const snapshot = result.kind === "saved"
            ? result.snapshot
            : result.current
          const canonicalDecor = copyRoomV2Decor(snapshot.decor)
          const canonicalDecorJson = JSON.stringify(canonicalDecor)
          serverRevisionRef.current = snapshot.revision
          lastSyncedDecorJsonRef.current = canonicalDecorJson
          setConfirmedPersistedRoomDecor(canonicalDecor)

          let localCacheWriteFailed = false
          if (syncMetadataKey) {
            try {
              await AsyncStorage.multiSet([
                [storageKey!, canonicalDecorJson],
                [syncMetadataKey, JSON.stringify({
                  revision: snapshot.revision,
                  decorJson: canonicalDecorJson
                })]
              ])
            } catch {
              localCacheWriteFailed = true
            }
          }
          if (!providerMountedRef.current) return

          if (result.kind === "conflict") {
            pendingServerDecorRef.current = null
            setUserRoomDecorState(canonicalDecor)
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
    }
  }, [baseHttpUrl, serverSessionToken, storageKey, syncMetadataKey])

  useEffect(() => {
    if (
      !hasHydratedRef.current ||
      !inventoryReadyForRoomEdits ||
      !storageKey
    ) return
    const sanitizedDecor = sanitizeRoomV2DecorForOwnership(
      userRoomDecor,
      effectiveOwnedRoomItemIds
    )
    const decorJson = JSON.stringify(sanitizedDecor)
    let active = true
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    void (async () => {
      let isSavedOnDevice = true
      try {
        await AsyncStorage.setItem(storageKey, decorJson)
      } catch {
        isSavedOnDevice = false
        setPersistenceState("failed")
        setPersistenceErrorMessage(
          "This room is open, but changes could not be saved on this device."
        )
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

      pendingServerDecorRef.current = {
        decor: copyRoomV2Decor(sanitizedDecor),
        decorJson,
        isSavedOnDevice
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
    ownedRoomItemIdKey,
    effectiveOwnedRoomItemIdKey,
    flushPendingServerDecor,
    serverSessionToken,
    storageKey,
    syncMetadataKey,
    userRoomDecor,
    effectiveOwnedRoomItemIds
  ])

  const retryPersistence = useCallback((): void => {
    setPersistenceRetryVersion((current) => current + 1)
  }, [])

  const setUserRoomDecor = useCallback((nextDecor: UserRoomDecor): boolean => {
    if (canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)) {
      setUserRoomDecorState(sanitizeRoomV2DecorForOwnership(
        nextDecor,
        effectiveOwnedRoomItemIds
      ))
      return true
    }
    if (
      persistenceState !== "loading" &&
      isRoomV2ExistingDecorOnlyEdit(userRoomDecor, nextDecor)
    ) {
      setUserRoomDecorState(copyRoomV2Decor(nextDecor))
      return true
    }
    return false
  }, [
    effectiveOwnedRoomItemIds,
    inventoryReadyForRoomEdits,
    persistenceState,
    userRoomDecor
  ])

  const saveUserRoomDecorConfirmed = useCallback(async (
    nextDecor: UserRoomDecor
  ): Promise<ConfirmedRoomV2SaveResult> => {
    const canAcceptEdit =
      canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits) ||
      (
        persistenceState !== "loading" &&
        isRoomV2ExistingDecorOnlyEdit(userRoomDecor, nextDecor)
      )
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
    serverSaveLoopRunningRef.current = true
    try {
      const result = await savePersonalRoomDecor(
        baseHttpUrl,
        serverSessionToken,
        {
          expectedRevision: serverRevisionRef.current,
          decor: sanitizedDecor
        }
      )
      if (!providerMountedRef.current) return { status: "failed" }

      const snapshot = result.kind === "saved"
        ? result.snapshot
        : result.current
      const canonicalDecor = copyRoomV2Decor(snapshot.decor)
      const canonicalDecorJson = JSON.stringify(canonicalDecor)
      serverRevisionRef.current = snapshot.revision
      lastSyncedDecorJsonRef.current = canonicalDecorJson
      setConfirmedPersistedRoomDecor(canonicalDecor)

      let localCacheWriteFailed = false
      try {
        await AsyncStorage.multiSet([
          [storageKey, canonicalDecorJson],
          [syncMetadataKey, JSON.stringify({
            revision: snapshot.revision,
            decorJson: canonicalDecorJson
          })]
        ])
      } catch {
        localCacheWriteFailed = true
      }
      if (!providerMountedRef.current) return { status: "failed" }

      setUserRoomDecorState(canonicalDecor)
      if (result.kind === "conflict") {
        setPersistenceState("failed")
        setPersistenceErrorMessage(
          "A newer room from another device was restored. Review it before editing."
        )
        return { status: "conflict" }
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
      if (providerMountedRef.current) {
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
    }
  }, [
    baseHttpUrl,
    effectiveOwnedRoomItemIds,
    inventoryReadyForRoomEdits,
    persistenceState,
    serverSessionToken,
    storageKey,
    syncMetadataKey,
    userRoomDecor
  ])

  const selectRoomShell = useCallback((roomShellId: string): void => {
    if (!canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)) return
    if (!roomShellId.trim()) return
    setUserRoomDecorState((current) => selectRoomV2Shell(current, roomShellId))
  }, [inventoryReadyForRoomEdits, persistenceState])

  const resetRoomDecor = useCallback((): void => {
    if (!canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)) return
    setUserRoomDecorState(sanitizeRoomV2DecorForOwnership(
      createDefaultRoomV2Decor(),
      effectiveOwnedRoomItemIds
    ))
  }, [effectiveOwnedRoomItemIds, inventoryReadyForRoomEdits, persistenceState])

  const addPlacedItem = useCallback((item: PlacedRoomItem): void => {
    if (!canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)) return
    if (!effectiveOwnedRoomItemIds.includes(item.itemId)) return
    setUserRoomDecorState((current) =>
      appendRoomV2PlacedItem(
        sanitizeRoomV2DecorForOwnership(current, effectiveOwnedRoomItemIds),
        item
      )
    )
  }, [effectiveOwnedRoomItemIds, inventoryReadyForRoomEdits, persistenceState])

  const updatePlacedItem = useCallback(
    (instanceId: string, patch: Partial<PlacedRoomItem>): void => {
      if (!canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)) return
      setUserRoomDecorState((current) =>
        sanitizeRoomV2DecorForOwnership(
          patchRoomV2PlacedItem(current, instanceId, patch),
          effectiveOwnedRoomItemIds
        )
      )
    },
    [effectiveOwnedRoomItemIds, inventoryReadyForRoomEdits, persistenceState]
  )

  const removePlacedItem = useCallback((instanceId: string): void => {
    if (!canEditRoomV2Decor(persistenceState, inventoryReadyForRoomEdits)) return
    setUserRoomDecorState((current) =>
      removeRoomV2PlacedItem(current, instanceId)
    )
  }, [inventoryReadyForRoomEdits, persistenceState])

  const value = useMemo<RoomV2ContextValue>(
    () => ({
      userRoomDecor: inventoryReadyForRoomEdits
        ? sanitizeRoomV2DecorForOwnership(userRoomDecor, effectiveOwnedRoomItemIds)
        : userRoomDecor,
      confirmedPersistedRoomDecor,
      persistenceState,
      persistenceErrorMessage,
      retryPersistence,
      setUserRoomDecor,
      saveUserRoomDecorConfirmed,
      selectRoomShell,
      resetRoomDecor,
      addPlacedItem,
      updatePlacedItem,
      removePlacedItem
    }),
    [userRoomDecor, confirmedPersistedRoomDecor, persistenceState, persistenceErrorMessage, inventoryReadyForRoomEdits, effectiveOwnedRoomItemIds, retryPersistence, setUserRoomDecor, saveUserRoomDecorConfirmed, selectRoomShell, resetRoomDecor, addPlacedItem, updatePlacedItem, removePlacedItem]
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
  return {
    ...decor,
    placedItems: Array.isArray(decor.placedItems)
      ? decor.placedItems
        .filter((item) => {
          if (!ownedItemIds.has(item.itemId) || placedItemIds.has(item.itemId)) {
            return false
          }
          placedItemIds.add(item.itemId)
          return true
        })
        .map((item) => ({
          ...item,
          ...(item.supportLocalPosition
            ? { supportLocalPosition: { ...item.supportLocalPosition } }
            : {})
        }))
      : []
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
