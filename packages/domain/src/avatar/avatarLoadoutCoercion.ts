import type { AvatarLoadout, AvatarLoadoutV1, AvatarLoadoutV2 } from "@blumi/contracts"
import {
  AVATAR_LOADOUT_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  type AvatarLoadoutCatalogItem,
  type AvatarLoadoutSlot,
  type ReadonlyAvatarLoadout
} from "./avatarLoadoutCatalog"
import { cloneAvatarLoadout, validateAvatarLoadout } from "./avatarLoadoutRules"
import { isRetiredAvatarItemId } from "./retiredAvatarItems"

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
const STARTERS: readonly ReadonlyAvatarLoadout<AvatarLoadoutV1>[] = [
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT
]
const ALL_CATALOG_ITEM_IDS = AVATAR_LOADOUT_CATALOG.map((item) => item.itemId)
const CATALOG_BY_ID = new Map(AVATAR_LOADOUT_CATALOG.map((item) => [item.itemId, item]))

/** Never throws: any input becomes a loadout that the strict rules accept (ownership aside). */
export function coerceAvatarLoadout(
  raw: unknown,
  hints: AvatarLoadoutCoercionHints = {}
): AvatarLoadout {
  const stored = isRecord(raw) ? raw : {}
  const bodyId = resolveAvatarBodyId(stored.bodyId, hints)
  const starter = starterLoadoutForBody(bodyId)
  const items = Object.fromEntries(
    ITEM_SLOTS.map(([key, slot]) => [key, wearableId(stored[key], slot, bodyId) ?? starter[key]])
  ) as Record<ItemKey, string>
  const base: AvatarLoadoutV1 = {
    schemaVersion: 1,
    bodyId,
    ...items,
    accessoryIds: wearableAccessories(stored.accessoryIds, bodyId)
  }
  if (stored.schemaVersion === 2) {
    return firstValid([
      toV2(base, wearableDressId(stored.dressId, bodyId)),
      toV2(base, null),
      toV2(withStarterOutfit(base, starter), null),
      toV2(cloneAvatarLoadout(starter), null)
    ])
  }
  return firstValid([base, withStarterOutfit(base, starter), cloneAvatarLoadout(starter)])
}

/** The stored body when it is a wearable body; else the preset hint, then gender, then the girl. */
export function resolveAvatarBodyId(rawBodyId: unknown, hints: AvatarLoadoutCoercionHints = {}): string {
  if (isBodyId(rawBodyId)) return rawBodyId
  if (isBodyId(hints.presetId)) return hints.presetId
  return hints.gender === "man" ? DEFAULT_MALE_AVATAR_LOADOUT.bodyId : DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId
}

function starterLoadoutForBody(bodyId: string): ReadonlyAvatarLoadout<AvatarLoadoutV1> {
  return STARTERS.find((starter) => starter.bodyId === bodyId) ?? DEFAULT_FEMALE_AVATAR_LOADOUT
}

function isBodyId(value: unknown): value is string {
  if (typeof value !== "string" || isRetiredAvatarItemId(value)) return false
  const item = CATALOG_BY_ID.get(value)
  return item?.slot === "body" && item.supportedBodyIds.includes(value) &&
    STARTERS.some((starter) => starter.bodyId === value)
}

function wearableItem(value: unknown, slot: AvatarLoadoutSlot, bodyId: string): AvatarLoadoutCatalogItem | null {
  if (typeof value !== "string" || isRetiredAvatarItemId(value)) return null
  const item = CATALOG_BY_ID.get(value)
  return item?.slot === slot && item.supportedBodyIds.includes(bodyId) ? item : null
}

function wearableId(value: unknown, slot: AvatarLoadoutSlot, bodyId: string): string | null {
  return wearableItem(value, slot, bodyId)?.itemId ?? null
}

function wearableAccessories(value: unknown, bodyId: string): string[] {
  if (!Array.isArray(value)) return []
  const kept: AvatarLoadoutCatalogItem[] = []
  for (const candidate of value) {
    const item = wearableItem(candidate, "accessory", bodyId)
    if (!item || kept.length >= MAX_ACCESSORIES) continue
    if (kept.some((other) => other.itemId === item.itemId || other.accessoryGroup === item.accessoryGroup)) continue
    kept.push(item)
  }
  return kept.map((item) => item.itemId)
}

function wearableDressId(value: unknown, bodyId: string): string | null {
  const top = wearableItem(value, "top", bodyId)
  if (!top?.pairedItemId) return null
  return wearableItem(top.pairedItemId, "bottom", bodyId) ? top.itemId : null
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

function firstValid(candidates: readonly AvatarLoadout[]): AvatarLoadout {
  for (const candidate of candidates) {
    const result = validateAvatarLoadout(candidate, ALL_CATALOG_ITEM_IDS)
    if (result.ok) return result.loadout
  }
  // The last candidate is a starter, which the catalog tests prove valid.
  return cloneAvatarLoadout(candidates[candidates.length - 1])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
