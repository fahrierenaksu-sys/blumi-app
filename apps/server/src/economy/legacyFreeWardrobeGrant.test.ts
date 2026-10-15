import assert from "node:assert/strict"
import test from "node:test"
import {
  BOY_WARDROBE_PREVIEW_ALL_IDS,
  BOY_WARDROBE_PREVIEW_ITEM_IDS,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  GIRL_WARDROBE_PREVIEW_ALL_IDS,
  GIRL_WARDROBE_PREVIEW_ITEM_IDS,
  R1_WARDROBE_PRICE_COINS
} from "@blumi/domain"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import { createAvatarService } from "../avatar/avatarService"
import { ECONOMY_CATALOG, STARTER_COIN_BALANCE, resolveProductionEconomyCatalog, type EconomyCatalogItem } from "./economyCatalog"
import { createInMemoryEconomyRepository } from "./economyRepository"
import { createEconomyService } from "./economyService"
import {
  LEGACY_FREE_WARDROBE_ITEM_IDS,
  R1_PRICE_LAUNCH_AT,
  isLegacyFreeWardrobeAccount,
  type AccountCreatedAtLookup
} from "./legacyFreeWardrobeGrant"

const BEFORE_LAUNCH = "2026-10-13T12:00:00.000Z"
const AFTER_LAUNCH = "2026-10-20T12:00:00.000Z"
const PRICED_BOY_TOP = BOY_WARDROBE_PREVIEW_ITEM_IDS.top.find((itemId) => R1_WARDROBE_PRICE_COINS[itemId] !== undefined)!
const PRICED_GIRL_HAIR = GIRL_WARDROBE_PREVIEW_ITEM_IDS.hair.find((itemId) => R1_WARDROBE_PRICE_COINS[itemId] !== undefined)!

/** A signed-in account whose creation time the server reads from `createdAt` (the auth record when omitted). */
async function accountCreatedAt(catalog: readonly EconomyCatalogItem[], createdAt?: string) {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const lookups: string[] = []
  const getAccountCreatedAt: AccountCreatedAtLookup = async (userId) => {
    lookups.push(userId)
    return createdAt ?? (await authService.repository.findAccountByUserId(userId))?.createdAt ?? null
  }
  const repository = createInMemoryEconomyRepository()
  const economyService = createEconomyService({ catalog, repository, getAccountCreatedAt })
  const avatarService = createAvatarService({ authService, economyService })
  await authService.sendCode("+905551112244")
  const verified = await authService.verifyCode("+905551112244", "482931")
  return { avatarService, economyService, repository, verified, lookups }
}

test("the legacy free pieces are exactly the 26 the approved table prices: 22 boy, 4 girl", () => {
  assert.equal(LEGACY_FREE_WARDROBE_ITEM_IDS.length, 26)
  assert.equal(LEGACY_FREE_WARDROBE_ITEM_IDS.filter((itemId) => BOY_WARDROBE_PREVIEW_ALL_IDS.includes(itemId)).length, 22)
  assert.equal(LEGACY_FREE_WARDROBE_ITEM_IDS.filter((itemId) => GIRL_WARDROBE_PREVIEW_ALL_IDS.includes(itemId)).length, 4)
})

test("only an account created strictly before the price launch is a legacy account", () => {
  assert.equal(isLegacyFreeWardrobeAccount(BEFORE_LAUNCH), true)
  assert.equal(isLegacyFreeWardrobeAccount(R1_PRICE_LAUNCH_AT), false)
  assert.equal(isLegacyFreeWardrobeAccount(AFTER_LAUNCH), false)
  assert.equal(isLegacyFreeWardrobeAccount(null), false)
  assert.equal(isLegacyFreeWardrobeAccount(undefined), false)
  assert.equal(isLegacyFreeWardrobeAccount("not a date"), false)
})

for (const [label, catalog] of [
  ["development", ECONOMY_CATALOG],
  ["production", resolveProductionEconomyCatalog()]
] as const) {
  test(`an account created before the price launch owns all 26 formerly free pieces and wears them without paying (${label} catalog)`, async () => {
    const { avatarService, economyService, verified } = await accountCreatedAt(catalog, BEFORE_LAUNCH)
    const userId = verified.account.userId

    const inventory = await economyService.getInventory(userId)
    assert.ok(LEGACY_FREE_WARDROBE_ITEM_IDS.every((itemId) => inventory.ownedAvatarItemIds.includes(itemId)))
    assert.equal(inventory.coins, STARTER_COIN_BALANCE)

    const boyLook = await avatarService.saveAvatar(verified.sessionToken, {
      loadout: { ...DEFAULT_MALE_AVATAR_LOADOUT, topId: PRICED_BOY_TOP },
      revision: 0
    })
    assert.equal(boyLook.kind, "updated")
    const girlLook = await avatarService.saveAvatar(verified.sessionToken, {
      loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: PRICED_GIRL_HAIR },
      revision: 1
    })
    assert.equal(girlLook.kind, "updated")

    await assert.rejects(
      () => economyService.purchaseItem(userId, { type: "avatar", itemId: PRICED_BOY_TOP, avatarBodyId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId }),
      /already own/
    )
    assert.equal((await economyService.getInventory(userId)).coins, STARTER_COIN_BALANCE)
  })

  test(`an account created after the price launch pays for a priced piece before wearing it (${label} catalog)`, async () => {
    const { avatarService, economyService, verified } = await accountCreatedAt(catalog)
    const userId = verified.account.userId

    const inventory = await economyService.getInventory(userId)
    assert.ok(LEGACY_FREE_WARDROBE_ITEM_IDS.every((itemId) => !inventory.ownedAvatarItemIds.includes(itemId)))
    const look = { ...DEFAULT_MALE_AVATAR_LOADOUT, topId: PRICED_BOY_TOP }
    assert.equal((await avatarService.saveAvatar(verified.sessionToken, { loadout: look, revision: 0 })).kind, "invalid")

    const bought = await economyService.purchaseItem(userId, {
      type: "avatar",
      itemId: PRICED_BOY_TOP,
      avatarBodyId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId
    })
    assert.equal(bought.inventory.coins, STARTER_COIN_BALANCE - R1_WARDROBE_PRICE_COINS[PRICED_BOY_TOP]!)
    assert.equal((await avatarService.saveAvatar(verified.sessionToken, { loadout: look, revision: 0 })).kind, "updated")
  })
}

test("an account created exactly at the launch instant pays like a new account", async () => {
  const { economyService, verified } = await accountCreatedAt(ECONOMY_CATALOG, R1_PRICE_LAUNCH_AT)
  const inventory = await economyService.getInventory(verified.account.userId)
  assert.ok(!inventory.ownedAvatarItemIds.includes(PRICED_BOY_TOP))
})

test("the client cannot claim the grant: without the server's account lookup nobody gets the pieces free", async () => {
  const economyService = createEconomyService({ catalog: ECONOMY_CATALOG, repository: createInMemoryEconomyRepository() })
  const inventory = await economyService.getInventory("user_without_lookup")
  assert.ok(LEGACY_FREE_WARDROBE_ITEM_IDS.every((itemId) => !inventory.ownedAvatarItemIds.includes(itemId)))
})

test("the grant is written once: later reads of a legacy or a new account do not look the account up again", async () => {
  const legacy = await accountCreatedAt(ECONOMY_CATALOG, BEFORE_LAUNCH)
  for (let read = 0; read < 3; read += 1) await legacy.economyService.getInventory(legacy.verified.account.userId)
  assert.equal(legacy.lookups.length, 1)

  const fresh = await accountCreatedAt(ECONOMY_CATALOG, AFTER_LAUNCH)
  for (let read = 0; read < 3; read += 1) await fresh.economyService.getInventory(fresh.verified.account.userId)
  assert.equal(fresh.lookups.length, 1)
})

test("an unknown account gets nothing free", async () => {
  const economyService = createEconomyService({
    catalog: ECONOMY_CATALOG,
    repository: createInMemoryEconomyRepository(),
    getAccountCreatedAt: async () => null
  })
  const inventory = await economyService.getInventory("unknown_user")
  assert.ok(LEGACY_FREE_WARDROBE_ITEM_IDS.every((itemId) => !inventory.ownedAvatarItemIds.includes(itemId)))
})
