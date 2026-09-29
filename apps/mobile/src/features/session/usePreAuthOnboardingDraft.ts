import AsyncStorage from "@react-native-async-storage/async-storage"
import { useCallback, useEffect, useRef, useState } from "react"
import type { UserAvatar } from "../avatarV2/avatarV2.types"
import { getAvatarV2StorageKey } from "../avatarV2/avatarV2Persistence"
import type { UserRoomDecor } from "../roomV2/roomV2.types"
import { getRoomV2StorageKey } from "../roomV2/roomV2Persistence"
import {
  createPreAuthOnboardingDraft,
  type PreAuthOnboardingDraft
} from "./preAuthOnboardingDraft"
import {
  createPreAuthOnboardingDraftStorage,
  getPreAuthOnboardingDraftScope,
  resolvePreAuthOnboardingDraftId,
  type PreAuthOnboardingDraftSnapshot,
  type PreAuthOnboardingResumeStep
} from "./preAuthOnboardingStorage"
import type { UpdateSessionProfileInput } from "./sessionApi"

export type RootPreAuthOnboardingDraft = PreAuthOnboardingDraft<
  UpdateSessionProfileInput,
  UserAvatar,
  UserRoomDecor
>

type RootPreAuthOnboardingDraftSnapshot = PreAuthOnboardingDraftSnapshot<
  UpdateSessionProfileInput,
  UserAvatar,
  UserRoomDecor
>

const preAuthDraftStorage = createPreAuthOnboardingDraftStorage<
  UpdateSessionProfileInput,
  UserAvatar,
  UserRoomDecor
>({
  store: {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key)
  }
})

function scheduleDeferredMaintenance(work: () => void): () => void {
  if (typeof globalThis.requestIdleCallback === "function") {
    const idleId = globalThis.requestIdleCallback(work, { timeout: 5_000 })
    return () => globalThis.cancelIdleCallback?.(idleId)
  }

  const timeoutId = setTimeout(work, 5_000)
  return () => clearTimeout(timeoutId)
}

export interface PreAuthOnboardingDraftState {
  preAuthDraft: RootPreAuthOnboardingDraft
  preAuthDraftSnapshot: RootPreAuthOnboardingDraftSnapshot | null
  isPreAuthDraftHydrating: boolean
  /** Storage scope for the signed-out avatar and room providers. */
  preAuthDraftScopeId: string
  persistPreAuthDraft: (
    nextDraft: RootPreAuthOnboardingDraft,
    resumeStep: PreAuthOnboardingResumeStep
  ) => Promise<void>
  clearPreAuthDraft: () => Promise<void>
}

/**
 * Owns the signed-out onboarding draft: hydration from device storage, the
 * scoped avatar/room storage identity, persistence, clearing after
 * registration, and idle cleanup of abandoned draft scopes.
 */
export function usePreAuthOnboardingDraft(): PreAuthOnboardingDraftState {
  const [preAuthDraft, setPreAuthDraft] = useState<RootPreAuthOnboardingDraft>(
    () => createPreAuthOnboardingDraft()
  )
  const preAuthDraftSnapshotRef = useRef<RootPreAuthOnboardingDraftSnapshot | null>(null)
  const [preAuthDraftSnapshot, setPreAuthDraftSnapshot] = useState(
    preAuthDraftSnapshotRef.current
  )
  const [isPreAuthDraftHydrating, setIsPreAuthDraftHydrating] = useState(true)
  const preAuthDraftAttemptIdRef = useRef(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  )
  const [preAuthDraftGeneration, setPreAuthDraftGeneration] = useState(0)
  const preAuthDraftId = resolvePreAuthOnboardingDraftId(
    preAuthDraftSnapshot?.draftId,
    preAuthDraftAttemptIdRef.current,
    preAuthDraftGeneration
  )
  const preAuthDraftScopeId = getPreAuthOnboardingDraftScope(preAuthDraftId)
  const persistPreAuthDraft = useCallback(async (
    nextDraft: RootPreAuthOnboardingDraft,
    resumeStep: PreAuthOnboardingResumeStep
  ): Promise<void> => {
    const snapshot = await preAuthDraftStorage.save(
      nextDraft,
      resumeStep,
      preAuthDraftSnapshotRef.current ?? { draftId: preAuthDraftId }
    )
    preAuthDraftSnapshotRef.current = snapshot
    setPreAuthDraftSnapshot(snapshot)
    setPreAuthDraft(snapshot.draft)
  }, [preAuthDraftId])
  const clearPreAuthDraft = useCallback(async (): Promise<void> => {
    const keys = [
      getAvatarV2StorageKey(preAuthDraftScopeId),
      getRoomV2StorageKey(preAuthDraftScopeId)
    ].filter((key): key is string => Boolean(key))
    await Promise.all([
      AsyncStorage.multiRemove(keys),
      preAuthDraftStorage.clear()
    ])
    preAuthDraftSnapshotRef.current = null
    setPreAuthDraftSnapshot(null)
    setPreAuthDraft(createPreAuthOnboardingDraft())
    setPreAuthDraftGeneration((generation) => generation + 1)
  }, [preAuthDraftScopeId])

  useEffect(() => {
    let active = true
    void preAuthDraftStorage.load()
      .then((snapshot) => {
        if (!active || snapshot === null) return
        preAuthDraftSnapshotRef.current = snapshot
        setPreAuthDraftSnapshot(snapshot)
        setPreAuthDraft(snapshot.draft)
      })
      .catch(() => preAuthDraftStorage.clear())
      .finally(() => {
        if (active) setIsPreAuthDraftHydrating(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (isPreAuthDraftHydrating) return
    const currentKeys = new Set([
      getAvatarV2StorageKey(preAuthDraftScopeId),
      getRoomV2StorageKey(preAuthDraftScopeId)
    ].filter((key): key is string => Boolean(key)))
    const cancelDeferredCleanup = scheduleDeferredMaintenance(() => {
      void AsyncStorage.getAllKeys()
        .then((keys) => keys.filter(
          (key) => key.includes("preauth-onboarding-draft") && !currentKeys.has(key)
        ))
        .then((staleKeys) => staleKeys.length > 0
          ? AsyncStorage.multiRemove(staleKeys)
          : undefined)
        .catch(() => undefined)
    })
    return cancelDeferredCleanup
  }, [isPreAuthDraftHydrating, preAuthDraftScopeId])

  return {
    preAuthDraft,
    preAuthDraftSnapshot,
    isPreAuthDraftHydrating,
    preAuthDraftScopeId,
    persistPreAuthDraft,
    clearPreAuthDraft
  }
}
