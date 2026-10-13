import { TEST_AVATAR_ECONOMY_ITEMS, TEST_AVATAR_ITEM, TEST_AVATAR_TOP_PRICE } from "@blumi/domain"
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

/** Every room id the test catalog gives each account by default, in catalog order (the stand-in and the real starter bed). */
export const TEST_ROOM_DEFAULT_OWNED_IDS: readonly string[] = Object.freeze(
  TEST_ROOM_ECONOMY_CATALOG.filter((item) => item.type === "room" && item.ownedByDefault === true).map((item) => item.itemId)
)

/**
 * Plan X15 retired every old avatarV2 item and the live catalog now sells no avatar item, with one active piece
 * per slot and no dress or accessory. The avatar purchase and equip tests (price, balance, body fit, dress grants,
 * races, ownership) therefore run on the domain's test-only fixture catalog (`TEST_AVATAR_ITEM_RULES`, IDs
 * `fixture_avatar_*`): pass `TEST_ECONOMY_CATALOG` as the economy `catalog` and `TEST_AVATAR_ITEM_RULES` as
 * `avatarRules`. Never wired at start-up.
 */
export const TEST_AVATAR_PAID_ITEM_ID = TEST_AVATAR_ITEM.girlTopPaid
export const TEST_AVATAR_PAID_ITEM_PRICE = TEST_AVATAR_TOP_PRICE
export const TEST_AVATAR_DRESS_ID = TEST_AVATAR_ITEM.dressTop
export const TEST_AVATAR_DRESS_BOTTOM_ID = TEST_AVATAR_ITEM.dressBottom
export const TEST_AVATAR_GIRL_BODY_ID = TEST_AVATAR_ITEM.girlBody
export const TEST_AVATAR_BOY_BODY_ID = TEST_AVATAR_ITEM.boyBody

/** The room stand-ins plus the fixture avatar items; no live avatar item. */
export const TEST_ECONOMY_CATALOG: readonly EconomyCatalogItem[] = Object.freeze([
  ...TEST_ROOM_ECONOMY_CATALOG.filter((item) => item.type === "room"),
  ...TEST_AVATAR_ECONOMY_ITEMS
])
