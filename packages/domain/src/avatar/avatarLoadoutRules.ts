import type {
  AvatarLoadout,
  AvatarLoadoutV1,
  AvatarLoadoutV2,
  CompleteAvatarSelection
} from "@blumi/contracts"
import {
  isAvatarLoadoutV1,
  isAvatarLoadoutV2
} from "@blumi/contracts"
import type {
  AvatarLoadoutCatalogItem,
  AvatarLoadoutSlot,
  ReadonlyAvatarLoadout
} from "./avatarLoadoutCatalog"
import {
  AVATAR_ITEM_RULES,
  avatarStarterLooks,
  findAvatarRuleItem,
  isAvatarItemRetired,
  type AvatarItemRules
} from "./avatarItemRules"

export type AvatarLoadoutValidationCode =
  | "invalid_shape"
  | "unknown_item"
  | "wrong_slot"
  | "retired_item"
  | "incompatible_item"
  | "unowned_item"
  | "too_many_accessories"
  | "duplicate_accessory"
  | "accessory_group_conflict"
  | "outfit_pair_mismatch"

export type AvatarLoadoutValidationResult =
  | {
      ok: true
      loadout: AvatarLoadout
      code?: never
    }
  | {
      ok: false
      code: AvatarLoadoutValidationCode
      message: string
      loadout?: never
    }

const MAX_ACCESSORIES = 6
type RequiredLoadoutItemKey =
  | "bodyId"
  | "faceId"
  | "eyesId"
  | "noseId"
  | "mouthId"
  | "hairId"
  | "topId"
  | "bottomId"
  | "shoesId"

const REQUIRED_SLOTS: readonly [RequiredLoadoutItemKey, AvatarLoadoutSlot][] = [
  ["bodyId", "body"],
  ["faceId", "face"],
  ["eyesId", "eyes"],
  ["noseId", "nose"],
  ["mouthId", "mouth"],
  ["hairId", "hair"],
  ["topId", "top"],
  ["bottomId", "bottom"],
  ["shoesId", "shoes"]
]

export function validateAvatarLoadout(
  input: unknown,
  ownedItemIds: readonly string[],
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): AvatarLoadoutValidationResult {
  const loadout = parseAvatarLoadout(input)
  if (!loadout) return invalid("invalid_shape", "Choose a complete avatar look.")
  if ([loadout.bodyId, loadout.faceId, loadout.eyesId, loadout.noseId,
    loadout.mouthId, loadout.hairId, loadout.topId, loadout.bottomId,
    loadout.shoesId, ...loadout.accessoryIds,
    ...(loadout.schemaVersion === 2 ? [loadout.dressId, loadout.outerwearId] : [])]
    .some((itemId) => itemId !== null && isAvatarItemRetired(rules, itemId))) {
    return invalid("retired_item", "This avatar item is temporarily unavailable.")
  }
  if (loadout.accessoryIds.length > MAX_ACCESSORIES) {
    return invalid("too_many_accessories", "Choose up to six accessories.")
  }
  if (new Set(loadout.accessoryIds).size !== loadout.accessoryIds.length) {
    return invalid("duplicate_accessory", "Each accessory can be equipped once.")
  }

  const selectedItems: AvatarLoadoutCatalogItem[] = []
  for (const [loadoutKey, slot] of REQUIRED_SLOTS) {
    const result = resolveSelectedItem(loadout[loadoutKey] as string, slot, rules)
    if ("error" in result) return result.error
    selectedItems.push(result.item)
  }
  for (const accessoryId of loadout.accessoryIds) {
    const result = resolveSelectedItem(accessoryId, "accessory", rules)
    if ("error" in result) return result.error
    selectedItems.push(result.item)
  }
  if (loadout.schemaVersion === 2) {
    if (loadout.outerwearId !== null) {
      return invalid("unknown_item", "Outerwear is not available in the room yet.")
    }
    if (loadout.dressId !== null) {
      const result = resolveDressItems(loadout.dressId, rules)
      if ("error" in result) return result.error
      selectedItems.push(...result.items)
    }
  }
  const incompatibleItem = selectedItems.find(
    (item) => !item.supportedBodyIds.includes(loadout.bodyId)
  )
  if (incompatibleItem) {
    return invalid(
      "incompatible_item",
      "Choose avatar items that fit the selected body."
    )
  }
  const unownedItem = selectedItems.find(
    (item) => !ownedItemIds.includes(item.itemId)
  )
  if (unownedItem) {
    return invalid("unowned_item", "Unlock this avatar item before equipping it.")
  }
  if (hasAccessoryGroupConflict(selectedItems)) {
    return invalid(
      "accessory_group_conflict",
      "Choose only one accessory from each style group."
    )
  }
  if (!hasValidOutfitPair(loadout, rules)) {
    return invalid("outfit_pair_mismatch", "Choose the complete matching outfit.")
  }
  return { ok: true, loadout: cloneAvatarLoadout(loadout) }
}

export function createAvatarSelection(
  loadout: ReadonlyAvatarLoadout,
  revision: number
): CompleteAvatarSelection {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("Avatar revision must be a non-negative safe integer.")
  }
  return {
    presetId: loadout.bodyId,
    loadout: cloneAvatarLoadout(loadout),
    revision
  }
}

export function cloneAvatarLoadout(
  loadout: ReadonlyAvatarLoadout<AvatarLoadoutV1>
): AvatarLoadoutV1
export function cloneAvatarLoadout(
  loadout: ReadonlyAvatarLoadout<AvatarLoadoutV2>
): AvatarLoadoutV2
export function cloneAvatarLoadout(
  loadout: ReadonlyAvatarLoadout
): AvatarLoadout
export function cloneAvatarLoadout(
  loadout: ReadonlyAvatarLoadout
): AvatarLoadout {
  return {
    ...loadout,
    accessoryIds: [...loadout.accessoryIds]
  } as AvatarLoadout
}

export function toAvatarLoadoutV2(
  loadout: ReadonlyAvatarLoadout,
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): AvatarLoadoutV2 {
  if (loadout.schemaVersion === 2) {
    return cloneAvatarLoadout(loadout)
  }
  const legacyDress = findLegacyDressItems(loadout, rules)
  if (legacyDress) {
    const starter = findStarterLoadout(loadout.bodyId, rules)
    if (!starter) {
      throw new Error("No starter separates are configured for this avatar body.")
    }
    return {
      ...loadout,
      schemaVersion: 2,
      topId: starter.topId,
      bottomId: starter.bottomId,
      dressId: legacyDress[0].itemId,
      outerwearId: null,
      accessoryIds: [...loadout.accessoryIds]
    }
  }
  return {
    ...loadout,
    schemaVersion: 2,
    dressId: null,
    outerwearId: null,
    accessoryIds: [...loadout.accessoryIds]
  }
}

export function projectAvatarLoadoutV1(
  loadout: ReadonlyAvatarLoadout,
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): AvatarLoadoutV1 {
  // a one-piece dress has no V1 form: an old client is shown the separates stored under it
  const onePiece = loadout.schemaVersion === 2 && loadout.dressId !== null &&
    findAvatarRuleItem(rules, loadout.dressId)?.slot === "dress"
  const dressItems = loadout.schemaVersion === 2 && loadout.dressId !== null && !onePiece
    ? findDressItems(loadout.dressId, rules)
    : null
  if (loadout.schemaVersion === 2 && loadout.dressId !== null && !onePiece && !dressItems) {
    throw new Error("Cannot project an unknown or incomplete dress entitlement.")
  }
  return {
    schemaVersion: 1,
    bodyId: loadout.bodyId,
    faceId: loadout.faceId,
    eyesId: loadout.eyesId,
    noseId: loadout.noseId,
    mouthId: loadout.mouthId,
    hairId: loadout.hairId,
    topId: dressItems?.[0].itemId ?? loadout.topId,
    bottomId: dressItems?.[1].itemId ?? loadout.bottomId,
    shoesId: loadout.shoesId,
    accessoryIds: [...loadout.accessoryIds]
  }
}

function parseAvatarLoadout(input: unknown): AvatarLoadout | null {
  if (isAvatarLoadoutV1(input)) return cloneAvatarLoadout(input)
  if (isAvatarLoadoutV2(input)) return cloneAvatarLoadout(input)
  return null
}

function resolveSelectedItem(
  itemId: string,
  slot: AvatarLoadoutSlot,
  rules: AvatarItemRules
):
  | { ok: true; item: AvatarLoadoutCatalogItem }
  | { ok: false; error: AvatarLoadoutValidationResult & { ok: false } } {
  const item = findAvatarRuleItem(rules, itemId)
  if (!item) {
    return { ok: false, error: invalid("unknown_item", "Unknown avatar item.") }
  }
  if (item.slot !== slot) {
    return { ok: false, error: invalid("wrong_slot", "Avatar item is in the wrong slot.") }
  }
  return { ok: true, item }
}

function resolveDressItems(
  itemId: string,
  rules: AvatarItemRules
):
  | { ok: true; items: readonly AvatarLoadoutCatalogItem[] }
  | { ok: false; error: AvatarLoadoutValidationResult & { ok: false } } {
  const dressTop = findAvatarRuleItem(rules, itemId)
  if (!dressTop) {
    return { ok: false, error: invalid("unknown_item", "Unknown avatar item.") }
  }
  // a one-piece dress is one item; a legacy dress is a paired top and bottom
  if (dressTop.slot === "dress") return { ok: true, items: [dressTop] }
  if (dressTop.slot !== "top" || !dressTop.outfitKey || !dressTop.pairedItemId) {
    return {
      ok: false,
      error: invalid("wrong_slot", "Avatar item is in the wrong slot.")
    }
  }
  const dressItems = findDressItems(itemId, rules)
  if (!dressItems) {
    return {
      ok: false,
      error: invalid("outfit_pair_mismatch", "Choose the complete matching outfit.")
    }
  }
  return { ok: true, items: dressItems }
}

function findDressItems(
  itemId: string,
  rules: AvatarItemRules
): readonly [AvatarLoadoutCatalogItem, AvatarLoadoutCatalogItem] | null {
  const dressTop = findAvatarRuleItem(rules, itemId)
  if (dressTop?.slot !== "top" || !dressTop.outfitKey || !dressTop.pairedItemId) {
    return null
  }
  const pairedBottom = findAvatarRuleItem(rules, dressTop.pairedItemId)
  if (
    pairedBottom?.slot !== "bottom" ||
    pairedBottom.outfitKey !== dressTop.outfitKey ||
    pairedBottom.pairedItemId !== dressTop.itemId
  ) {
    return null
  }
  return [dressTop, pairedBottom]
}

function findLegacyDressItems(
  loadout: ReadonlyAvatarLoadout<AvatarLoadoutV1>,
  rules: AvatarItemRules
): readonly [AvatarLoadoutCatalogItem, AvatarLoadoutCatalogItem] | null {
  const dressItems = findDressItems(loadout.topId, rules)
  return dressItems?.[1].itemId === loadout.bottomId ? dressItems : null
}

function findStarterLoadout(
  bodyId: string,
  rules: AvatarItemRules
): ReadonlyAvatarLoadout<AvatarLoadoutV1> | null {
  return avatarStarterLooks(rules).find(
    (loadout) => loadout.bodyId === bodyId
  ) ?? null
}

function hasAccessoryGroupConflict(
  selectedItems: readonly AvatarLoadoutCatalogItem[]
): boolean {
  const groups = selectedItems
    .filter((item) => item.slot === "accessory")
    .map((item) => item.accessoryGroup)
  return new Set(groups).size !== groups.length
}

function hasValidOutfitPair(loadout: AvatarLoadout, rules: AvatarItemRules): boolean {
  const top = findAvatarRuleItem(rules, loadout.topId)
  const bottom = findAvatarRuleItem(rules, loadout.bottomId)
  if (loadout.schemaVersion === 2) {
    return !top?.pairedItemId && !bottom?.pairedItemId
  }
  if (top?.pairedItemId && top.pairedItemId !== bottom?.itemId) return false
  if (bottom?.pairedItemId && bottom.pairedItemId !== top?.itemId) return false
  return true
}

function invalid(
  code: AvatarLoadoutValidationCode,
  message: string
): AvatarLoadoutValidationResult & { ok: false } {
  return { ok: false, code, message }
}
