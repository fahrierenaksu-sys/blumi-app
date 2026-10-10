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
