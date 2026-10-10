import assert from "node:assert/strict"
import test from "node:test"
import { ECONOMY_CATALOG } from "../economy/economyCatalog"
import { RESERVED_ROOM_ITEM_IDS, ROOM_V3_FURNITURE } from "../economy/roomFurnitureIds"
import { UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES } from "../economy/universalCoreRoomEconomy"
import {
  BLUMI_R1_RELEASE_CATALOG,
  isReleaseCatalogItemHeld,
  resolveR1PublishedEconomyCatalog,
  resolveUnheldEconomyCatalog
} from "../release/releaseCatalog"
import { isLegacyItemId, LEGACY_AVATAR_ITEM_IDS, LEGACY_ROOM_ITEM_IDS } from "./legacyItemIds"

/**
 * Old room items that are still active economy entries until the commit that retires their art (X8) removes them;
 * each is already in the registry so that commit only deletes. This list may only shrink.
 */
const ACTIVE_UNTIL_X8 = new Set([
  "room_v2_cozy_bed",
  "room_v2_cute_bookshelf",
  "room_v2_heart_rug",
  "room_v2_lamp_heart",
  "room_v2_side_table",
  "room_v2_table_round"
])

const ROOM_V3_IDS = ROOM_V3_FURNITURE.map((item) => item.itemId)

test("L14: no new, reserved or kept id is in the legacy registry, and old ids are never reused", () => {
  const registry = [...LEGACY_ROOM_ITEM_IDS, ...LEGACY_AVATAR_ITEM_IDS]
  assert.equal(new Set(registry).size, registry.length, "registry ids are unique")
  for (const id of [...ROOM_V3_IDS, ...RESERVED_ROOM_ITEM_IDS, "room_v2_chair_blush", "room_v2_shell_blumi_world_v1"]) {
    assert.equal(isLegacyItemId(id), false, `${id} is active or reserved but listed as legacy`)
  }
  for (const item of ECONOMY_CATALOG) {
    if (!isLegacyItemId(item.itemId)) continue
    assert.ok(ACTIVE_UNTIL_X8.has(item.itemId), `${item.itemId}: a legacy id is an active economy entry`)
  }
})

test("the room part of the registry holds the six old flat pieces and all 45 universal core candidates", () => {
  for (const id of ACTIVE_UNTIL_X8) assert.ok(isLegacyItemId(id), id)
  const universal = UNIVERSAL_CORE_ROOM_ECONOMY_CANDIDATES.map((item) => item.itemId)
  assert.equal(universal.length, 45)
  for (const id of universal) assert.ok(isLegacyItemId(id), id)
  assert.equal(LEGACY_ROOM_ITEM_IDS.length, 51)
})

test("the 27 approved 2.5D pieces and the blush chair are held as pricing-pending; the starter bed never is", () => {
  assert.equal(ROOM_V3_IDS.length, 27)
  assert.equal(new Set(ROOM_V3_IDS).size, 27)
  const pricingPending = BLUMI_R1_RELEASE_CATALOG.heldScopes.find((scope) => scope.scope === "pricing-pending")
  assert.ok(pricingPending)
  const inScope = (id: string) => pricingPending.itemIdPatterns.some((pattern) => new RegExp(pattern).test(id))
  for (const id of [...ROOM_V3_IDS, "room_v2_chair_blush"]) {
    assert.ok(inScope(id), `${id} is not pricing-pending`)
    assert.ok(isReleaseCatalogItemHeld(id), id)
    assert.ok(ECONOMY_CATALOG.some((item) => item.itemId === id && item.type === "room"), `${id} has no economy entry`)
  }
  for (const id of RESERVED_ROOM_ITEM_IDS) {
    assert.equal(isReleaseCatalogItemHeld(id), false, `${id} must never be held`)
    assert.equal(ECONOMY_CATALOG.some((item) => item.itemId === id), false, `${id} has no art yet, so no entry`)
  }
})

test("held items are neither sold nor listed in production or development projections", () => {
  for (const projection of [resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG), resolveUnheldEconomyCatalog(ECONOMY_CATALOG)]) {
    for (const id of [...ROOM_V3_IDS, "room_v2_chair_blush"]) {
      assert.equal(projection.some((item) => item.itemId === id), false, id)
    }
  }
  // ownedByDefault starters stay in both
  assert.ok(resolveR1PublishedEconomyCatalog(ECONOMY_CATALOG).some((item) => item.itemId === "avatar_v2_body_default"))
  assert.ok(resolveUnheldEconomyCatalog(ECONOMY_CATALOG).some((item) => item.itemId === "avatar_v2_body_default"))
})
