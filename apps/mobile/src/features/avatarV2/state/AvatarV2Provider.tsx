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
import type {
  AvatarSelection,
  CapabilityMap,
  CompleteAvatarSelection
} from "@blumi/contracts"
import { AVATAR_V2_CATALOG } from "../avatarV2.mock"
import { useInventoryStore } from "../../inventory/inventoryStore"
import {
  canEquipAvatarV2Item,
  equipAvatarV2Item,
  resolveAvatarV2
} from "../avatarV2Selectors"
import {
  createAvatarQaInventory,
  applyDisposableAvatarEquip,
  getAvatarQaPersistencePolicy,
  isAvatarQaUnlockEnabled
} from "../qa/avatarQaInventory"
import type {
  AvatarCatalogItem,
  AvatarInventory,
  UserAvatar
} from "../avatarV2.types"
import type { AvatarSaveOutcome } from "../avatarSaveOutcome"
import { createFailClosedCapabilityResolution } from "../../capabilities/capabilityApi"
import {
  getAvatarV2StorageKey,
  resolveInitialAvatarV2,
  shouldUseLocalAvatarPersistence
} from "../avatarV2Persistence"
import {
  applyOnboardingStarterBody,
  shouldRefreshAvatarForStarterChange
} from "../avatarStarterModel"
import {
  loadoutToUserAvatar,
  normalizeCompleteAvatarSelection
} from "../avatarSelectionModel"
import { runAvatarEquipSave } from "../avatarEquipSave"
import {
  beginAvatarEquipSave,
  createAvatarEquipLifecycle,
  invalidateAvatarEquipSaves,
  markAvatarEquipLifecycleUnmounted,
  markAvatarLocallyCustomized,
  mayCommitAvatarEquipSave
} from "../avatarEquipLifecycle"

export { AVATAR_V2_STORAGE_KEY } from "../avatarV2Persistence"

interface AvatarV2ContextValue {
  avatar: UserAvatar
  catalog: AvatarCatalogItem[]
  inventory: AvatarInventory
  canEquipItem: (item: AvatarCatalogItem) => boolean
  equipItem: (item: AvatarCatalogItem) => boolean
  equipAndSaveItem: (item: AvatarCatalogItem) => Promise<AvatarEquipResult>
  saveAvatar: (avatar: UserAvatar) => Promise<AvatarSaveResult>
  isSaving: boolean
  saveErrorMessage: string | null
  resolvedCapabilities: CapabilityMap
}

export type AvatarEquipResult =
  | { ok: true }
  | {
    ok: false
    reason: "conflict" | "error"
    errorMessage: string
    currentSelection?: CompleteAvatarSelection
  }

export type AvatarSaveResult =
  | { ok: true; selection?: CompleteAvatarSelection }
  | {
    ok: false
    reason: "conflict" | "error"
    errorMessage: string
    currentSelection?: CompleteAvatarSelection
  }

const AVATAR_EQUIP_SAVE_TIMEOUT_MS = 8_000

const AvatarV2Context = createContext<AvatarV2ContextValue | null>(null)

const AVATAR_QA_UNLOCK_ENABLED = isAvatarQaUnlockEnabled(
  __DEV__,
  process.env.EXPO_PUBLIC_BLUMI_QA_UNLOCK_AVATAR_ITEMS
)
const AVATAR_QA_PERSISTENCE_POLICY = getAvatarQaPersistencePolicy(
  AVATAR_QA_UNLOCK_ENABLED
)

interface AvatarV2ProviderProps {
  children: ReactNode
  storageScopeId?: string
  requireServerInventory?: boolean
  initialAvatarSelection?: AvatarSelection
  onboardingStarterBodyId?: string
  onSaveAvatar?: (
    avatar: UserAvatar,
    signal?: AbortSignal
  ) => Promise<AvatarSaveOutcome>
  resolvedCapabilities?: CapabilityMap
}

export function AvatarV2Provider({
  children,
  storageScopeId,
  requireServerInventory = false,
  initialAvatarSelection,
  onboardingStarterBodyId,
  onSaveAvatar,
  resolvedCapabilities = createFailClosedCapabilityResolution().capabilities
}: AvatarV2ProviderProps) {
  const localInventory = useInventoryStore(
    storageScopeId,
    requireServerInventory
  )
  const storageKey = getAvatarV2StorageKey(storageScopeId)
  const initialSelectionRevision = normalizeCompleteAvatarSelection(
    initialAvatarSelection
  )?.revision
  const [avatar, setAvatar] = useState<UserAvatar>(() =>
    resolveInitialSelectionAvatar(initialAvatarSelection, onboardingStarterBodyId)
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null)
  const saveInFlightRef = useRef(false)
  const hasLocalCustomizationRef = useRef(false)
  const avatarEquipLifecycleRef = useRef(createAvatarEquipLifecycle())
  const previousStarterBodyIdRef = useRef(onboardingStarterBodyId)
  const previousSelectionRevisionRef = useRef(initialSelectionRevision)
  const [hasHydratedPersistedAvatar, setHasHydratedPersistedAvatar] = useState(false)
  const hydratedStorageKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const shouldRefresh = shouldRefreshAvatarForStarterChange({
      hasLocalCustomization: hasLocalCustomizationRef.current,
      previousStarterBodyId: previousStarterBodyIdRef.current,
      nextStarterBodyId: onboardingStarterBodyId,
      previousSelectionRevision: previousSelectionRevisionRef.current,
      nextSelectionRevision: initialSelectionRevision
    })
    previousStarterBodyIdRef.current = onboardingStarterBodyId
    previousSelectionRevisionRef.current = initialSelectionRevision
    if (!shouldRefresh) return

    let mounted = true
    avatarEquipLifecycleRef.current = invalidateAvatarEquipSaves(
      avatarEquipLifecycleRef.current
    )
    saveInFlightRef.current = false
    setIsSaving(false)
    setSaveErrorMessage(null)
    hasLocalCustomizationRef.current = false
    const fallbackAvatar = resolveInitialSelectionAvatar(
      initialAvatarSelection,
      onboardingStarterBodyId
    )
    hydratedStorageKeyRef.current = null
    setHasHydratedPersistedAvatar(false)
    setAvatar(fallbackAvatar)

    if (!shouldUseLocalAvatarPersistence(requireServerInventory, storageKey)) {
      setHasHydratedPersistedAvatar(true)
      return () => {
        mounted = false
      }
    }

    AsyncStorage.getItem(storageKey)
      .then((rawValue) => {
        if (!mounted) return
        const storedAvatar = parseStoredAvatarV2(rawValue, AVATAR_V2_CATALOG)
        setAvatar(applyOnboardingStarterBody(
          storedAvatar ?? fallbackAvatar,
          onboardingStarterBodyId,
          AVATAR_V2_CATALOG
        ))
      })
      .catch(() => {
        // Avatar customization remains usable with the built-in default.
      })
      .finally(() => {
        if (mounted) {
          hydratedStorageKeyRef.current = storageKey
          setHasHydratedPersistedAvatar(true)
        }
      })

    return () => {
      mounted = false
    }
  }, [
    initialAvatarSelection,
    initialSelectionRevision,
    onboardingStarterBodyId,
    requireServerInventory,
    storageKey
  ])

  useEffect(() => {
    return () => {
      avatarEquipLifecycleRef.current = markAvatarEquipLifecycleUnmounted(
        avatarEquipLifecycleRef.current
      )
    }
  }, [])

  useEffect(() => {
    if (!hasHydratedPersistedAvatar) return
    if (!shouldUseLocalAvatarPersistence(requireServerInventory, storageKey)) return
    if (hydratedStorageKeyRef.current !== storageKey) return
    // Disposable regression QA must never overwrite the user's saved avatar.
    // The env flag is also guarded by __DEV__ above, so production builds
    // always retain the normal persistence and inventory behavior.
    if (!AVATAR_QA_PERSISTENCE_POLICY.allowLocalPersistence) return
    void AsyncStorage.setItem(
      storageKey,
      JSON.stringify(avatar)
    ).catch(() => {
      // Keep wardrobe interactions responsive if local persistence fails.
    })
  }, [avatar, hasHydratedPersistedAvatar, requireServerInventory, storageKey])

  const avatarInventory = useMemo<AvatarInventory>(
    () => createAvatarQaInventory(
      localInventory.inventory.ownedAvatarItemIds,
      AVATAR_QA_UNLOCK_ENABLED
    ),
    [localInventory.inventory.ownedAvatarItemIds]
  )

  const canEquipItem = useCallback((item: AvatarCatalogItem): boolean => {
    return canEquipAvatarV2Item(avatarInventory, item, avatar.bodyId)
  }, [avatar.bodyId, avatarInventory])

  const equipItem = useCallback(
    (item: AvatarCatalogItem): boolean => {
      if (!canEquipItem(item)) return false
      hasLocalCustomizationRef.current = markAvatarLocallyCustomized()
      setAvatar((current) => equipAvatarV2Item(current, item))
      return true
    },
    [canEquipItem]
  )

  const saveAvatar = useCallback(
    async (nextAvatarInput: UserAvatar): Promise<AvatarSaveResult> => {
      if (saveInFlightRef.current) {
        return {
          ok: false,
          reason: "error",
          errorMessage: "Your previous look is still saving."
        }
      }
      const nextAvatar = resolveAvatarV2(nextAvatarInput)
      if (!AVATAR_QA_PERSISTENCE_POLICY.allowRemotePersistence) {
        hasLocalCustomizationRef.current = markAvatarLocallyCustomized()
        setSaveErrorMessage(null)
        setAvatar(nextAvatar)
        return { ok: true }
      }
      if (!onSaveAvatar) {
        hasLocalCustomizationRef.current = markAvatarLocallyCustomized()
        setAvatar(nextAvatar)
        return { ok: true }
      }
      setIsSaving(true)
      saveInFlightRef.current = true
      const saveStart = beginAvatarEquipSave(avatarEquipLifecycleRef.current)
      avatarEquipLifecycleRef.current = saveStart.lifecycle
      const { requestGeneration } = saveStart
      const saveAbortController = new AbortController()
      const saveTimeout = setTimeout(
        () => saveAbortController.abort(),
        AVATAR_EQUIP_SAVE_TIMEOUT_MS
      )
      setSaveErrorMessage(null)
      try {
        const result = await runAvatarEquipSave({
          nextAvatar,
          save: (avatarToSave) => onSaveAvatar(
            avatarToSave,
            saveAbortController.signal
          )
        })
        if (!mayCommitAvatarEquipSave(
          avatarEquipLifecycleRef.current,
          requestGeneration
        )) {
          if (!result.ok) {
            return { ...result, reason: "error" }
          }
          return result.saved.kind === "updated"
            ? { ok: true, selection: result.saved.selection }
            : {
              ok: false,
              reason: "conflict",
              errorMessage: result.saved.message,
              currentSelection: result.saved.current
            }
        }
        if (!result.ok) {
          setSaveErrorMessage(result.errorMessage)
          return { ...result, reason: "error" }
        }
        if (result.saved.kind === "conflict") {
          const currentAvatar = resolveAvatarV2(
            loadoutToUserAvatar(result.saved.current.loadout)
          )
          setAvatar(currentAvatar)
          setSaveErrorMessage(result.saved.message)
          return {
            ok: false,
            reason: "conflict",
            errorMessage: result.saved.message,
            currentSelection: result.saved.current
          }
        }
        setAvatar(resolveAvatarV2(loadoutToUserAvatar(result.saved.selection.loadout)))
        return { ok: true, selection: result.saved.selection }
      } finally {
        clearTimeout(saveTimeout)
        if (mayCommitAvatarEquipSave(
          avatarEquipLifecycleRef.current,
          requestGeneration
        )) {
          saveInFlightRef.current = false
          setIsSaving(false)
        }
      }
    },
    [onSaveAvatar]
  )

  const equipAndSaveItem = useCallback(
    async (item: AvatarCatalogItem): Promise<AvatarEquipResult> => {
      if (saveInFlightRef.current) {
        return {
          ok: false,
          reason: "error",
          errorMessage: "Your previous look is still saving."
        }
      }
      if (!canEquipItem(item)) {
        return { ok: false, reason: "error", errorMessage: "Unlock this look first" }
      }
      if (!AVATAR_QA_PERSISTENCE_POLICY.allowRemotePersistence) {
        hasLocalCustomizationRef.current = markAvatarLocallyCustomized()
        setSaveErrorMessage(null)
        setAvatar((current) => applyDisposableAvatarEquip(
          current,
          item,
          equipAvatarV2Item
        ))
        return { ok: true }
      }
      const nextAvatar = equipAvatarV2Item(avatar, item)
      if (!onSaveAvatar) {
        hasLocalCustomizationRef.current = markAvatarLocallyCustomized()
        setAvatar(nextAvatar)
        return { ok: true }
      }
      setIsSaving(true)
      saveInFlightRef.current = true
      const saveStart = beginAvatarEquipSave(avatarEquipLifecycleRef.current)
      avatarEquipLifecycleRef.current = saveStart.lifecycle
      const { requestGeneration } = saveStart
      const saveAbortController = new AbortController()
      const saveTimeout = setTimeout(
        () => saveAbortController.abort(),
        AVATAR_EQUIP_SAVE_TIMEOUT_MS
      )
      setSaveErrorMessage(null)
      try {
        const result = await runAvatarEquipSave({
          nextAvatar,
          save: (avatarToSave) => onSaveAvatar(
            avatarToSave,
            saveAbortController.signal
          )
        })
        if (!mayCommitAvatarEquipSave(
          avatarEquipLifecycleRef.current,
          requestGeneration
        )) {
          if (!result.ok) return { ...result, reason: "error" }
          return result.saved.kind === "updated"
            ? { ok: true }
            : {
              ok: false,
              reason: "conflict",
              errorMessage: result.saved.message,
              currentSelection: result.saved.current
            }
        }
        if (!result.ok) {
          setSaveErrorMessage(result.errorMessage)
          return { ...result, reason: "error" }
        }
        if (result.saved.kind === "conflict") {
          setAvatar(resolveAvatarV2(loadoutToUserAvatar(result.saved.current.loadout)))
          setSaveErrorMessage(result.saved.message)
          return {
            ok: false,
            reason: "conflict",
            errorMessage: result.saved.message,
            currentSelection: result.saved.current
          }
        }
        setAvatar(resolveAvatarV2(loadoutToUserAvatar(result.saved.selection.loadout)))
        return { ok: true }
      } finally {
        clearTimeout(saveTimeout)
        if (mayCommitAvatarEquipSave(
          avatarEquipLifecycleRef.current,
          requestGeneration
        )) {
          saveInFlightRef.current = false
          setIsSaving(false)
        }
      }
    },
    [avatar, canEquipItem, onSaveAvatar]
  )

  const value = useMemo<AvatarV2ContextValue>(
    () => ({
      avatar,
      catalog: AVATAR_V2_CATALOG,
      inventory: avatarInventory,
      canEquipItem,
      equipItem,
      equipAndSaveItem,
      saveAvatar,
      isSaving,
      saveErrorMessage,
      resolvedCapabilities
    }),
    [
      avatar,
      avatarInventory,
      canEquipItem,
      equipAndSaveItem,
      equipItem,
      saveAvatar,
      isSaving,
      saveErrorMessage,
      resolvedCapabilities
    ]
  )

  return (
    <AvatarV2Context.Provider value={value}>
      {children}
    </AvatarV2Context.Provider>
  )
}

function resolveInitialSelectionAvatar(
  selection: AvatarSelection | undefined,
  onboardingStarterBodyId: string | undefined
): UserAvatar {
  const complete = normalizeCompleteAvatarSelection(selection)
  if (complete) {
    return resolveAvatarV2(loadoutToUserAvatar(complete.loadout))
  }
  const initialAvatar = resolveInitialAvatarV2(selection?.presetId)
  return applyOnboardingStarterBody(
    initialAvatar,
    onboardingStarterBodyId,
    AVATAR_V2_CATALOG
  )
}

export function useAvatarV2(): AvatarV2ContextValue {
  const context = useContext(AvatarV2Context)
  if (!context) {
    throw new Error("useAvatarV2 must be used within AvatarV2Provider")
  }
  return context
}

export function parseStoredAvatarV2(
  rawValue: string | null,
  catalog: AvatarCatalogItem[] = AVATAR_V2_CATALOG
): UserAvatar | null {
  if (!rawValue) return null

  try {
    const parsed = JSON.parse(rawValue) as Partial<UserAvatar>
    if (!isStoredAvatarCandidate(parsed)) {
      return null
    }
    return resolveAvatarV2({
      bodyId: parsed.bodyId,
      faceId: parsed.faceId,
      eyesId: parsed.eyesId,
      noseId: parsed.noseId,
      mouthId: parsed.mouthId,
      hairId: parsed.hairId,
      topId: parsed.topId,
      bottomId: parsed.bottomId,
      shoesId: parsed.shoesId,
      dressId: typeof parsed.dressId === "string" ? parsed.dressId : null,
      outerwearId: typeof parsed.outerwearId === "string" ? parsed.outerwearId : null,
      accessoryIds: Array.isArray(parsed.accessoryIds)
        ? parsed.accessoryIds.filter((id): id is string => typeof id === "string")
        : []
    }, catalog)
  } catch {
    return null
  }
}

function isStoredAvatarCandidate(value: unknown): value is Partial<UserAvatar> {
  if (!value || typeof value !== "object") return false
  const avatar = value as Partial<UserAvatar>
  return (
    typeof avatar.bodyId === "string" &&
    typeof avatar.faceId === "string" &&
    typeof avatar.hairId === "string" &&
    typeof avatar.topId === "string" &&
    typeof avatar.bottomId === "string" &&
    typeof avatar.shoesId === "string"
  )
}
