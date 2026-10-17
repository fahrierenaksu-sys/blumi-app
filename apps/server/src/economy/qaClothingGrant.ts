import {
  AVATAR_ITEM_RULES,
  ECONOMY_CATALOG as DOMAIN_ECONOMY_CATALOG,
  isAvatarItemRetired,
  isLegacyItemId,
  isReleaseCatalogItemHeld,
  type ReleaseCatalog
} from "@blumi/domain"
import type { AuthRepository } from "../auth/authRepository"

/** Grants for one user: the held clothing a local QA account owns (empty for everyone else). */
export type QaClothingGrant = (userId: string) => Promise<readonly string[]>

/** Held (receipt pending), non-legacy, non-retired avatar pieces: what the local QA accounts may wear. */
function heldClothingItemIds(releaseCatalog: ReleaseCatalog | undefined): readonly string[] {
  return Object.freeze(DOMAIN_ECONOMY_CATALOG
    .filter((item) =>
      item.type === "avatar" &&
      isReleaseCatalogItemHeld(item.itemId, releaseCatalog) &&
      !isLegacyItemId(item.itemId) &&
      !isAvatarItemRetired(AVATAR_ITEM_RULES, item.itemId))
    .map((item) => item.itemId))
}

/**
 * Simulator QA on the memory server needs to wear the new collection before its receipts land. With local QA auth on
 * (`config.qaAuth`: BLUMI_QA_AUTH_ENABLED=1, which resolveServerConfig accepts only in development, on a loopback HOST,
 * with the memory repository, the development SMS provider and fictional 555 numbers, and refuses under
 * NODE_ENV=production), the listed QA accounts own the held clothing through the inventory self-heal, so the wardrobe
 * lists it and a loadout save accepts it. Nobody else gets it, and the items stay held: purchase refusal, Shop
 * publication and every client hold filter are untouched. No new environment variable; server-only.
 */
export function resolveQaClothingGrant(input: {
  qaAuth: Readonly<{ phoneNumbers: readonly string[] }> | undefined
  nodeEnv: string
  authRepositoryMode: string
  authRepository: Pick<AuthRepository, "findAccountByUserId">
  /** Which items are held. Defaults to the R1 release catalog; only tests pass another, to hold a fixture piece. */
  releaseCatalog?: ReleaseCatalog
}): QaClothingGrant | undefined {
  if (!input.qaAuth) return undefined
  // belt and braces: resolveServerConfig already refuses QA auth outside a local development memory server
  if (input.nodeEnv !== "development" || input.authRepositoryMode !== "memory") {
    throw new Error("The QA clothing grant is only allowed on a local development memory server.")
  }
  const qaPhoneNumbers = new Set(input.qaAuth.phoneNumbers)
  const grantedItemIds = heldClothingItemIds(input.releaseCatalog)
  return async (userId) => {
    const account = await input.authRepository.findAccountByUserId(userId)
    return account && qaPhoneNumbers.has(account.phoneNumber) ? grantedItemIds : []
  }
}
