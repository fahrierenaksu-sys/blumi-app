import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import { ECONOMY_CATALOG, type EconomyCatalogItem } from "./economyCatalog"

/**
 * Test-only stand-ins (ids outside the held `test_` QA scope) for the room mechanics tests (purchase, starter grant, placement). The live room catalog has
 * no active, sellable piece until the starter bed's art lands and priced furniture leaves the hold, so the tests
 * pass this catalog to `createEconomyService({ catalog })` instead of borrowing retired ids. Never wired at start-up.
 */
export const TEST_ROOM_STARTER_ITEM_ID = "standin_room_starter_bed"
export const TEST_ROOM_PAID_ITEM_ID = "standin_room_side_table"
export const TEST_ROOM_PAID_ITEM_PRICE = 240

export const TEST_ROOM_ECONOMY_CATALOG: readonly EconomyCatalogItem[] = Object.freeze([
  ...ECONOMY_CATALOG,
  { itemId: TEST_ROOM_STARTER_ITEM_ID, type: "room", title: "Test Starter Bed", priceCoins: 0, ownedByDefault: true },
  { itemId: TEST_ROOM_PAID_ITEM_ID, type: "room", title: "Test Side Table", priceCoins: TEST_ROOM_PAID_ITEM_PRICE }
])

/**
 * Plan X15 retired every old avatarV2 item and made the 2.5D starters free, so the live catalog sells no avatar
 * item at all, and each body has exactly one active piece per slot. The avatar purchase mechanics tests (price,
 * balance, body fit, grants, races, equip ownership) therefore price the girl's real, active starter top as paid
 * in this test-only catalog; a test account must buy it before it can save the girl's starter look. Never wired
 * at start-up.
 */
export const TEST_AVATAR_PAID_ITEM_ID = DEFAULT_FEMALE_AVATAR_LOADOUT.topId
export const TEST_AVATAR_PAID_ITEM_PRICE = 410
/** Stands in for a dress in `TEST_OUTFIT_ECONOMY_CATALOG`: buying the top also grants this bottom. */
export const TEST_AVATAR_OUTFIT_GRANTED_ITEM_ID = DEFAULT_FEMALE_AVATAR_LOADOUT.bottomId

function priceAvatarStandIns(
  prices: ReadonlyMap<string, Pick<EconomyCatalogItem, "priceCoins" | "grantedItemIds">>
): readonly EconomyCatalogItem[] {
  return Object.freeze(TEST_ROOM_ECONOMY_CATALOG.map((item): EconomyCatalogItem => {
    const priced = prices.get(item.itemId)
    if (!priced || item.type !== "avatar") return item
    return { itemId: item.itemId, type: item.type, title: item.title, ...priced }
  }))
}

/** The room stand-ins plus the girl's starter top as a paid avatar item (no longer owned by default). */
export const TEST_ECONOMY_CATALOG: readonly EconomyCatalogItem[] = priceAvatarStandIns(new Map([
  [TEST_AVATAR_PAID_ITEM_ID, { priceCoins: TEST_AVATAR_PAID_ITEM_PRICE }]
]))

/** Like `TEST_ECONOMY_CATALOG`, but the paid top is an outfit that grants the (then paid) starter bottom. */
export const TEST_OUTFIT_ECONOMY_CATALOG: readonly EconomyCatalogItem[] = priceAvatarStandIns(new Map([
  [TEST_AVATAR_PAID_ITEM_ID, { priceCoins: TEST_AVATAR_PAID_ITEM_PRICE, grantedItemIds: [TEST_AVATAR_OUTFIT_GRANTED_ITEM_ID] }],
  [TEST_AVATAR_OUTFIT_GRANTED_ITEM_ID, { priceCoins: TEST_AVATAR_PAID_ITEM_PRICE }]
]))
