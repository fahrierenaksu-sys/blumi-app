import assert from "node:assert/strict"
import test from "node:test"
import {
  createInMemoryEconomyRepository,
  createDefaultEconomyInventory
} from "../economy/economyRepository"
import { createEconomyService } from "../economy/economyService"
import { createCommerceService } from "./commerceService"

const CREATED_AT = new Date("2026-07-29T12:00:00.000Z")

function createVerifiedPurchase(overrides: Partial<{
  eventId: string
  transactionId: string
  userId: string
  productId: string
}> = {}) {
  return {
    eventId: "event_purchase_1",
    transactionId: "transaction_1",
    userId: "user_a",
    productId: "com.blumi.mobile.coins.500",
    store: "ios" as const,
    kind: "credit" as const,
    occurredAt: CREATED_AT.toISOString(),
    providerPayload: { verified: true },
    ...overrides
  }
}

test("verified consumable purchases are credited exactly once and client prices are never inputs", async () => {
  const repository = createInMemoryEconomyRepository()
  const economyService = createEconomyService({ repository })
  const commerceService = createCommerceService({ economyService })

  const first = await commerceService.applyVerifiedTransaction(
    createVerifiedPurchase(),
    CREATED_AT
  )
  const repeated = await commerceService.applyVerifiedTransaction(
    createVerifiedPurchase({ eventId: "event_purchase_retry" }),
    CREATED_AT
  )

  assert.equal(first.applied, true)
  assert.equal(first.inventory.coins, 1750)
  assert.equal(repeated.applied, false)
  assert.equal(repeated.inventory.coins, 1750)
})

test("verified transactions reject an account mismatch before they can touch a wallet", async () => {
  const commerceService = createCommerceService({
    economyService: createEconomyService()
  })

  await assert.rejects(
    commerceService.reconcile("user_a", [createVerifiedPurchase({ userId: "user_b" })]),
    /does not belong to this account/i
  )
})

test("a previously recorded transaction cannot be reassigned to another wallet", async () => {
  const commerceService = createCommerceService({
    economyService: createEconomyService()
  })
  await commerceService.applyVerifiedTransaction(createVerifiedPurchase(), CREATED_AT)

  await assert.rejects(
    commerceService.applyVerifiedTransaction(
      createVerifiedPurchase({
        eventId: "event_cross_account",
        userId: "user_b"
      }),
      CREATED_AT
    ),
    /does not belong to this account/i
  )
})

test("refund reversals consume unused coins first, then create debt without revoking cosmetics", async () => {
  const repository = createInMemoryEconomyRepository()
  const economyService = createEconomyService({ repository })
  const commerceService = createCommerceService({ economyService })

  await repository.saveInventory({
    ...createDefaultEconomyInventory("user_a", CREATED_AT),
    coins: 120,
    coinDebt: 0,
    ownedAvatarItemIds: ["avatar_v2_top_blush_lace_cardigan"],
    updatedAt: CREATED_AT.toISOString()
  })
  const reversal = await commerceService.applyVerifiedTransaction({
    ...createVerifiedPurchase(),
    eventId: "event_refund_1",
    kind: "reversal"
  }, CREATED_AT)

  assert.equal(reversal.applied, true)
  assert.equal(reversal.inventory.coins, 0)
  assert.equal(reversal.inventory.coinDebt, 380)
  assert.ok(
    reversal.inventory.ownedAvatarItemIds.includes(
      "avatar_v2_top_blush_lace_cardigan"
    )
  )
  await assert.rejects(
    economyService.purchaseItem("user_a", {
      type: "avatar",
      itemId: "avatar_v2_top_blush_lace_cardigan",
      avatarBodyId: "avatar_v2_body_default"
    }),
    /coin balance needs to be settled/i
  )
})

test("a later credit pays coin debt before increasing spendable coins", async () => {
  const repository = createInMemoryEconomyRepository()
  const economyService = createEconomyService({ repository })
  const commerceService = createCommerceService({ economyService })
  await repository.saveInventory({
    ...createDefaultEconomyInventory("user_a", CREATED_AT),
    coins: 20,
    coinDebt: 200,
    updatedAt: CREATED_AT.toISOString()
  })

  const credited = await commerceService.applyVerifiedTransaction(
    createVerifiedPurchase({ transactionId: "transaction_2" }),
    CREATED_AT
  )

  assert.equal(credited.inventory.coinDebt, 0)
  assert.equal(credited.inventory.coins, 320)
})
