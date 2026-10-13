import assert from "node:assert/strict"
import test from "node:test"
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

test("on a local memory server the grant owns and places held furniture but never sells it", async () => {
  const catalog = resolveQaRoomGrantCatalog({ env: { BLUMI_QA_ROOM_GRANT: "1" }, authRepositoryMode: "memory" })
  assert.ok(catalog)
  const service = createEconomyService({ catalog })
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
