/**
 * UI-independent Shop combination draft and apply transaction.
 *
 * AvatarLoadoutV2 models dress and outerwear as semantic slots. This state
 * machine remains renderer-independent and stores only the canonical draft.
 */
export type ShopCombinationSlot =
  | "body"
  | "face"
  | "eyes"
  | "nose"
  | "mouth"
  | "hair"
  | "dress"
  | "top"
  | "bottom"
  | "outerwear"
  | "shoes"
  | "accessory"

export const SHOP_COMBINATION_CATEGORY_ORDER = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
  "hair",
  "face",
  "eyes",
  "nose",
  "mouth"
] as const satisfies readonly ShopCombinationSlot[]

export type ShopCombinationDraft = Readonly<
  Partial<Record<ShopCombinationSlot, string | null>> & {
    accessoryIds?: readonly string[]
  }
>

export interface ShopCombinationQueueItem {
  slot: ShopCombinationSlot
  productId: string
}

export type ShopCombinationPhase =
  | "editing"
  | "confirming"
  | "purchasing"
  | "saving"
  | "review_required"

export type ShopAvatarRevision = string | number

export interface ShopCombinationState {
  draft: ShopCombinationDraft
  equipped: ShopCombinationDraft
  ownedProductIds: readonly string[]
  avatarRevision: ShopAvatarRevision
  activeCategory: ShopCombinationSlot | null
  phase: ShopCombinationPhase
  purchaseQueue: readonly ShopCombinationQueueItem[]
  purchasedProductIds: readonly string[]
  requiresRefresh: boolean
  issue: string | null
}

export type ShopCombinationCommand =
  | ({ type: "request_purchase_confirmation" } & ShopCombinationQueueItem)
  | ({ type: "purchase_product" } & ShopCombinationQueueItem)
  | {
    type: "save_avatar"
    combination: ShopCombinationDraft
    avatarRevision: ShopAvatarRevision
  }

export interface ShopCombinationTransition {
  state: ShopCombinationState
  commands: readonly ShopCombinationCommand[]
}

export type ShopCombinationAction =
  | {
    type: "preview_product"
    slot: ShopCombinationSlot
    productId: string | null
    /** Compatibility is resolved by the caller and must be explicit. */
    compatible: boolean
  }
  | { type: "preview_accessories"; productIds: readonly string[] }
  | { type: "replace_draft"; draft: ShopCombinationDraft }
  | { type: "discard_draft" }
  | { type: "change_category"; slot: ShopCombinationSlot }
  | { type: "apply" }
  | { type: "purchase_approved"; productId: string }
  | { type: "purchase_succeeded"; productId: string }
  | { type: "purchase_failed"; productId: string; reason: string }
  | { type: "cancel_apply" }
  | { type: "avatar_save_confirmed"; avatarRevision: ShopAvatarRevision }
  | { type: "avatar_save_failed"; reason: string }
  | { type: "avatar_save_revision_conflict" }
  | {
    type: "refresh_after_conflict"
    equipped: ShopCombinationDraft
    ownedProductIds: readonly string[]
    avatarRevision: ShopAvatarRevision
  }

export function createShopCombinationState(input: {
  equipped: ShopCombinationDraft
  ownedProductIds: readonly string[]
  avatarRevision: ShopAvatarRevision
}): ShopCombinationState {
  return {
    draft: { ...input.equipped },
    equipped: { ...input.equipped },
    ownedProductIds: unique(input.ownedProductIds),
    avatarRevision: input.avatarRevision,
    activeCategory: null,
    phase: "editing",
    purchaseQueue: [],
    purchasedProductIds: [],
    requiresRefresh: false,
    issue: null
  }
}

export function reduceShopCombination(
  state: ShopCombinationState,
  action: ShopCombinationAction
): ShopCombinationTransition {
  if (action.type === "preview_product") {
    if (state.phase !== "editing" || !action.compatible) return unchanged(state)
    const dressUpdate = action.slot === "top" || action.slot === "bottom"
      ? { dress: null as null }
      : {}
    return transition({
      ...state,
      draft: {
        ...state.draft,
        ...dressUpdate,
        [action.slot]: action.productId
      },
      issue: null
    })
  }

  if (action.type === "preview_accessories") {
    if (state.phase !== "editing") return unchanged(state)
    return transition({
      ...state,
      draft: {
        ...state.draft,
        accessoryIds: unique(action.productIds)
      },
      issue: null
    })
  }

  if (action.type === "replace_draft") {
    if (state.phase !== "editing") return unchanged(state)
    return transition({
      ...state,
      draft: {
        ...action.draft,
        accessoryIds: [...(action.draft.accessoryIds ?? [])]
      },
      issue: null
    })
  }

  if (action.type === "discard_draft") {
    if (state.phase !== "editing") return unchanged(state)
    return transition({
      ...state,
      draft: {
        ...state.equipped,
        accessoryIds: [...(state.equipped.accessoryIds ?? [])]
      },
      activeCategory: null,
      issue: null
    })
  }

  if (action.type === "change_category") {
    if (state.phase !== "editing") return unchanged(state)
    return transition({ ...state, activeCategory: action.slot })
  }

  if (action.type === "apply") {
    if (state.phase !== "editing") return unchanged(state)
    const purchaseQueue = buildPurchaseQueue(state.draft, state.ownedProductIds)
    if (purchaseQueue.length === 0) return beginSave(state, [])
    return transition(
      {
        ...state,
        phase: "confirming",
        purchaseQueue,
        purchasedProductIds: [],
        requiresRefresh: false,
        issue: null
      },
      [{ type: "request_purchase_confirmation", ...purchaseQueue[0] }]
    )
  }

  if (action.type === "purchase_approved") {
    if (state.phase !== "confirming") return unchanged(state)
    const current = state.purchaseQueue[0]
    if (!current || current.productId !== action.productId) return unchanged(state)
    return transition(
      { ...state, phase: "purchasing" },
      [{ type: "purchase_product", ...current }]
    )
  }

  if (action.type === "purchase_succeeded") {
    if (state.phase !== "purchasing") return unchanged(state)
    const current = state.purchaseQueue[0]
    if (!current || current.productId !== action.productId) return unchanged(state)
    const purchaseQueue = state.purchaseQueue.slice(1)
    const purchasedProductIds = unique([
      ...state.purchasedProductIds,
      action.productId
    ])
    const purchasedState: ShopCombinationState = {
      ...state,
      ownedProductIds: unique([...state.ownedProductIds, action.productId]),
      purchaseQueue,
      purchasedProductIds
    }
    if (purchaseQueue.length === 0) return beginSave(purchasedState, purchasedProductIds)
    return transition(
      { ...purchasedState, phase: "confirming" },
      [{ type: "request_purchase_confirmation", ...purchaseQueue[0] }]
    )
  }

  if (action.type === "purchase_failed") {
    if (
      state.phase !== "purchasing" ||
      state.purchaseQueue[0]?.productId !== action.productId
    ) return unchanged(state)
    return stopApply(state, action.reason)
  }

  if (action.type === "cancel_apply") {
    if (
      state.phase !== "confirming" &&
      state.phase !== "purchasing" &&
      state.phase !== "saving"
    ) {
      return unchanged(state)
    }
    return stopApply(state, null)
  }

  if (action.type === "avatar_save_confirmed") {
    if (state.phase !== "saving") return unchanged(state)
    return transition({
      ...state,
      equipped: { ...state.draft },
      avatarRevision: action.avatarRevision,
      phase: "editing",
      purchaseQueue: [],
      purchasedProductIds: [],
      requiresRefresh: false,
      issue: null
    })
  }

  if (action.type === "avatar_save_failed") {
    if (state.phase !== "saving") return unchanged(state)
    return stopApply(state, action.reason)
  }

  if (action.type === "avatar_save_revision_conflict") {
    if (state.phase !== "saving") return unchanged(state)
    return transition({
      ...state,
      phase: "review_required",
      purchaseQueue: [],
      requiresRefresh: true,
      issue: "avatar_revision_conflict"
    })
  }

  if (action.type === "refresh_after_conflict") {
    if (state.phase !== "review_required") return unchanged(state)
    return transition({
      ...state,
      equipped: { ...action.equipped },
      draft: {
        ...action.equipped,
        accessoryIds: [...(action.equipped.accessoryIds ?? [])]
      },
      ownedProductIds: unique([
        ...action.ownedProductIds,
        ...state.ownedProductIds
      ]),
      avatarRevision: action.avatarRevision,
      phase: "editing",
      purchaseQueue: [],
      purchasedProductIds: [],
      requiresRefresh: false,
      issue: null
    })
  }

  return unchanged(state)
}

export function resolveEffectiveCombination(
  draft: ShopCombinationDraft
): ShopCombinationDraft {
  if (!draft.dress) return { ...draft }
  return { ...draft, top: null, bottom: null }
}

export function buildPurchaseQueue(
  draft: ShopCombinationDraft,
  ownedProductIds: readonly string[]
): ShopCombinationQueueItem[] {
  const effective = resolveEffectiveCombination(draft)
  const owned = new Set(ownedProductIds)
  const queued = new Set<string>()
  return SHOP_COMBINATION_CATEGORY_ORDER.flatMap((slot) => {
    const productIds = slot === "accessory"
      ? effective.accessoryIds ?? (effective.accessory ? [effective.accessory] : [])
      : effective[slot] ? [effective[slot] as string] : []
    return productIds.flatMap((productId) => {
      if (owned.has(productId) || queued.has(productId)) return []
      queued.add(productId)
      return [{ slot, productId }]
    })
  })
}

function beginSave(
  state: ShopCombinationState,
  purchasedProductIds: readonly string[]
): ShopCombinationTransition {
  const combination = { ...state.draft }
  return transition(
    {
      ...state,
      phase: "saving",
      purchaseQueue: [],
      purchasedProductIds: [...purchasedProductIds],
      requiresRefresh: false,
      issue: null
    },
    [{
      type: "save_avatar",
      combination,
      avatarRevision: state.avatarRevision
    }]
  )
}

function stopApply(
  state: ShopCombinationState,
  issue: string | null
): ShopCombinationTransition {
  return transition({
    ...state,
    phase: "editing",
    purchaseQueue: [],
    purchasedProductIds: [],
    requiresRefresh: false,
    issue
  })
}

function transition(
  state: ShopCombinationState,
  commands: readonly ShopCombinationCommand[] = []
): ShopCombinationTransition {
  return { state, commands }
}

function unchanged(state: ShopCombinationState): ShopCombinationTransition {
  return transition(state)
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}
