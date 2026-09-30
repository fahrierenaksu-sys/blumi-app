import { captureProductEvent } from "../../../analytics/productAnalytics"
import { hapticSuccess } from "../../../ui/haptics"
import type { AvatarCatalogItem, UserAvatar } from "../avatarV2.types"

export interface WardrobeTryOnPending {
  requestId: number
  item: AvatarCatalogItem
  previewAvatar: UserAvatar
  status: "saving" | "awaiting-confirmation"
}

export type WardrobeTryOnAction =
  | { type: "begin"; pending: WardrobeTryOnPending }
  | { type: "saved"; requestId: number }
  | { type: "failed"; requestId: number }
  | { type: "confirmed"; requestId: number }
  | { type: "dismiss-preview" }

export interface WardrobeTryOnActiveRequest {
  requestId: number
  item: AvatarCatalogItem
  previewAvatar: UserAvatar
  baselineAvatar?: UserAvatar
  status: "saving" | "awaiting-confirmation"
  persistence?: "acknowledged" | "local"
  application?: "applied" | "superseded"
}

export interface WardrobeTryOnQueuedRequest {
  requestId: number
  item: AvatarCatalogItem
  /** Baseline for the complete rapid-tap intent; previewAvatar remains immutable. */
  baseAvatar: UserAvatar
  previewAvatar: UserAvatar
  touched: { scalarFields: string[]; accessoryIds: string[] }
}

export function collectWardrobeTryOnTouches(
  before: UserAvatar,
  after: UserAvatar,
  previous: { scalarFields: string[]; accessoryIds: string[] } = {
    scalarFields: [], accessoryIds: []
  }
): { scalarFields: string[]; accessoryIds: string[] } {
  const scalarFields = new Set(previous.scalarFields)
  for (const field of [
    "bodyId", "faceId", "eyesId", "noseId", "mouthId", "hairId", "topId",
    "bottomId", "shoesId", "dressId", "outerwearId"
  ] as const) {
    if ((before[field] ?? null) !== (after[field] ?? null)) scalarFields.add(field)
  }
  const accessoryIds = new Set(previous.accessoryIds)
  const beforeAccessories = new Set(before.accessoryIds)
  const afterAccessories = new Set(after.accessoryIds)
  for (const id of new Set([...before.accessoryIds, ...after.accessoryIds])) {
    if (beforeAccessories.has(id) !== afterAccessories.has(id)) accessoryIds.add(id)
  }
  return { scalarFields: [...scalarFields], accessoryIds: [...accessoryIds] }
}

export function wardrobeTryOnReducer(
  state: WardrobeTryOnPending | null,
  action: WardrobeTryOnAction
): WardrobeTryOnPending | null {
  if (action.type === "dismiss-preview") return null
  if (action.type === "begin") return action.pending
  if (!state || state.requestId !== action.requestId) return state
  if (action.type === "saved") return { ...state, status: "awaiting-confirmation" }
  return null
}

export function queueWardrobeTryOn(input: {
  pending: WardrobeTryOnPending
  activeRequestRef: { current: WardrobeTryOnActiveRequest | null }
  queuedRequestRef: { current: WardrobeTryOnQueuedRequest | null }
  dispatch: (action: WardrobeTryOnAction) => void
}): boolean {
  if (!input.activeRequestRef.current) return false
  const active = input.activeRequestRef.current
  const previous = input.queuedRequestRef.current
  const baseAvatar = active.baselineAvatar ?? active.previewAvatar
  const initialTouches = previous?.touched ??
    collectWardrobeTryOnTouches(baseAvatar, active.previewAvatar)
  input.queuedRequestRef.current = {
    requestId: input.pending.requestId,
    item: input.pending.item,
    baseAvatar,
    previewAvatar: input.pending.previewAvatar,
    touched: collectWardrobeTryOnTouches(
      previous?.previewAvatar ?? active.previewAvatar,
      input.pending.previewAvatar,
      initialTouches
    )
  }
  input.dispatch({ type: "begin", pending: input.pending })
  return true
}

export function clearQueuedWardrobeTryOn(input: {
  queuedRequestRef: { current: WardrobeTryOnQueuedRequest | null }
  previewAvatarRef: { current: UserAvatar | null }
  dispatch: (action: WardrobeTryOnAction) => void
}): void {
  input.queuedRequestRef.current = null
  input.previewAvatarRef.current = null
  input.dispatch({ type: "dismiss-preview" })
}

export function takeQueuedWardrobeTryOnIfReady(input: {
  isSaving: boolean
  activeRequestRef: { current: WardrobeTryOnActiveRequest | null }
  queuedRequestRef: { current: WardrobeTryOnQueuedRequest | null }
}): WardrobeTryOnQueuedRequest | null {
  if (input.isSaving || input.activeRequestRef.current) return null
  const queued = input.queuedRequestRef.current
  input.queuedRequestRef.current = null
  return queued
}

export function shouldHandleWardrobeTryOnCompletion(input: {
  isMounted: boolean
  requestGeneration: number
  currentScreenGeneration: number
}): boolean {
  return input.isMounted && input.requestGeneration === input.currentScreenGeneration
}

export function runWardrobeTryOnSave<TResult extends {
  ok: boolean
  persistence?: "acknowledged" | "local"
  application?: "applied" | "superseded"
  canonicalAvatar?: UserAvatar
}>(input: {
  requestId: number
  pending: WardrobeTryOnPending
  baselineAvatar?: UserAvatar
  activeRequestRef: { current: WardrobeTryOnActiveRequest | null }
  dispatch: (action: WardrobeTryOnAction) => void
  save: (avatar: UserAvatar) => Promise<TResult>
}): Promise<TResult | undefined> | null {
  if (input.activeRequestRef.current) return null

  input.activeRequestRef.current = {
    requestId: input.requestId,
    item: input.pending.item,
    previewAvatar: input.pending.previewAvatar,
    baselineAvatar: input.baselineAvatar,
    status: "saving"
  }
  input.dispatch({ type: "begin", pending: input.pending })

  return (async () => {
    try {
      // Persist the exact latest preview snapshot. Re-applying one item here
      // can reverse accessory toggles or drop an earlier queued category.
      const result = await input.save(input.pending.previewAvatar)
      const activeRequest = input.activeRequestRef.current
      if (activeRequest?.requestId !== input.requestId) return result
      if (!result.ok) {
        input.activeRequestRef.current = null
        input.dispatch({ type: "failed", requestId: input.requestId })
        return result
      }
      if (result.application !== "applied") {
        input.activeRequestRef.current = null
        input.dispatch({ type: "failed", requestId: input.requestId })
        return result
      }
      if (result.canonicalAvatar &&
        !areWardrobeAvatarSelectionsEqual(result.canonicalAvatar, input.pending.previewAvatar)) {
        input.activeRequestRef.current = null
        input.dispatch({ type: "failed", requestId: input.requestId })
        return undefined
      }
      activeRequest.status = "awaiting-confirmation"
      activeRequest.persistence = result.persistence
      activeRequest.application = result.application
      input.dispatch({ type: "saved", requestId: input.requestId })
      return result
    } catch {
      if (input.activeRequestRef.current?.requestId === input.requestId) {
        input.activeRequestRef.current = null
        input.dispatch({ type: "failed", requestId: input.requestId })
      }
      return undefined
    }
  })()
}

export type WardrobeTryOnConfirmation =
  | "waiting"
  | "confirmed"
  | "failed"
  | "superseded"

export function resolveWardrobeTryOnConfirmation(input: {
  avatar: UserAvatar
  isSaving: boolean
  activeRequestRef: { current: WardrobeTryOnActiveRequest | null }
}): WardrobeTryOnConfirmation {
  const activeRequest = input.activeRequestRef.current
  if (!activeRequest || activeRequest.status !== "awaiting-confirmation" || input.isSaving) {
    return "waiting"
  }
  if (activeRequest.application !== "applied") return "superseded"
  if (areWardrobeAvatarSelectionsEqual(input.avatar, activeRequest.previewAvatar)) {
    return "confirmed"
  }
  if (activeRequest.baselineAvatar &&
    areWardrobeAvatarSelectionsEqual(input.avatar, activeRequest.baselineAvatar)) {
    return "waiting"
  }
  return "failed"
}

export function shouldReportWardrobeTryOnSuccess(
  confirmation: WardrobeTryOnConfirmation
): boolean {
  return confirmation === "confirmed"
}

export function reportWardrobeTryOnSuccess(input: {
  confirmation: WardrobeTryOnConfirmation
  activeRequest: WardrobeTryOnActiveRequest | null
  hasQueuedRequest: boolean
  captureProductEvent: typeof captureProductEvent
  hapticSuccess: typeof hapticSuccess
}): boolean {
  if (!input.activeRequest || !shouldReportWardrobeTryOnSuccess(input.confirmation)) {
    return false
  }
  input.captureProductEvent("wardrobe_item_equipped", {
    item_type: input.activeRequest.item.type,
    full_look: Boolean(input.activeRequest.item.outfitKey)
  })
  if (!input.hasQueuedRequest) input.hapticSuccess()
  return true
}

export function confirmWardrobeTryOnIfReady(input: {
  avatar: UserAvatar
  isSaving: boolean
  activeRequestRef: { current: WardrobeTryOnActiveRequest | null }
  dispatch: (action: WardrobeTryOnAction) => void
}): WardrobeTryOnConfirmation {
  const activeRequest = input.activeRequestRef.current
  const confirmation = resolveWardrobeTryOnConfirmation(input)
  if (!activeRequest || confirmation === "waiting") return confirmation

  input.activeRequestRef.current = null
  input.dispatch({
    type: confirmation === "confirmed" ? "confirmed" : "failed",
    requestId: activeRequest.requestId
  })
  return confirmation
}

export function areWardrobeAvatarSelectionsEqual(
  left: UserAvatar,
  right: UserAvatar
): boolean {
  return left.bodyId === right.bodyId &&
    left.faceId === right.faceId &&
    left.eyesId === right.eyesId &&
    left.noseId === right.noseId &&
    left.mouthId === right.mouthId &&
    left.hairId === right.hairId &&
    left.topId === right.topId &&
    left.bottomId === right.bottomId &&
    left.shoesId === right.shoesId &&
    (left.dressId ?? null) === (right.dressId ?? null) &&
    (left.outerwearId ?? null) === (right.outerwearId ?? null) &&
    [...left.accessoryIds].sort().join("|") === [...right.accessoryIds].sort().join("|")
}

export function rebaseWardrobeTryOnSnapshot(
  baseAvatar: UserAvatar,
  intendedAvatar: UserAvatar,
  canonicalAvatar: UserAvatar,
  touched?: { scalarFields: string[]; accessoryIds: string[] }
): UserAvatar {
  if (areWardrobeAvatarSelectionsEqual(baseAvatar, canonicalAvatar)) {
    return intendedAvatar
  }

  const rebasedAvatar: UserAvatar = {
    ...canonicalAvatar,
    accessoryIds: [...canonicalAvatar.accessoryIds]
  }
  const scalarFields = [
    "bodyId",
    "faceId",
    "eyesId",
    "noseId",
    "mouthId",
    "hairId",
    "topId",
    "bottomId",
    "shoesId",
    "dressId",
    "outerwearId"
  ] as const

  for (const field of scalarFields) {
    if (touched?.scalarFields.includes(field) ??
      (baseAvatar[field] ?? null) !== (intendedAvatar[field] ?? null)) {
      Object.assign(rebasedAvatar, { [field]: intendedAvatar[field] ?? null })
    }
  }

  const baseAccessories = new Set(baseAvatar.accessoryIds)
  const intendedAccessories = new Set(intendedAvatar.accessoryIds)
  const canonicalAccessories = new Set(canonicalAvatar.accessoryIds)
  const touchedAccessories = new Set(touched?.accessoryIds ?? [
    ...baseAvatar.accessoryIds,
    ...intendedAvatar.accessoryIds
  ].filter((id) => baseAccessories.has(id) !== intendedAccessories.has(id)))

  for (const id of touchedAccessories) {
    if (intendedAccessories.has(id)) canonicalAccessories.add(id)
    else canonicalAccessories.delete(id)
  }
  rebasedAvatar.accessoryIds = [...canonicalAccessories]
  return rebasedAvatar
}
