import type { AvatarCatalogItem, UserAvatar } from "../avatarV2/avatarV2.types"
import {
  isAvatarShopItemPreviewing,
  restoreAvatarShopItemPreview
} from "./shopAvatarDraft"

/**
 * What the small X on a Shop card does. It only ever changes what the avatar
 * wears; ownership, coins and purchases are never touched.
 *
 * - `undo_try_on`: the card's item is tried on in the Shop draft but is not
 *   part of the saved look. The X puts the saved item for that slot back on
 *   the draft. Nothing is saved.
 * - `unequip`: the card's item is part of the saved look and its slot may be
 *   empty (accessories). The X takes it off the draft and saves the look
 *   through the existing server-authoritative avatar save, the same path the
 *   wardrobe uses to take an accessory off.
 * - `none`: no X. Required slots (hair, top, bottom, shoes, face parts, body)
 *   always wear something, so a saved item there is replaced, not removed.
 */
export type ShopCardRemoveAction = "none" | "undo_try_on" | "unequip"

/** Item types whose slot may be left empty on a saved avatar. */
const UNEQUIPPABLE_ITEM_TYPES: ReadonlySet<AvatarCatalogItem["type"]> = new Set(["accessory"])

export function getShopCardRemoveAction(input: {
  item: AvatarCatalogItem | undefined
  /** The avatar the Shop preview shows (the combination draft). */
  draft: UserAvatar
  /** The saved avatar. */
  equipped: UserAvatar
  /** Server-verified ownership of the item. */
  owned: boolean
  /** Inventory verified, online, and no purchase or save running. */
  canSave: boolean
}): ShopCardRemoveAction {
  const { item, draft, equipped } = input
  if (!item || !isAvatarShopItemPreviewing(draft, item)) return "none"
  if (!isAvatarShopItemPreviewing(equipped, item)) return "undo_try_on"
  if (!UNEQUIPPABLE_ITEM_TYPES.has(item.type)) return "none"
  return input.owned && input.canSave ? "unequip" : "none"
}

/**
 * The draft after the X. For `unequip` it also returns the saved look the
 * Shop expects once the save succeeds (only that one item taken off), so the
 * combination can be rebased onto it. `none` returns null.
 */
export function applyShopCardRemoveAction(input: {
  action: ShopCardRemoveAction
  item: AvatarCatalogItem
  draft: UserAvatar
  equipped: UserAvatar
  catalog: readonly AvatarCatalogItem[]
}): { draft: UserAvatar; savedAvatar: UserAvatar | null } | null {
  const { action, item, draft, equipped, catalog } = input
  if (action === "undo_try_on") {
    return {
      draft: restoreAvatarShopItemPreview(draft, equipped, item, catalog),
      savedAvatar: null
    }
  }
  if (action === "unequip") {
    return {
      draft: withoutAccessory(draft, item.id),
      savedAvatar: withoutAccessory(equipped, item.id)
    }
  }
  return null
}

function withoutAccessory(avatar: UserAvatar, itemId: string): UserAvatar {
  return { ...avatar, accessoryIds: avatar.accessoryIds.filter((id) => id !== itemId) }
}
