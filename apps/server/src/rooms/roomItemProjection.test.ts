import assert from "node:assert/strict"
import test from "node:test"
import { ECONOMY_CATALOG as DOMAIN_ECONOMY_CATALOG, LEGACY_ROOM_ITEM_IDS } from "@blumi/domain"
import { TEST_ROOM_ECONOMY_CATALOG, TEST_ROOM_STARTER_ITEM_ID } from "../economy/testRoomCatalog"
import { isActiveRoomItemId, isActiveRoomItemIdIn, projectRoomDecorItems } from "./roomItemProjection"

test("no retired, held or unknown room id is active, whatever catalog the server runs with", () => {
  const isActiveWithEveryDomainItem = isActiveRoomItemIdIn(DOMAIN_ECONOMY_CATALOG)
  for (const itemId of LEGACY_ROOM_ITEM_IDS) {
    assert.equal(isActiveWithEveryDomainItem(itemId), false, itemId)
  }
  for (const itemId of ["room_v3_sofa_japon_cream", "room_v2_chair_blush", "room_v9_unknown"]) {
    assert.equal(isActiveRoomItemId(itemId), false, itemId)
  }
  // the free starter bed is active and owned by everyone (F9)
  assert.equal(isActiveRoomItemId("room_v3_bed_blumi_starter"), true)
  assert.equal(isActiveRoomItemIdIn(TEST_ROOM_ECONOMY_CATALOG)(TEST_ROOM_STARTER_ITEM_ID), true)
})

test("shared room decor copied from a stored row drops the pieces that are no longer active", () => {
  const decor = {
    schemaVersion: 3,
    geometryVersion: "room_v2",
    roomShellId: "room_v2_shell_blumi_world_v1",
    placedItems: [
      { instanceId: "a", itemId: "room_v2_cozy_bed", x: 0.5, y: 0.5, rotation: "front" as const },
      { instanceId: "b", itemId: TEST_ROOM_STARTER_ITEM_ID, x: 0.4, y: 0.6, rotation: "back" as const }
    ]
  }
  const projected = projectRoomDecorItems(decor, isActiveRoomItemIdIn(TEST_ROOM_ECONOMY_CATALOG))
  assert.deepEqual(projected.placedItems.map((item) => item.instanceId), ["b"])
  assert.equal(projected.roomShellId, decor.roomShellId)
  assert.equal(decor.placedItems.length, 2)
})
