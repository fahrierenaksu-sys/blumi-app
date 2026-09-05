import type {
  AvatarCatalogItem,
  AvatarInventory,
  UserAvatar
} from "../avatarV2.types"
import { MALE_PREMIUM_CAPSULE_RUNTIME } from "../malePremiumCapsulePilotDefinitions"

/**
 * Disposable avatar QA is intentionally development-only. These ids are
 * merged into a copied inventory and are never written to the user's real
 * inventory or remote ownership record.
 */
const DEFAULT_QA_AVATAR_ITEM_IDS = [
  "avatar_v2_top_default",
  "avatar_v2_bottom_default",
  "avatar_v2_shoes_milk_tea_court_sneakers"
] as const

const PREMIUM_MALE_QA_AVATAR_ITEM_IDS = MALE_PREMIUM_CAPSULE_RUNTIME.map(
  ({ type, slug }) =>
    `avatar_v2_${type === "hairFront" ? "hair" : type}_male_${slug}`
)

export const BLUMI_QA_AVATAR_ITEM_IDS: readonly string[] = [
  ...DEFAULT_QA_AVATAR_ITEM_IDS,
  ...PREMIUM_MALE_QA_AVATAR_ITEM_IDS
]

export function isAvatarQaUnlockEnabled(
  isDevelopment: boolean,
  rawFlag: string | undefined
): boolean {
  return isDevelopment && rawFlag?.trim() === "1"
}

export function createAvatarQaInventory(
  ownedItemIds: string[],
  enabled: boolean
): AvatarInventory {
  return {
    ownedItemIds: enabled
      ? [...new Set([...ownedItemIds, ...BLUMI_QA_AVATAR_ITEM_IDS])]
      : [...ownedItemIds]
  }
}

export function applyDisposableAvatarEquip(
  current: UserAvatar,
  item: AvatarCatalogItem,
  equip: (avatar: UserAvatar, selected: AvatarCatalogItem) => UserAvatar
): UserAvatar {
  return equip(current, item)
}

export function getAvatarQaPersistencePolicy(enabled: boolean): {
  allowLocalPersistence: boolean
  allowRemotePersistence: boolean
} {
  return enabled
    ? { allowLocalPersistence: false, allowRemotePersistence: false }
    : { allowLocalPersistence: true, allowRemotePersistence: true }
}

export function getAvatarAutomationSlug(itemId: string): string {
  return itemId.replace(
    /^avatar_v2_(body|face|eyes|nose|mouth|hair|top|bottom|shoes|accessory)_/,
    ""
  )
}
