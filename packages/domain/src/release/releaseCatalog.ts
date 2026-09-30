import blumiR1ReleaseCatalog from "./blumiR1ReleaseCatalog.json"
import type { EconomyCatalogItem } from "../economy/economyCatalog"

export const RELEASE_CATALOG_SCHEMA_VERSION = "blumi-release-catalog-v1" as const
export const ASSET_PROMOTION_RECEIPT_SCHEMA_VERSION =
  "blumi-asset-promotion-receipt-v1" as const

export type ReleaseCatalogItemType = "avatar" | "room"

export interface ReleaseCatalogAssetBinding {
  readonly path: string
  readonly sha256: string
}

/**
 * An item is publishable only with this receipt. `assets` lists every runtime
 * file the mobile app resolves for the item (Shop thumbnail and preview,
 * AvatarV2 layer, Room/MiniRoom layers and motion frames, furniture sprites),
 * each with its SHA-256; `evidence` points at the decision record.
 *
 * `apps/mobile/src/features/shop/shopReleaseCatalog.test.ts` (run by
 * `npm test`) enforces this: it hashes every bound file and the evidence
 * manifest in the working tree, re-resolves each item's assets from the live
 * resolvers, and, when `sourceCommit` is present in the local clone, checks
 * that the commit tree holds the same bytes. Nothing checks at runtime.
 */
export interface AssetPromotionReceipt {
  readonly schemaVersion: typeof ASSET_PROMOTION_RECEIPT_SCHEMA_VERSION
  readonly receiptId: string
  readonly sourceCommit: string
  readonly independentReviewer: string
  readonly reviewedAt: string
  readonly evidence: {
    readonly manifestPath: string
    readonly manifestSha256: string
  }
  readonly assets: readonly ReleaseCatalogAssetBinding[]
}

export interface ReleaseCatalogPublishedItem {
  readonly itemId: string
  readonly itemType: ReleaseCatalogItemType
  readonly receipt: AssetPromotionReceipt
}

export interface ReleaseCatalogHeldScope {
  readonly scope: string
  readonly productionPublication: false
  readonly itemIdPatterns: readonly string[]
}

export interface ReleaseCatalog {
  readonly schemaVersion: typeof RELEASE_CATALOG_SCHEMA_VERSION
  readonly catalogId: string
  readonly releaseLine: "r1"
  readonly publishedItems: readonly ReleaseCatalogPublishedItem[]
  readonly heldScopes: readonly ReleaseCatalogHeldScope[]
  readonly productionPolicy: {
    readonly allowedBuildProfiles: readonly ("preview" | "production")[]
    readonly forbiddenRuntimeFlags: readonly string[]
  }
}

/**
 * This is the only R1 publication source for paid items. The owner-approved
 * items (decision record `docs/quality/SHOP_CATALOG_PUBLICATION_2026-09-30.md`)
 * are listed with receipts. Held scopes name items that must stay out of
 * production (Room V3 candidates, QA/dev IDs, promotion holds). Retired avatar
 * items (`RETIRED_AVATAR_ITEM_IDS`) are never published.
 */
export const BLUMI_R1_RELEASE_CATALOG =
  blumiR1ReleaseCatalog as unknown as ReleaseCatalog

export function resolvePublishedReleaseCatalogItemIds(
  catalog: ReleaseCatalog = BLUMI_R1_RELEASE_CATALOG
): string[] {
  return catalog.publishedItems.map((item) => item.itemId)
}

export function isReleaseCatalogItemPublished(
  itemId: string,
  catalog: ReleaseCatalog = BLUMI_R1_RELEASE_CATALOG
): boolean {
  return catalog.publishedItems.some((item) => item.itemId === itemId)
}

/**
 * R1 never removes a user's starter loadout, but it does remove every paid
 * product that is absent from the immutable publication catalog. This is the
 * one runtime projection mobile Shop and server economy must use for a
 * production build; callers receive fresh item objects.
 */
export function resolveR1PublishedEconomyCatalog(
  catalog: readonly EconomyCatalogItem[],
  releaseCatalog: ReleaseCatalog = BLUMI_R1_RELEASE_CATALOG
): EconomyCatalogItem[] {
  return catalog
    .filter(
      (item) =>
        item.ownedByDefault === true ||
        isReleaseCatalogItemPublished(item.itemId, releaseCatalog)
    )
    .map((item) => ({
      ...item,
      grantedItemIds: item.grantedItemIds ? [...item.grantedItemIds] : undefined
    }))
}
