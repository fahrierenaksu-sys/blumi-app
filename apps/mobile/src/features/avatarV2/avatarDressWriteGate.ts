import type { AvatarLoadout, CapabilityMap } from "@blumi/contracts"
import type { AvatarItemType } from "./avatarV2.types"

/**
 * One-piece dresses and the server's V2 loadout write (review slots_1330 HIGH-2).
 *
 * A one-piece dress exists only in loadout V2 (`dressId`); the V1 form has no field for it. Until the server resolves
 * `avatar_loadout_v2_write` (a rollout capability that needs the owner's yes), the app saves V1 and the server keeps a
 * dress only when one is already stored. So without that capability a one-piece dress is not offered at all, and a
 * save whose answer lost the worn dress is reported, never treated as a silent success. Glasses, accessories and legacy
 * paired dresses (a top + bottom pair) travel in V1 and are not affected.
 */

export const ONE_PIECE_DRESS_UNAVAILABLE_MESSAGE = "Elbiseler şu an giyilip kaydedilemiyor."
export const ONE_PIECE_DRESS_NOT_SAVED_MESSAGE =
  "Elbisen kaydedilemedi, çünkü elbiseler şu an kaydedilemiyor. Kıyafetinin geri kalanı kaydedildi."

export function canSaveOnePieceDress(capabilities?: Partial<CapabilityMap>): boolean {
  return capabilities?.avatar_loadout_v2_write === true
}

/** Whether wearing this item can be saved with the server's current capabilities. */
export function isAvatarItemSavable(
  item: { readonly type: AvatarItemType },
  capabilities?: Partial<CapabilityMap>
): boolean {
  return item.type !== "dress" || canSaveOnePieceDress(capabilities)
}

/** The catalog without the items that cannot be saved yet (a new array; the catalog is never changed). */
export function filterSavableAvatarCatalog<T extends { readonly type: AvatarItemType }>(
  catalog: readonly T[],
  capabilities?: Partial<CapabilityMap>
): T[] {
  return catalog.filter((item) => isAvatarItemSavable(item, capabilities))
}

/** True when the request wore a dress and the server's saved loadout does not. */
export function lostRequestedDress(requested: AvatarLoadout, saved: AvatarLoadout): boolean {
  if (requested.schemaVersion !== 2 || requested.dressId === null) return false
  return saved.schemaVersion !== 2 || saved.dressId !== requested.dressId
}
