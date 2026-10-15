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

/**
 * A save that still carries retired item IDs (an older app build, or a look loaded before the retirement) is checked
 * as the user sees it: each retired piece becomes that body's starter piece, exactly as every read draws it, and a
 * retired accessory, dress or outerwear is taken off. A retired piece the user still wears is put back before storing
 * (`keepWornRetiredAvatarItems`). Everything else is left for the strict save rules
 * (`validateAvatarLoadout`), which still refuse unknown, unowned or ill-fitting items. A retired body is left as it is
 * (and refused), so a save never switches the body. Inventories are untouched: retired pieces stay owned.
 */
export function replaceRetiredAvatarItems(
  loadout: AvatarLoadout,
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): AvatarLoadout {
  const isRetired = (itemId: string | null): boolean => itemId !== null && isAvatarItemRetired(rules, itemId)
  const starter = starterLoadoutForBody(loadout.bodyId, rules)
  const items = Object.fromEntries(
    ITEM_SLOTS.map(([key]) => [key, isRetired(loadout[key]) ? starter[key] : loadout[key]])
  ) as Record<ItemKey, string>
  const accessoryIds = loadout.accessoryIds.filter((itemId) => !isRetired(itemId))
  if (loadout.schemaVersion !== 2) return { ...loadout, ...items, accessoryIds }
  return {
    ...loadout,
    ...items,
    accessoryIds,
    dressId: isRetired(loadout.dressId) ? null : loadout.dressId,
    outerwearId: isRetired(loadout.outerwearId) ? null : loadout.outerwearId
  }
}

export interface WornRetiredAvatarItemsInput {
  /** The loadout the strict save rules accepted (`replaceRetiredAvatarItems` then `validateAvatarLoadout`). */
  readonly saved: AvatarLoadout
  /** The loadout the client sent. */
  readonly requested: AvatarLoadout
  /** The account's loadout exactly as stored, retired IDs included (never the coerced read). */
  readonly stored: unknown
  /** The account's owned avatar items, from the server inventory. */
  readonly ownedItemIds: readonly string[]
}

/**
 * Never lose user data (lead decision 2026-10-15): a retired piece the user still wears stays stored. Every read draws
 * it as the body's starter piece, so the current app shows that starter and sends it back on its next save, and an
 * older build sends the retired ID itself; neither is a change of the slot, so the stored retired ID is kept there. It
 * is kept only when the body is unchanged, the account owns it, it fits that slot and body, and the accepted loadout
 * holds the starter piece in that slot. Any other piece in the request is a real change and replaces it; a retired ID
 * that is new for a slot stays the starter piece. A retired accessory stays on unless the request takes another one
 * of its group or the list is full (the app cannot show it, so it cannot take it off; an older build that drops it is
 * read the same way). Dress and outerwear are not kept (no retired one exists). The result always reads exactly as
 * `saved` (`coerceAvatarLoadout`); if it would not, `saved` is returned. Ownership stays the server's: nothing here
 * adds an item the account does not own.
 */
export function keepWornRetiredAvatarItems(
  input: WornRetiredAvatarItemsInput,
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): AvatarLoadout {
  const { saved, requested } = input
  const stored = isRecord(input.stored) ? input.stored : null
  if (!stored || stored.bodyId !== saved.bodyId) return saved
  const owned = new Set(input.ownedItemIds)
  const starter = starterLoadoutForBody(saved.bodyId, rules)
  const keptRetired = (value: unknown, slot: AvatarLoadoutSlot): value is string =>
    typeof value === "string" && isAvatarItemRetired(rules, value) && owned.has(value) &&
    findAvatarRuleItem(rules, value)?.slot === slot &&
    (findAvatarRuleItem(rules, value)?.supportedBodyIds.includes(saved.bodyId) ?? false)
  const items = Object.fromEntries(ITEM_SLOTS.map(([key, slot]) => {
    const storedId = stored[key]
    const unchanged = requested[key] === storedId || requested[key] === starter[key]
    const keep = saved[key] === starter[key] && unchanged && keptRetired(storedId, slot)
    return [key, keep ? storedId : saved[key]]
  })) as Record<ItemKey, string>
  const kept: AvatarLoadout = { ...saved, ...items, accessoryIds: withWornRetiredAccessories(saved, stored, keptRetired, rules) }
  return readsAs(kept, saved, rules) ? kept : saved
}

function withWornRetiredAccessories(
  saved: AvatarLoadout,
  stored: Record<string, unknown>,
  keptRetired: (value: unknown, slot: AvatarLoadoutSlot) => value is string,
  rules: AvatarItemRules
): string[] {
  const accessoryIds = [...saved.accessoryIds]
  const groupOf = (itemId: string) => findAvatarRuleItem(rules, itemId)?.accessoryGroup
  const storedIds = Array.isArray(stored.accessoryIds) ? stored.accessoryIds : []
  for (const storedId of storedIds) {
    if (!keptRetired(storedId, "accessory") || accessoryIds.length >= MAX_ACCESSORIES) continue
    if (accessoryIds.some((itemId) => itemId === storedId || groupOf(itemId) === groupOf(storedId))) continue
    accessoryIds.push(storedId)
  }
  return accessoryIds
}

function readsAs(kept: AvatarLoadout, saved: AvatarLoadout, rules: AvatarItemRules): boolean {
  const read = (loadout: AvatarLoadout) => JSON.stringify(coerceAvatarLoadout(loadout, {}, rules))
  return read(kept) === read(saved)
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
  const onePiece = wearableItem(value, "dress", bodyId, rules)
  if (onePiece) return onePiece.itemId
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
