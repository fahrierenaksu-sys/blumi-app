import {
  ECONOMY_CATALOG as DOMAIN_ECONOMY_CATALOG,
  isLegacyItemId,
  isReleaseCatalogItemHeld,
  resolveUnheldEconomyCatalog,
  type EconomyCatalogItem
} from "@blumi/domain"

/** Room ids that are reserved without art: never granted, even to QA. */
const QA_ROOM_GRANT_EXCLUDED_IDS = new Set(["room_v3_bed_blumi_starter"])

/**
 * Simulator QA on the memory server needs to sit on furniture that is still held for pricing. With
 * `BLUMI_QA_ROOM_GRANT=1` the MEMORY server runs a catalog in which the held, non-retired room pieces are owned by
 * default (so the inventory self-heal grants them and placement accepts them). They stay held: the purchase refusal
 * and every client hold filter are untouched. Refused at start-up under `NODE_ENV=production`, with a deploy
 * environment, or with any repository but memory, so no deployed server can run it. Server-only: the mobile bundle
 * never imports it.
 */
export function resolveQaRoomGrantCatalog(input: {
  env: Readonly<Record<string, string | undefined>>
  authRepositoryMode: string
}): readonly EconomyCatalogItem[] | undefined {
  const flag = input.env.BLUMI_QA_ROOM_GRANT?.trim()
  if (!flag || flag === "0") return undefined
  if (flag !== "1") throw new Error("BLUMI_QA_ROOM_GRANT must be 1 or unset.")
  if (
    input.env.NODE_ENV === "production" ||
    input.env.BLUMI_DEPLOY_ENV?.trim() ||
    input.authRepositoryMode !== "memory"
  ) {
    throw new Error("BLUMI_QA_ROOM_GRANT is only allowed on a local memory server.")
  }
  const granted = DOMAIN_ECONOMY_CATALOG
    .filter((item) =>
      item.type === "room" &&
      isReleaseCatalogItemHeld(item.itemId) &&
      !isLegacyItemId(item.itemId) &&
      !QA_ROOM_GRANT_EXCLUDED_IDS.has(item.itemId)
    )
    .map((item) => ({ ...item, ownedByDefault: true }))
  return Object.freeze([...resolveUnheldEconomyCatalog(DOMAIN_ECONOMY_CATALOG), ...granted])
}
