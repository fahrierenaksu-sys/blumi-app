import type { AvatarLoadoutV1 } from "@blumi/contracts"
import {
  AVATAR_LOADOUT_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  type AvatarLoadoutCatalogItem,
  type ReadonlyAvatarLoadout
} from "./avatarLoadoutCatalog"
import { RETIRED_AVATAR_ITEM_IDS } from "./retiredAvatarItems"

/**
 * The item facts the avatar loadout rules read: which items exist (slot, body fit, dress pairs, accessory
 * groups), which are retired, and each body's starter look. Every rule function takes it as an optional last
 * argument whose default is the live catalog (`AVATAR_ITEM_RULES`), so production callers pass nothing. Tests
 * pass a fixture catalog, so the rules (dress pairs, accessory groups, retired items, body fit, ownership) stay
 * covered whatever the live catalog happens to sell.
 */
export interface AvatarItemRules {
  readonly items: readonly AvatarLoadoutCatalogItem[]
  readonly retiredItemIds: ReadonlySet<string>
  readonly starters: {
    /** Also the fallback look for an unknown body. */
    readonly female: ReadonlyAvatarLoadout<AvatarLoadoutV1>
    readonly male: ReadonlyAvatarLoadout<AvatarLoadoutV1>
  }
}

export const AVATAR_ITEM_RULES: AvatarItemRules = Object.freeze({
  items: AVATAR_LOADOUT_CATALOG,
  retiredItemIds: RETIRED_AVATAR_ITEM_IDS,
  starters: Object.freeze({ female: DEFAULT_FEMALE_AVATAR_LOADOUT, male: DEFAULT_MALE_AVATAR_LOADOUT })
})

const ITEM_INDEX = new WeakMap<AvatarItemRules, ReadonlyMap<string, AvatarLoadoutCatalogItem>>()

export function findAvatarRuleItem(
  rules: AvatarItemRules,
  itemId: string
): AvatarLoadoutCatalogItem | undefined {
  let index = ITEM_INDEX.get(rules)
  if (!index) {
    index = new Map(rules.items.map((item) => [item.itemId, item]))
    ITEM_INDEX.set(rules, index)
  }
  return index.get(itemId)
}

export function isAvatarItemRetired(rules: AvatarItemRules, itemId: string): boolean {
  return rules.retiredItemIds.has(itemId)
}

export function avatarStarterLooks(rules: AvatarItemRules): readonly ReadonlyAvatarLoadout<AvatarLoadoutV1>[] {
  return [rules.starters.female, rules.starters.male]
}

/** True when the body exists in `rules` and the item is fitted for it (a body item fits only itself). */
export function isAvatarLoadoutItemCompatibleWithBody(
  itemId: string,
  bodyId: string,
  rules: AvatarItemRules = AVATAR_ITEM_RULES
): boolean {
  const body = findAvatarRuleItem(rules, bodyId)
  if (body?.slot !== "body" || !body.supportedBodyIds.includes(bodyId)) return false
  const item = findAvatarRuleItem(rules, itemId)
  if (!item) return false
  if (item.slot === "body") return item.itemId === bodyId
  return item.supportedBodyIds.includes(bodyId)
}
