import type { AvatarLoadout, AvatarLoadoutV1, AvatarLoadoutV2 } from "@blumi/contracts"
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
import { cloneAvatarLoadout, validateAvatarLoadout } from "./avatarLoadoutRules"

/**
 * Tolerant READ of a stored avatar loadout (plan §2.4). Stored rows can hold
 * item IDs that are unknown, retired or meant for the other body; reading
 * them must never fail and must never write. Every slot that cannot be worn
 * falls back to that body's starter piece. Saves stay strict
 * (`validateAvatarLoadout`).
 */
export interface AvatarLoadoutCoercionHints {
  /** The stored `avatar_preset_id`: a body ID, or a legacy preset such as `dusk`. */
  readonly presetId?: unknown
  /** The profile's gender (`identity_gender`, else `gender`); picks the body for legacy presets. */
  readonly gender?: unknown
}

type ItemKey = "faceId" | "eyesId" | "noseId" | "mouthId" | "hairId" | "topId" | "bottomId" | "shoesId"

const ITEM_SLOTS: readonly (readonly [ItemKey, AvatarLoadoutSlot])[] = [
  ["faceId", "face"],
  ["eyesId", "eyes"],
  ["noseId", "nose"],
  ["mouthId", "mouth"],
  ["hairId", "hair"],
  ["topId", "top"],
  ["bottomId", "bottom"],
  ["shoesId", "shoes"]
]
const MAX_ACCESSORIES = 6

/** Never throws: any input becomes a loadout that the strict rules accept (ownership aside). */
export function coerceAvatarLoadout(
  raw: unknown,
  hints: AvatarLoadoutCoercionHints = {},
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): AvatarLoadout {
  const stored = isRecord(raw) ? raw : {}
  const bodyId = resolveAvatarBodyId(stored.bodyId, hints, rules)
  const starter = starterLoadoutForBody(bodyId, rules)
  const items = Object.fromEntries(
    ITEM_SLOTS.map(([key, slot]) => [key, wearableId(stored[key], slot, bodyId, rules) ?? starter[key]])
  ) as Record<ItemKey, string>
  const base: AvatarLoadoutV1 = {
    schemaVersion: 1,
    bodyId,
    ...items,
    accessoryIds: wearableAccessories(stored.accessoryIds, bodyId, rules)
  }
  if (stored.schemaVersion === 2) {
    return firstValid([
      toV2(base, wearableDressId(stored.dressId, bodyId, rules)),
      toV2(base, null),
      toV2(withStarterOutfit(base, starter), null),
      toV2(cloneAvatarLoadout(starter), null)
    ], rules)
  }
  return firstValid([base, withStarterOutfit(base, starter), cloneAvatarLoadout(starter)], rules)
}

/** The stored body when it is a wearable body; else the preset hint, then gender, then the girl. */
export function resolveAvatarBodyId(
  rawBodyId: unknown,
  hints: AvatarLoadoutCoercionHints = {},
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): string {
  if (isBodyId(rawBodyId, rules)) return rawBodyId
  if (isBodyId(hints.presetId, rules)) return hints.presetId
  return hints.gender === "man" ? rules.starters.male.bodyId : rules.starters.female.bodyId
}

function starterLoadoutForBody(bodyId: string, rules: AvatarItemRules): ReadonlyAvatarLoadout<AvatarLoadoutV1> {
  return avatarStarterLooks(rules).find((starter) => starter.bodyId === bodyId) ?? rules.starters.female
}

function isBodyId(value: unknown, rules: AvatarItemRules): value is string {
  if (typeof value !== "string" || isAvatarItemRetired(rules, value)) return false
  const item = findAvatarRuleItem(rules, value)
  return item?.slot === "body" && item.supportedBodyIds.includes(value) &&
    avatarStarterLooks(rules).some((starter) => starter.bodyId === value)
}

function wearableItem(
  value: unknown,
  slot: AvatarLoadoutSlot,
  bodyId: string,
  rules: AvatarItemRules
): AvatarLoadoutCatalogItem | null {
  if (typeof value !== "string" || isAvatarItemRetired(rules, value)) return null
  const item = findAvatarRuleItem(rules, value)
  return item?.slot === slot && item.supportedBodyIds.includes(bodyId) ? item : null
}

function wearableId(value: unknown, slot: AvatarLoadoutSlot, bodyId: string, rules: AvatarItemRules): string | null {
  return wearableItem(value, slot, bodyId, rules)?.itemId ?? null
}

function wearableAccessories(value: unknown, bodyId: string, rules: AvatarItemRules): string[] {
  if (!Array.isArray(value)) return []
  const kept: AvatarLoadoutCatalogItem[] = []
  for (const candidate of value) {
    const item = wearableItem(candidate, "accessory", bodyId, rules)
    if (!item || kept.length >= MAX_ACCESSORIES) continue
    if (kept.some((other) => other.itemId === item.itemId || other.accessoryGroup === item.accessoryGroup)) continue
    kept.push(item)
  }
  return kept.map((item) => item.itemId)
}

function wearableDressId(value: unknown, bodyId: string, rules: AvatarItemRules): string | null {
  const top = wearableItem(value, "top", bodyId, rules)
  if (!top?.pairedItemId) return null
  return wearableItem(top.pairedItemId, "bottom", bodyId, rules) ? top.itemId : null
}

function withStarterOutfit(
  loadout: AvatarLoadoutV1,
  starter: ReadonlyAvatarLoadout<AvatarLoadoutV1>
): AvatarLoadoutV1 {
  return { ...loadout, topId: starter.topId, bottomId: starter.bottomId, accessoryIds: [...loadout.accessoryIds] }
}

function toV2(loadout: ReadonlyAvatarLoadout<AvatarLoadoutV1>, dressId: string | null): AvatarLoadoutV2 {
  return { ...loadout, schemaVersion: 2, dressId, outerwearId: null, accessoryIds: [...loadout.accessoryIds] }
}

function firstValid(candidates: readonly AvatarLoadout[], rules: AvatarItemRules): AvatarLoadout {
  const allItemIds = rules.items.map((item) => item.itemId)
  for (const candidate of candidates) {
    const result = validateAvatarLoadout(candidate, allItemIds, rules)
    if (result.ok) return result.loadout
  }
  // The last candidate is a starter, which the catalog tests prove valid.
  return cloneAvatarLoadout(candidates[candidates.length - 1])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
