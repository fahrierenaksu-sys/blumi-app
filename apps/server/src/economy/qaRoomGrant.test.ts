import assert from "node:assert/strict"
import test from "node:test"
import {
  BLUMI_R1_RELEASE_CATALOG,
  ECONOMY_CATALOG,
  isLegacyItemId,
  isReleaseCatalogItemHeld,
  type ReleaseCatalog
} from "@blumi/domain"
import { createEconomyService } from "./economyService"
import { resolveQaRoomGrantCatalog } from "./qaRoomGrant"

test("the QA room grant cannot be enabled in production, on a deployed server or on a database", () => {
  for (const [env, authRepositoryMode] of [
    [{ BLUMI_QA_ROOM_GRANT: "1", NODE_ENV: "production" }, "memory"],
    [{ BLUMI_QA_ROOM_GRANT: "1", BLUMI_DEPLOY_ENV: "staging" }, "memory"],
    [{ BLUMI_QA_ROOM_GRANT: "1" }, "postgres"],
    [{ BLUMI_QA_ROOM_GRANT: "yes" }, "memory"]
  ] as const) {
    assert.throws(() => resolveQaRoomGrantCatalog({ env, authRepositoryMode }), /BLUMI_QA_ROOM_GRANT/)
  }
  assert.equal(resolveQaRoomGrantCatalog({ env: {}, authRepositoryMode: "postgres" }), undefined)
  assert.equal(resolveQaRoomGrantCatalog({ env: { BLUMI_QA_ROOM_GRANT: "0" }, authRepositoryMode: "memory" }), undefined)
})

// The sofa, chair and armchair are receipted and sold now, so the R1 catalog holds no furniture a grant could hand
// out. The grant's rule still has to hold for the next held piece: a test release catalog holds these three again.
const HELD_FIXTURE_ROOM_IDS = ["room_v3_sofa_japon_cream", "room_v2_chair_blush", "room_v3_armchair_japon_cream"]
const FIXTURE_RELEASE_CATALOG: ReleaseCatalog = {
  ...BLUMI_R1_RELEASE_CATALOG,
  heldScopes: [
    ...BLUMI_R1_RELEASE_CATALOG.heldScopes,
    {
      scope: "test-held-room-fixture",
      productionPublication: false,
      itemIdPatterns: HELD_FIXTURE_ROOM_IDS.map((itemId) => `^${itemId}$`)
    }
  ]
}

test("the fixture pieces are real room items held only by the fixture release catalog", () => {
  for (const itemId of HELD_FIXTURE_ROOM_IDS) {
    assert.equal(ECONOMY_CATALOG.find((item) => item.itemId === itemId)?.type, "room", itemId)
    assert.equal(isLegacyItemId(itemId), false, itemId)
    assert.equal(isReleaseCatalogItemHeld(itemId, FIXTURE_RELEASE_CATALOG), true, itemId)
  }
})

test("with the R1 catalog the grant adds only held, non-legacy furniture to the unheld catalog", () => {
  const catalog = resolveQaRoomGrantCatalog({ env: { BLUMI_QA_ROOM_GRANT: "1" }, authRepositoryMode: "memory" })
  assert.ok(catalog)
  for (const item of catalog) {
    if (!isReleaseCatalogItemHeld(item.itemId)) continue
    assert.equal(item.type, "room", item.itemId)
    assert.equal(item.ownedByDefault, true, item.itemId)
    assert.equal(isLegacyItemId(item.itemId), false, item.itemId)
  }
})

test("on a local memory server the grant owns and places held furniture but never sells it", async () => {
  const catalog = resolveQaRoomGrantCatalog({
    env: { BLUMI_QA_ROOM_GRANT: "1" },
    authRepositoryMode: "memory",
    releaseCatalog: FIXTURE_RELEASE_CATALOG
  })
  assert.ok(catalog)
  const service = createEconomyService({ catalog, releaseCatalog: FIXTURE_RELEASE_CATALOG })
  const inventory = await service.getInventory("qa_user")
  assert.ok(inventory.ownedRoomItemIds.includes("room_v3_sofa_japon_cream"))
  assert.ok(inventory.ownedRoomItemIds.includes("room_v2_chair_blush"))
  // the free starter bed is owned by every account anyway (F9)
  assert.ok(inventory.ownedRoomItemIds.includes("room_v3_bed_blumi_starter"))
  assert.equal(inventory.ownedRoomItemIds.some((id) => id === "room_v2_cozy_bed"), false)
  assert.equal(service.isActiveRoomItemId?.("room_v3_sofa_japon_cream"), true)
  await assert.rejects(
    () => service.purchaseItem("qa_buyer", { type: "room", itemId: "room_v3_armchair_japon_cream" }),
    /not available/i
  )
})
