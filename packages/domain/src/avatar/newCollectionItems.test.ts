import assert from "node:assert/strict"
import test from "node:test"
import { AVATAR_LOADOUT_CATALOG } from "./avatarLoadoutCatalog"
import {
  NEW_COLLECTION_ITEMS,
  NEW_COLLECTION_ITEM_IDS,
  NEW_COLLECTION_LANDED_ITEM_IDS,
  OWNER_APPROVED_PRICE_COINS
} from "./newCollectionItems"
import { isRetiredAvatarItemId } from "./retiredAvatarItems"
import { ECONOMY_CATALOG, getDefaultOwnedItemIds } from "../economy/economyCatalog"
import {
  isReleaseCatalogItemHeld,
  isReleaseCatalogItemPublished,
  resolveR1PublishedEconomyCatalog,
  resolveUnheldEconomyCatalog
} from "../release/releaseCatalog"

const WARDROBE_NAME_LINE_CHARS = 13
const wrapName = (name: string): string[] => name.split(" ").reduce<string[]>((lines, word) => {
  const last = lines.at(-1)
  return last !== undefined && `${last} ${word}`.length <= WARDROBE_NAME_LINE_CHARS
    ? [...lines.slice(0, -1), `${last} ${word}`]
    : [...lines, word]
}, [])

test("a new collection piece without its receipt is never sold, listed or granted in any build", () => {
  const defaultOwned = new Set(getDefaultOwnedItemIds("avatar"))
  const unheld = new Set(resolveUnheldEconomyCatalog(ECONOMY_CATALOG).map((item) => item.itemId))
  const published = new Set(resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG).map((item) => item.itemId))
  const unreceipted = NEW_COLLECTION_ITEM_IDS.filter((itemId) => !isReleaseCatalogItemPublished(itemId))
  assert.ok(unreceipted.length > 0, "the guard scanned the pending pieces")
  for (const itemId of unreceipted) {
    assert.equal(isReleaseCatalogItemHeld(itemId), true, `${itemId} is held until its receipt lands`)
    assert.equal(unheld.has(itemId), false, `${itemId} is not sellable in development builds`)
    assert.equal(published.has(itemId), false, `${itemId} is not in the production projection`)
    assert.equal(defaultOwned.has(itemId), false, `${itemId} is not granted to every account`)
  }
})

test("a new collection piece joins the catalogs only once its art has landed", () => {
  assert.ok(NEW_COLLECTION_ITEMS.length > 0, "the guard scanned the collection")
  for (const item of NEW_COLLECTION_ITEMS) {
    if (NEW_COLLECTION_LANDED_ITEM_IDS.has(item.itemId)) continue
    assert.equal(AVATAR_LOADOUT_CATALOG.some((row) => row.itemId === item.itemId), false, `${item.itemId} is not wearable yet`)
    assert.equal(ECONOMY_CATALOG.some((row) => row.itemId === item.itemId), false, `${item.itemId} has no economy row yet`)
  }
})

test("every landed new collection piece is priced and loadout-valid only for its own body and slot", () => {
  assert.equal(new Set(NEW_COLLECTION_ITEM_IDS).size, NEW_COLLECTION_ITEMS.length, "IDs are unique")
  for (const itemId of NEW_COLLECTION_LANDED_ITEM_IDS) {
    assert.ok(NEW_COLLECTION_ITEM_IDS.includes(itemId), `${itemId} is declared in the collection`)
  }
  for (const item of NEW_COLLECTION_ITEMS) {
    assert.equal(isRetiredAvatarItemId(item.itemId), false, `${item.itemId} is a new ID`)
    if (!NEW_COLLECTION_LANDED_ITEM_IDS.has(item.itemId)) continue
    const rows = AVATAR_LOADOUT_CATALOG.filter((row) => row.itemId === item.itemId)
    assert.equal(rows.length, 1, `${item.itemId} has one loadout row`)
    assert.equal(rows[0].slot, item.slot)
    assert.deepEqual(rows[0].supportedBodyIds, [item.bodyId])
    assert.equal(rows[0].accessoryGroup, item.accessoryGroup)
    const economy = ECONOMY_CATALOG.filter((row) => row.itemId === item.itemId)
    assert.equal(economy.length, 1, `${item.itemId} has one economy row`)
    assert.ok(economy[0].priceCoins > 0 && economy[0].priceCoins === item.priceCoins, `${item.itemId} is priced`)
  }
})

test("every new collection Turkish name fits the wardrobe card's two lines", () => {
  for (const item of NEW_COLLECTION_ITEMS) {
    const lines = wrapName(item.nameTr)
    assert.ok(lines.length <= 2 && lines.every((line) => line.length <= WARDROBE_NAME_LINE_CHARS),
      `${item.itemId}: "${item.nameTr}" does not fit two card lines`)
  }
})

test("a new collection price is marked owner-approved only while it equals the figure the owner approved", () => {
  assert.ok(NEW_COLLECTION_ITEMS.length > 0, "the guard scanned the collection")
  for (const itemId of Object.keys(OWNER_APPROVED_PRICE_COINS)) {
    assert.ok(NEW_COLLECTION_ITEM_IDS.includes(itemId), `${itemId}: an owner approval names a declared piece`)
  }
  for (const item of NEW_COLLECTION_ITEMS) {
    const approved = OWNER_APPROVED_PRICE_COINS[item.itemId]
    assert.equal(item.isPriceOwnerApproved, approved === item.priceCoins,
      `${item.itemId}: ${item.priceCoins} coins is ${approved === undefined ? "lead-set" : `owner-approved at ${approved}`}`)
  }
})
