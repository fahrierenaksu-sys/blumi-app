import assert from "node:assert/strict"
import test from "node:test"
import {
  BOY_WARDROBE_PREVIEW_ALL_IDS,
  BOY_WARDROBE_PREVIEW_ITEM_IDS,
  GIRL_WARDROBE_PREVIEW_ALL_IDS,
  GIRL_WARDROBE_PREVIEW_ITEM_IDS,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  R1_WARDROBE_PRICE_COINS,
  TEST_AVATAR_ITEM,
  TEST_AVATAR_ITEM_RULES
} from "@blumi/domain"
import { createAuthService } from "../auth/authService"
import { createBlumiBackendStore } from "../auth/authStore"
import {
  ECONOMY_CATALOG,
  STARTER_COIN_BALANCE,
  resolveProductionEconomyCatalog,
  type EconomyCatalogItem
} from "../economy/economyCatalog"
import { createDefaultEconomyInventory, createInMemoryEconomyRepository } from "../economy/economyRepository"
import { createEconomyService } from "../economy/economyService"
import { TEST_ECONOMY_CATALOG } from "../economy/testRoomCatalog"
import { createAvatarService } from "./avatarService"

const FIXTURE_FEMALE_LOADOUT = TEST_AVATAR_ITEM_RULES.starters.female
const FIXTURE_MALE_LOADOUT = TEST_AVATAR_ITEM_RULES.starters.male

test("avatar save is authenticated, ownership-checked, and revision-safe", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  // plan X15: the live catalog has no paid hair to leave unowned, so this runs on the test-only fixture catalog
  const economyService = createEconomyService({ catalog: TEST_ECONOMY_CATALOG, avatarRules: TEST_AVATAR_ITEM_RULES })
  const avatarService = createAvatarService({
    authService,
    economyService,
    avatarRules: TEST_AVATAR_ITEM_RULES
  })
  await authService.sendCode("+905551112233")
  const verified = await authService.verifyCode("+905551112233", "482931")

  const updated = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: FIXTURE_MALE_LOADOUT,
    revision: 0
  })
  assert.equal(updated.kind, "updated")
  if (updated.kind !== "updated") return
  assert.equal(updated.selection.revision, 1)
  assert.equal(updated.selection.presetId, FIXTURE_MALE_LOADOUT.bodyId)

  const stored = await authService.getSession(verified.sessionToken)
  assert.deepEqual(stored?.account.profile.avatar, updated.selection)

  const stale = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: FIXTURE_FEMALE_LOADOUT,
    revision: 0
  })
  assert.equal(stale.kind, "conflict")
  if (stale.kind === "conflict") {
    assert.deepEqual(stale.current, updated.selection)
  }

  const unowned = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: {
      ...FIXTURE_FEMALE_LOADOUT,
      hairId: TEST_AVATAR_ITEM.girlHairPaid
    },
    revision: 1
  })
  assert.deepEqual(unowned, {
    kind: "invalid",
    code: "unowned_item",
    message: "Unlock this avatar item before equipping it."
  })
})

test("avatar save rejects invalid revisions before touching session state", async () => {
  const authService = createAuthService()
  const avatarService = createAvatarService({
    authService,
    economyService: createEconomyService()
  })

  for (const revision of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER]) {
    const result = await avatarService.saveAvatar("invalid", {
      loadout: DEFAULT_FEMALE_AVATAR_LOADOUT,
      revision
    })
    assert.equal(result.kind, "invalid")
    if (result.kind === "invalid") assert.equal(result.code, "invalid_revision")
  }
})

// The 2.5D wardrobes (boyWardrobePreview.ts, girlWardrobePreview.ts) follow the owner-approved R1 prices
// (2026-10-15): the starters stay free and owned; every other piece is sold at its price through its receipt, for its
// own body only, and a new account wears it only after buying it. Pieces granted while the wardrobes were free
// (owner yes for free testing, 2026-10-13) stay owned: an account that holds them keeps every look without a reset or a
// charge. Checked with the development catalog and the production (receipt-filtered) one.
const BOY_OUTFITS = BOY_WARDROBE_PREVIEW_ITEM_IDS.top.map((topId, index) => ({
  ...DEFAULT_MALE_AVATAR_LOADOUT,
  hairId: BOY_WARDROBE_PREVIEW_ITEM_IDS.hair[index % BOY_WARDROBE_PREVIEW_ITEM_IDS.hair.length]!,
  topId,
  bottomId: BOY_WARDROBE_PREVIEW_ITEM_IDS.bottom[index]!,
  shoesId: BOY_WARDROBE_PREVIEW_ITEM_IDS.shoes[index]!
}))
const BOY_MIXED_LOOK = {
  ...DEFAULT_MALE_AVATAR_LOADOUT,
  hairId: BOY_WARDROBE_PREVIEW_ITEM_IDS.hair[1],
  topId: BOY_WARDROBE_PREVIEW_ITEM_IDS.top[2],
  bottomId: BOY_WARDROBE_PREVIEW_ITEM_IDS.bottom[5],
  shoesId: BOY_WARDROBE_PREVIEW_ITEM_IDS.shoes[0]
}
const starterIdsOf = (loadout: typeof DEFAULT_MALE_AVATAR_LOADOUT): ReadonlySet<string> =>
  new Set([loadout.hairId, loadout.topId, loadout.bottomId, loadout.shoesId])
const BOY_STARTER_IDS = starterIdsOf(DEFAULT_MALE_AVATAR_LOADOUT)
const FIRST_PRICED_BOY_TOP_ID = BOY_WARDROBE_PREVIEW_ITEM_IDS.top.find((itemId) => !BOY_STARTER_IDS.has(itemId))!
const ENOUGH_COINS_FOR_EVERY_PIECE = 10_000

async function signInWith(catalog: readonly EconomyCatalogItem[], repository = createInMemoryEconomyRepository()) {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const economyService = createEconomyService({ catalog, repository })
  const avatarService = createAvatarService({ authService, economyService })
  await authService.sendCode("+905551112233")
  const verified = await authService.verifyCode("+905551112233", "482931")
  return { avatarService, economyService, verified, repository }
}

async function saveEach(
  avatarService: ReturnType<typeof createAvatarService>,
  sessionToken: string,
  loadouts: readonly unknown[]
): Promise<void> {
  let revision = 0
  for (const loadout of loadouts) {
    const result = await avatarService.saveAvatar(sessionToken, { loadout, revision })
    assert.equal(result.kind, "updated", JSON.stringify(loadout))
    revision += 1
  }
}

/** An inventory as it stands after the free testing grant: the default rows plus the wardrobe pieces it received. */
async function holdGrantedPieces(
  repository: ReturnType<typeof createInMemoryEconomyRepository>,
  userId: string,
  grantedIds: readonly string[],
  coins: number
): Promise<void> {
  const inventory = createDefaultEconomyInventory(userId)
  await repository.saveInventory({
    ...inventory,
    coins,
    ownedAvatarItemIds: [...new Set([...inventory.ownedAvatarItemIds, ...grantedIds])]
  })
}

for (const [label, catalog] of [
  ["development", ECONOMY_CATALOG],
  ["production", resolveProductionEconomyCatalog()]
] as const) {
  test(`a new account wears the boy starters free and a priced piece only after buying it (${label} catalog)`, async () => {
    const { avatarService, economyService, verified } = await signInWith(catalog)
    await saveEach(avatarService, verified.sessionToken, [DEFAULT_MALE_AVATAR_LOADOUT])
    const look = { ...DEFAULT_MALE_AVATAR_LOADOUT, topId: FIRST_PRICED_BOY_TOP_ID }
    const refused = await avatarService.saveAvatar(verified.sessionToken, { loadout: look, revision: 1 })
    assert.equal(refused.kind, "invalid")

    const bought = await economyService.purchaseItem(verified.account.userId, {
      type: "avatar",
      itemId: FIRST_PRICED_BOY_TOP_ID,
      avatarBodyId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId
    })
    assert.equal(bought.inventory.coins, STARTER_COIN_BALANCE - R1_WARDROBE_PRICE_COINS[FIRST_PRICED_BOY_TOP_ID]!)
    const saved = await avatarService.saveAvatar(verified.sessionToken, { loadout: look, revision: 1 })
    assert.equal(saved.kind, "updated")
  })

  test(`an account that holds the boy pieces from the free testing grant keeps every look without a reset (${label} catalog)`, async () => {
    const repository = createInMemoryEconomyRepository()
    const { avatarService, verified } = await signInWith(catalog, repository)
    await holdGrantedPieces(repository, verified.account.userId, BOY_WARDROBE_PREVIEW_ALL_IDS, 640)
    await saveEach(avatarService, verified.sessionToken, [BOY_MIXED_LOOK, ...BOY_OUTFITS])
    const kept = await repository.getInventory(verified.account.userId)
    assert.equal(kept?.coins, 640)
    assert.ok(BOY_WARDROBE_PREVIEW_ALL_IDS.every((itemId) => kept?.ownedAvatarItemIds.includes(itemId)))
  })

  test(`girl looks are unchanged and cannot wear the boy's pieces (${label} catalog)`, async () => {
    const { avatarService, verified } = await signInWith(catalog)
    await saveEach(avatarService, verified.sessionToken, [DEFAULT_FEMALE_AVATAR_LOADOUT])
    const result = await avatarService.saveAvatar(verified.sessionToken, {
      loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: BOY_WARDROBE_PREVIEW_ITEM_IDS.top[0] },
      revision: 1
    })
    assert.equal(result.kind, "invalid")
  })
}

// The girl's 2.5D additions are all priced: a new account buys them first, an account that holds them from the free
// testing grant keeps them, and the boy cannot wear them.
const GIRL_NEW_LOOKS = [
  ...GIRL_WARDROBE_PREVIEW_ITEM_IDS.hair.map((hairId) => ({ ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId })),
  { ...DEFAULT_FEMALE_AVATAR_LOADOUT, shoesId: GIRL_WARDROBE_PREVIEW_ITEM_IDS.shoes[0] },
  { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: GIRL_WARDROBE_PREVIEW_ITEM_IDS.hair[0], shoesId: GIRL_WARDROBE_PREVIEW_ITEM_IDS.shoes[0] }
]

for (const [label, catalog] of [
  ["development", ECONOMY_CATALOG],
  ["production", resolveProductionEconomyCatalog()]
] as const) {
  test(`a new girl account cannot wear her priced pieces before buying them (${label} catalog)`, async () => {
    const { avatarService, verified } = await signInWith(catalog)
    await saveEach(avatarService, verified.sessionToken, [DEFAULT_FEMALE_AVATAR_LOADOUT])
    for (const loadout of GIRL_NEW_LOOKS) {
      const result = await avatarService.saveAvatar(verified.sessionToken, { loadout, revision: 1 })
      assert.equal(result.kind, "invalid", JSON.stringify(loadout))
    }
  })

  test(`a girl account that holds her new pieces from the free testing grant keeps them without a reset (${label} catalog)`, async () => {
    const repository = createInMemoryEconomyRepository()
    const { avatarService, verified } = await signInWith(catalog, repository)
    await holdGrantedPieces(repository, verified.account.userId, GIRL_WARDROBE_PREVIEW_ALL_IDS, 640)
    await saveEach(avatarService, verified.sessionToken, GIRL_NEW_LOOKS)
    const kept = await repository.getInventory(verified.account.userId)
    assert.equal(kept?.coins, 640)
    assert.ok(GIRL_WARDROBE_PREVIEW_ALL_IDS.every((itemId) => kept?.ownedAvatarItemIds.includes(itemId)))
  })

  test(`the boy cannot wear the girl's new pieces (${label} catalog)`, async () => {
    const { avatarService, verified } = await signInWith(catalog)
    await saveEach(avatarService, verified.sessionToken, [DEFAULT_MALE_AVATAR_LOADOUT])
    for (const [slot, ids] of [["hairId", GIRL_WARDROBE_PREVIEW_ITEM_IDS.hair], ["shoesId", GIRL_WARDROBE_PREVIEW_ITEM_IDS.shoes]] as const) {
      for (const itemId of ids) {
        const result = await avatarService.saveAvatar(verified.sessionToken, {
          loadout: { ...DEFAULT_MALE_AVATAR_LOADOUT, [slot]: itemId },
          revision: 1
        })
        assert.equal(result.kind, "invalid", itemId)
      }
    }
  })
}

for (const wardrobe of [
  {
    label: "boy",
    ids: BOY_WARDROBE_PREVIEW_ALL_IDS,
    starterIds: BOY_STARTER_IDS,
    bodyId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId,
    otherBodyId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId
  },
  {
    label: "girl",
    ids: [...GIRL_WARDROBE_PREVIEW_ALL_IDS, ...starterIdsOf(DEFAULT_FEMALE_AVATAR_LOADOUT)],
    starterIds: starterIdsOf(DEFAULT_FEMALE_AVATAR_LOADOUT),
    bodyId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId,
    otherBodyId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId
  }
]) {
  test(`production sells each priced ${wardrobe.label} piece at its R1 price for its own body only and never charges for a starter`, async () => {
    const repository = createInMemoryEconomyRepository()
    const service = createEconomyService({ catalog: resolveProductionEconomyCatalog(), repository })
    const userId = `${wardrobe.label}_user`
    await holdGrantedPieces(repository, userId, [], ENOUGH_COINS_FOR_EVERY_PIECE)
    for (const itemId of wardrobe.ids) {
      const before = (await service.getInventory(userId)).coins
      if (wardrobe.starterIds.has(itemId)) {
        await assert.rejects(() => service.purchaseItem(userId, { type: "avatar", itemId, avatarBodyId: wardrobe.bodyId }), itemId)
        assert.equal((await service.getInventory(userId)).coins, before, itemId)
        continue
      }
      await assert.rejects(
        () => service.purchaseItem(userId, { type: "avatar", itemId, avatarBodyId: wardrobe.otherBodyId }),
        itemId
      )
      const bought = await service.purchaseItem(userId, { type: "avatar", itemId, avatarBodyId: wardrobe.bodyId })
      assert.equal(bought.inventory.coins, before - R1_WARDROBE_PRICE_COINS[itemId]!, itemId)
      assert.ok(bought.inventory.ownedAvatarItemIds.includes(itemId), itemId)
    }
  })
}
