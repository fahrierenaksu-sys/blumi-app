import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { captureProductEvent } from "../../../analytics/productAnalytics"
import { hapticError, hapticSelection, hapticSuccess } from "../../../ui/haptics"
import type { AvatarCatalogItem, UserAvatar } from "../avatarV2.types"
import { equipAvatarV2Item, isAvatarV2ItemEquipped } from "../avatarV2Selectors"
import {
  areWardrobeAvatarSelectionsEqual,
  clearQueuedWardrobeTryOn,
  collectWardrobeTryOnTouches,
  confirmWardrobeTryOnIfReady,
  queueWardrobeTryOn,
  rebaseWardrobeTryOnSnapshot,
  reportWardrobeTryOnSuccess,
  runWardrobeTryOnSave,
  shouldHandleWardrobeTryOnCompletion,
  takeQueuedWardrobeTryOnIfReady,
  wardrobeTryOnReducer,
  type WardrobeTryOnAction,
  type WardrobeTryOnActiveRequest,
  type WardrobeTryOnPending,
  type WardrobeTryOnQueuedRequest
} from "./wardrobeTryOn"

interface WardrobeTryOnNavigation {
  addListener: (event: "blur", callback: () => void) => () => void
}

interface SaveAvatarResult {
  ok: boolean
  persistence?: "acknowledged" | "local"
  application?: "applied" | "superseded"
  canonicalAvatar?: UserAvatar
}

/**
 * Owns the wardrobe equip/save flow: optimistic preview, one in-flight save,
 * queued rapid taps rebased onto the canonical avatar, confirmation against
 * the server-acknowledged avatar, and blur/unmount cancellation.
 */
export function useWardrobeTryOn(input: {
  navigation: WardrobeTryOnNavigation
  avatar: UserAvatar
  isSaving: boolean
  canEquipItem: (item: AvatarCatalogItem) => boolean
  saveAvatar: (avatar: UserAvatar) => Promise<SaveAvatarResult>
}) {
  const { navigation, avatar, isSaving, canEquipItem, saveAvatar } = input
  const [pendingTryOn, dispatchReducer] = useReducer(wardrobeTryOnReducer, null)
  // Sticky until the next equip: "Done" must not close over a rejected save.
  const [hasFailedSave, setHasFailedSave] = useState(false)
  const dispatchTryOn = useCallback((action: WardrobeTryOnAction): void => {
    if (action.type === "begin") setHasFailedSave(false)
    if (action.type === "failed") setHasFailedSave(true)
    dispatchReducer(action)
  }, [])
  const activeTryOnRequestRef = useRef<WardrobeTryOnActiveRequest | null>(null)
  const queuedTryOnRequestRef = useRef<WardrobeTryOnQueuedRequest | null>(null)
  const previewAvatarRef = useRef<UserAvatar | null>(null)
  const nextTryOnRequestIdRef = useRef(0)
  const [saveSequence, setSaveSequence] = useState(0)
  const screenGenerationRef = useRef(0)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      activeTryOnRequestRef.current = null
      queuedTryOnRequestRef.current = null
      previewAvatarRef.current = null
    }
  }, [])

  useEffect(() => navigation.addListener("blur", () => {
    screenGenerationRef.current += 1
    activeTryOnRequestRef.current = null
    queuedTryOnRequestRef.current = null
    previewAvatarRef.current = null
    dispatchTryOn({ type: "dismiss-preview" })
  }), [dispatchTryOn, navigation])

  const displayedAvatar = pendingTryOn?.previewAvatar ?? avatar

  const dismissTryOnPreview = useCallback((): void => {
    clearQueuedWardrobeTryOn({
      queuedRequestRef: queuedTryOnRequestRef,
      previewAvatarRef,
      dispatch: dispatchTryOn
    })
  }, [dispatchTryOn])

  const startTryOnSave = useCallback((
    pending: WardrobeTryOnPending,
    baselineAvatar: UserAvatar
  ): void => {
    const requestGeneration = screenGenerationRef.current
    const saveAttempt = runWardrobeTryOnSave({
      requestId: pending.requestId,
      pending,
      baselineAvatar,
      activeRequestRef: activeTryOnRequestRef,
      dispatch: (action) => {
        if (isMountedRef.current) dispatchTryOn(action)
      },
      save: saveAvatar
    })
    if (!saveAttempt) return

    void saveAttempt.then((result) => {
      if (!shouldHandleWardrobeTryOnCompletion({
        isMounted: isMountedRef.current,
        requestGeneration,
        currentScreenGeneration: screenGenerationRef.current
      })) return
      setSaveSequence((current) => current + 1)
      if (!result?.ok) {
        if (!queuedTryOnRequestRef.current) hapticError()
      }
    })
  }, [dispatchTryOn, saveAvatar])

  useEffect(() => {
    const requestBeforeConfirmation = activeTryOnRequestRef.current
    const confirmation = confirmWardrobeTryOnIfReady({
      avatar,
      isSaving,
      activeRequestRef: activeTryOnRequestRef,
      dispatch: dispatchTryOn
    })
    reportWardrobeTryOnSuccess({
      confirmation,
      activeRequest: requestBeforeConfirmation,
      hasQueuedRequest: Boolean(queuedTryOnRequestRef.current),
      captureProductEvent,
      hapticSuccess
    })
    const activeRequest = activeTryOnRequestRef.current
    if (activeRequest) return
    if (isSaving) return

    const queued = takeQueuedWardrobeTryOnIfReady({
      isSaving,
      activeRequestRef: activeTryOnRequestRef,
      queuedRequestRef: queuedTryOnRequestRef
    })
    if (!queued) {
      previewAvatarRef.current = null
      return
    }
    if (!canEquipItem(queued.item)) {
      previewAvatarRef.current = null
      dispatchTryOn({ type: "failed", requestId: queued.requestId })
      hapticError()
      return
    }
    const nextPreview = rebaseWardrobeTryOnSnapshot(
      queued.baseAvatar,
      queued.previewAvatar,
      avatar,
      queued.touched
    )
    previewAvatarRef.current = nextPreview
    if (areWardrobeAvatarSelectionsEqual(avatar, nextPreview)) {
      previewAvatarRef.current = null
      dispatchTryOn({ type: "confirmed", requestId: queued.requestId })
      return
    }
    startTryOnSave({
      requestId: queued.requestId,
      item: queued.item,
      previewAvatar: nextPreview,
      status: "saving"
    }, avatar)
  }, [avatar, canEquipItem, dispatchTryOn, isSaving, pendingTryOn, saveSequence, startTryOnSave])

  const handleEquip = useCallback((item: AvatarCatalogItem): void => {
    if (!canEquipItem(item)) return
    const previewBase = previewAvatarRef.current ??
      activeTryOnRequestRef.current?.previewAvatar ?? avatar
    if (item.type !== "accessory" && isAvatarV2ItemEquipped(previewBase, item)) return

    // Trying a piece on is choosing among options: one selection tick.
    hapticSelection()
    const previewAvatar = equipAvatarV2Item(previewBase, item)
    previewAvatarRef.current = previewAvatar
    const pending: WardrobeTryOnPending = {
      requestId: ++nextTryOnRequestIdRef.current,
      item,
      previewAvatar,
      status: "saving"
    }
    if (queueWardrobeTryOn({
      pending,
      activeRequestRef: activeTryOnRequestRef,
      queuedRequestRef: queuedTryOnRequestRef,
      dispatch: dispatchTryOn
    })) return
    if (isSaving) {
      queuedTryOnRequestRef.current = {
        ...pending,
        baseAvatar: avatar,
        touched: collectWardrobeTryOnTouches(avatar, previewAvatar)
      }
      dispatchTryOn({ type: "begin", pending })
      return
    }
    startTryOnSave(pending, avatar)
  }, [avatar, canEquipItem, dispatchTryOn, isSaving, startTryOnSave])

  return {
    pendingTryOn,
    displayedAvatar,
    hasFailedSave,
    dismissTryOnPreview,
    handleEquip
  }
}
