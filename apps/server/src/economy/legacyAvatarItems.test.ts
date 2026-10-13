import assert from "node:assert/strict"
import test from "node:test"
import {
  AVATAR_LOADOUT_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  isRetiringAvatarItemId,
  LEGACY_AVATAR_ITEM_IDS,
  LEGACY_AVATAR_ITEM_REPLACEMENTS,
  RETIRED_AVATAR_ITEM_IDS,
  toAvatarLoadoutV2,
  validateAvatarLoadout
} from "@blumi/domain"
import { normalizeStoredAvatarSelection } from "../avatar/avatarSelectionPersistence"
import { ECONOMY_CATALOG, getDefaultOwnedItemIds } from "./economyCatalog"
import { createInMemoryEconomyRepository } from "./economyRepository"
import { createEconomyService } from "./economyService"

const STORED_AT = "2026-06-01T00:00:00.000Z"
const READ_AT = new Date("2026-10-11T10:00:00.000Z")

/**
 * A paid old item of this slot for this body: the kind of item a returning player bought. Plan X15 retired every
 * paid old item (owner yes 2026-10-12), so it is now hidden; it was sold before.
 */
function paidRetiringItem(slot: string, bodyId: string): string {
  const item = AVATAR_LOADOUT_CATALOG.find((entry) =>
    entry.slot === slot &&
    entry.supportedBodyIds.includes(bodyId) &&
    isRetiringAvatarItemId(entry.itemId) &&
    RETIRED_AVATAR_ITEM_IDS.has(entry.itemId) &&
    ECONOMY_CATALOG.some((sold) => sold.itemId === entry.itemId && sold.priceCoins > 0 && !sold.ownedByDefault)
  )
  assert.ok(item, `no paid ${slot} for ${bodyId}`)
  return item.itemId
}

for (const starter of [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]) {
  const bodyId = starter.bodyId
  test(`a ${bodyId} account holding only old ids keeps every owned item and reads as a valid look`, async () => {
    // Arrange: an inventory row and a stored loadout made only of old ids (legacy, hidden and paid retiring)
    const paidShoes = paidRetiringItem("shoes", bodyId)
    const ownedOld = [...LEGACY_AVATAR_ITEM_IDS, ...RETIRED_AVATAR_ITEM_IDS, paidShoes]
    const repository = createInMemoryEconomyRepository()
    await repository.saveInventory({
      userId: "old_ids_user",
      coins: 321,
      coinDebt: 0,
      ownedAvatarItemIds: ownedOld,
      ownedRoomItemIds: ["room_v2_cozy_bed"],
      updatedAt: STORED_AT
    })
    const service = createEconomyService({ repository })
    const storedLoadout = {
      ...toAvatarLoadoutV2(starter),
      hairId: [...RETIRED_AVATAR_ITEM_IDS][0],
      topId: LEGACY_AVATAR_ITEM_IDS[0],
      bottomId: LEGACY_AVATAR_ITEM_IDS[1],
      shoesId: paidShoes,
      dressId: LEGACY_AVATAR_ITEM_IDS[2],
      accessoryIds: [LEGACY_AVATAR_ITEM_IDS[3]]
    }

    // Act
    const inventory = await service.getInventory("old_ids_user", READ_AT)
    const row = await repository.getInventory("old_ids_user")
    const selection = normalizeStoredAvatarSelection({ presetId: bodyId, loadout: storedLoadout, revision: 9 })

    // Assert: nothing owned is lost, from the row or from what the server returns for avatar items
    assert.ok(row)
    for (const itemId of ownedOld) {
      assert.ok(row.ownedAvatarItemIds.includes(itemId), `${itemId} left the stored row`)
      assert.ok(inventory.ownedAvatarItemIds.includes(itemId), `${itemId} left the inventory read`)
    }
    assert.ok(row.ownedRoomItemIds.includes("room_v2_cozy_bed"), "the stored legacy room item stays in the row")
    assert.equal(inventory.coins, 321)
    for (const replacement of Object.values(LEGACY_AVATAR_ITEM_REPLACEMENTS)) {
      assert.ok(inventory.ownedAvatarItemIds.includes(replacement), `${replacement} was not granted`)
    }
    for (const itemId of getDefaultOwnedItemIds("avatar", ECONOMY_CATALOG)) {
      assert.ok(inventory.ownedAvatarItemIds.includes(itemId), `${itemId} starter was not granted`)
    }
    // the look the player sees is one the server accepts as theirs on the next save
    const validation = validateAvatarLoadout(selection.loadout, inventory.ownedAvatarItemIds)
    assert.ok(validation.ok, validation.ok ? "" : validation.code)
    assert.equal(selection.loadout.bodyId, bodyId)
    // plan X15: a bought old item stays owned (asserted above) but is retired, so the look reads its starter piece
    assert.equal(selection.loadout.shoesId, starter.shoesId, "an owned, retired old item reads as the starter piece")
    assert.equal(selection.loadout.topId, starter.topId)
    assert.equal(selection.loadout.bottomId, starter.bottomId)
    assert.equal(selection.revision, 9)
  })
}

test("no legacy avatar id can be bought again", async () => {
  const service = createEconomyService()
  for (const itemId of LEGACY_AVATAR_ITEM_IDS) {
    await assert.rejects(
      () => service.purchaseItem("buyer", { type: "avatar", itemId, avatarBodyId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId }),
      /not available/i,
      itemId
    )
  }
})
