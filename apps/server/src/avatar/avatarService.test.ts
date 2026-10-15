import assert from "node:assert/strict"
import test from "node:test"
import {
  AVATAR_ITEM_RULES,
  BOY_WARDROBE_PREVIEW_ALL_IDS,
  coerceAvatarLoadout,
  BOY_WARDROBE_PREVIEW_ITEM_IDS,
  GIRL_WARDROBE_PREVIEW_ALL_IDS,
  GIRL_WARDROBE_PREVIEW_ITEM_IDS,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  R1_WARDROBE_PRICE_COINS,
  isRetiredAvatarItemId,
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
  return { avatarService, economyService, verified, repository, authService }
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

// The girl's 2.5D additions (girlWardrobePreview.ts): the four the approved table prices (R1_WARDROBE_PRICE_COINS) are
// bought first by a new account; the rest have no approved price yet and stay free and owned by every account. An
// account that holds them from the free testing grant keeps them, and the boy cannot wear any of them.
const [, GIRL_BLACK_CROP] = GIRL_WARDROBE_PREVIEW_ITEM_IDS.top
const [GIRL_TROUSERS] = GIRL_WARDROBE_PREVIEW_ITEM_IDS.bottom
const isPricedLook = (loadout: Readonly<Record<string, unknown>>): boolean =>
  Object.values(loadout).some((itemId) => typeof itemId === "string" && R1_WARDROBE_PRICE_COINS[itemId] !== undefined)
const GIRL_NEW_LOOKS = [
  ...GIRL_WARDROBE_PREVIEW_ITEM_IDS.hair.map((hairId) => ({ ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId })),
  { ...DEFAULT_FEMALE_AVATAR_LOADOUT, shoesId: GIRL_WARDROBE_PREVIEW_ITEM_IDS.shoes[0] },
  { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: GIRL_WARDROBE_PREVIEW_ITEM_IDS.hair[0], shoesId: GIRL_WARDROBE_PREVIEW_ITEM_IDS.shoes[0] },
  ...GIRL_WARDROBE_PREVIEW_ITEM_IDS.top.map((topId) => ({ ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId })),
  { ...DEFAULT_FEMALE_AVATAR_LOADOUT, bottomId: GIRL_TROUSERS },
  { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: GIRL_BLACK_CROP, bottomId: GIRL_TROUSERS }
]
const GIRL_PRICED_LOOKS = GIRL_NEW_LOOKS.filter(isPricedLook)
const GIRL_FREE_LOOKS = GIRL_NEW_LOOKS.filter((loadout) => !isPricedLook(loadout))

for (const [label, catalog] of [
  ["development", ECONOMY_CATALOG],
  ["production", resolveProductionEconomyCatalog()]
] as const) {
  test(`a new girl account wears her unpriced additions free and her priced pieces only after buying them (${label} catalog)`, async () => {
    const { avatarService, verified } = await signInWith(catalog)
    assert.ok(GIRL_PRICED_LOOKS.length > 0 && GIRL_FREE_LOOKS.length > 0)
    await saveEach(avatarService, verified.sessionToken, [DEFAULT_FEMALE_AVATAR_LOADOUT, ...GIRL_FREE_LOOKS])
    for (const loadout of GIRL_PRICED_LOOKS) {
      const result = await avatarService.saveAvatar(verified.sessionToken, { loadout, revision: 1 + GIRL_FREE_LOOKS.length })
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
    for (const [slot, ids] of [
      ["hairId", GIRL_WARDROBE_PREVIEW_ITEM_IDS.hair],
      ["shoesId", GIRL_WARDROBE_PREVIEW_ITEM_IDS.shoes],
      ["topId", GIRL_WARDROBE_PREVIEW_ITEM_IDS.top],
      ["bottomId", GIRL_WARDROBE_PREVIEW_ITEM_IDS.bottom]
    ] as const) {
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
  test(`production sells each priced ${wardrobe.label} piece at its R1 price for its own body only and never charges for a starter or an unpriced piece`, async () => {
    assert.ok([...wardrobe.starterIds].every((itemId) => R1_WARDROBE_PRICE_COINS[itemId] === undefined))
    const repository = createInMemoryEconomyRepository()
    const service = createEconomyService({ catalog: resolveProductionEconomyCatalog(), repository })
    const userId = `${wardrobe.label}_user`
    await holdGrantedPieces(repository, userId, [], ENOUGH_COINS_FOR_EVERY_PIECE)
    for (const itemId of wardrobe.ids) {
      const before = (await service.getInventory(userId)).coins
      if (R1_WARDROBE_PRICE_COINS[itemId] === undefined) {
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

// Sim QA beta-5: a boy look saved before his pre-2.5D pieces were retired (2026-10-13) came back as `retired_item`.
// An older app build, or a look loaded before the retirement, still sends those IDs. The save must not fail: each
// retired piece is stored as the body's starter piece (what every read already draws), the rest of the look is kept,
// the retired pieces stay owned, and the strict rules still refuse anything else that is wrong.
const OLD_BOY_LOOK = {
  schemaVersion: 1,
  bodyId: "avatar_v2_body_male_light",
  faceId: "avatar_v2_face_male_warm_friendly",
  eyesId: "avatar_v2_eyes_male_warm_brown",
  noseId: "avatar_v2_nose_male_gentle_bridge",
  mouthId: "avatar_v2_mouth_male_soft_smile",
  hairId: "avatar_v2_hair_male_cocoa_textured_quiff",
  topId: "avatar_v2_top_male_powder_blue_crew_tee",
  bottomId: "avatar_v2_bottom_male_navy_straight_pants",
  shoesId: "avatar_v2_shoes_male_milk_tea_court",
  accessoryIds: []
} as const
const OLD_BOY_PIECES = [OLD_BOY_LOOK.hairId, OLD_BOY_LOOK.topId, OLD_BOY_LOOK.bottomId, OLD_BOY_LOOK.shoesId]

test("an old account's save that still carries retired pieces succeeds and loses nothing", async () => {
  const repository = createInMemoryEconomyRepository()
  const { avatarService, verified } = await signInWith(resolveProductionEconomyCatalog(), repository)
  const older = createDefaultEconomyInventory(verified.account.userId)
  await repository.saveInventory({
    ...older,
    coins: 640,
    ownedAvatarItemIds: [...new Set([...older.ownedAvatarItemIds, ...OLD_BOY_PIECES])]
  })

  const result = await avatarService.saveAvatar(verified.sessionToken, { loadout: OLD_BOY_LOOK, revision: 0 })

  assert.equal(result.kind, "updated", JSON.stringify(result))
  if (result.kind !== "updated") return
  const saved = result.selection.loadout as unknown as Record<string, unknown>
  for (const key of ["bodyId", "faceId", "eyesId", "noseId", "mouthId"] as const) {
    assert.equal(saved[key], OLD_BOY_LOOK[key], key)
  }
  for (const key of ["hairId", "topId", "bottomId", "shoesId"] as const) {
    const wanted = isRetiredAvatarItemId(OLD_BOY_LOOK[key]) ? DEFAULT_MALE_AVATAR_LOADOUT[key] : OLD_BOY_LOOK[key]
    assert.equal(saved[key], wanted, key)
  }
  assert.ok(OLD_BOY_PIECES.some(isRetiredAvatarItemId), "the look really carries retired pieces")
  const after = await repository.getInventory(verified.account.userId)
  assert.equal(after?.coins, 640)
  assert.ok(OLD_BOY_PIECES.every((itemId) => after?.ownedAvatarItemIds.includes(itemId)), "retired pieces stay owned")
})

test("a save with retired pieces is still refused for any other broken item", async () => {
  const { avatarService, verified } = await signInWith(resolveProductionEconomyCatalog())
  const result = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: { ...OLD_BOY_LOOK, faceId: "avatar_v2_face_does_not_exist" },
    revision: 0
  })
  assert.equal(result.kind, "invalid")
  if (result.kind === "invalid") assert.equal(result.code, "unknown_item")
})

// Data policy (lead decision 2026-10-15, never lose user data): a retired piece the user still wears stays stored.
// Every read draws it as the body's starter piece, so the beta-5 app shows the starter and sends it back on its next
// save; an older build sends the retired ID itself. Neither is a change of that slot, so the stored retired ID is kept.
// Only a retired ID that is new for a slot, or one the account does not own, is stored as the starter piece, and any
// real change of the slot replaces it.
const OLD_BOY_SLOTS = ["hairId", "topId", "bottomId", "shoesId"] as const
const RETIRED_OLD_BOY_SLOTS = OLD_BOY_SLOTS.filter((key) => isRetiredAvatarItemId(OLD_BOY_LOOK[key]))

async function wearingTheOldBoyLook(ownedRetired: readonly string[] = OLD_BOY_PIECES) {
  const repository = createInMemoryEconomyRepository()
  const signedIn = await signInWith(resolveProductionEconomyCatalog(), repository)
  const older = createDefaultEconomyInventory(signedIn.verified.account.userId)
  await repository.saveInventory({
    ...older,
    ownedAvatarItemIds: [...new Set([...older.ownedAvatarItemIds, ...ownedRetired])]
  })
  const accountId = signedIn.verified.account.accountId
  const seeded = await signedIn.authService.repository.updateAvatarSelection({
    accountId,
    expectedRevision: 0,
    selection: { presetId: OLD_BOY_LOOK.bodyId, revision: 1, loadout: { ...OLD_BOY_LOOK, accessoryIds: [] } },
    now: new Date()
  })
  assert.equal(seeded.kind, "updated")
  const storedLoadout = async () =>
    (await signedIn.authService.repository.findAccountById(accountId))?.profile.avatar.loadout as unknown as
      Record<string, unknown>
  return { ...signedIn, storedLoadout, shownLoadout: coerceAvatarLoadout(OLD_BOY_LOOK) }
}

test("a save that sends back the starter piece the app was shown keeps the retired piece the user wears", async () => {
  const { avatarService, verified, storedLoadout, shownLoadout } = await wearingTheOldBoyLook()
  assert.ok(RETIRED_OLD_BOY_SLOTS.length > 0, "the look really carries retired pieces")

  const result = await avatarService.saveAvatar(verified.sessionToken, { loadout: shownLoadout, revision: 1 })

  assert.equal(result.kind, "updated", JSON.stringify(result))
  if (result.kind !== "updated") return
  assert.deepEqual(result.selection.loadout, shownLoadout, "the app still draws what it showed")
  const stored = await storedLoadout()
  for (const key of RETIRED_OLD_BOY_SLOTS) assert.equal(stored[key], OLD_BOY_LOOK[key], key)
})

test("an older build that re-sends the retired piece it holds keeps it stored", async () => {
  const { avatarService, verified, storedLoadout, shownLoadout } = await wearingTheOldBoyLook()

  const result = await avatarService.saveAvatar(verified.sessionToken, { loadout: OLD_BOY_LOOK, revision: 1 })

  assert.equal(result.kind, "updated", JSON.stringify(result))
  if (result.kind === "updated") assert.deepEqual(result.selection.loadout, shownLoadout)
  const stored = await storedLoadout()
  for (const key of RETIRED_OLD_BOY_SLOTS) assert.equal(stored[key], OLD_BOY_LOOK[key], key)
})

test("a real change of one slot replaces only that slot's retired piece", async () => {
  const changedKey = RETIRED_OLD_BOY_SLOTS[0]
  assert.ok(changedKey)
  const slot = changedKey.replace(/Id$/, "")
  const replacement = AVATAR_ITEM_RULES.items.find((item) =>
    item.slot === slot && item.supportedBodyIds.includes(OLD_BOY_LOOK.bodyId) &&
    !isRetiredAvatarItemId(item.itemId) && item.itemId !== DEFAULT_MALE_AVATAR_LOADOUT[changedKey])
  assert.ok(replacement, `a second wearable ${slot} exists for the boy`)
  const { avatarService, verified, repository, storedLoadout, shownLoadout } =
    await wearingTheOldBoyLook()
  const inventory = await repository.getInventory(verified.account.userId)
  assert.ok(inventory)
  await repository.saveInventory({
    ...inventory,
    ownedAvatarItemIds: [...inventory.ownedAvatarItemIds, replacement.itemId]
  })

  const result = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: { ...shownLoadout, [changedKey]: replacement.itemId },
    revision: 1
  })

  assert.equal(result.kind, "updated", JSON.stringify(result))
  const stored = await storedLoadout()
  assert.equal(stored[changedKey], replacement.itemId)
  for (const key of RETIRED_OLD_BOY_SLOTS.filter((other) => other !== changedKey)) {
    assert.equal(stored[key], OLD_BOY_LOOK[key], key)
  }
})

test("a retired piece that is new for a slot, or not owned, is stored as the starter piece", async () => {
  const { avatarService, verified, storedLoadout } = await wearingTheOldBoyLook([])
  const result = await avatarService.saveAvatar(verified.sessionToken, { loadout: OLD_BOY_LOOK, revision: 1 })
  assert.equal(result.kind, "updated", JSON.stringify(result))
  const unowned = await storedLoadout()
  for (const key of RETIRED_OLD_BOY_SLOTS) {
    assert.equal(unowned[key], DEFAULT_MALE_AVATAR_LOADOUT[key], `${key}: an unowned retired piece is not kept`)
  }

  const fresh = await signInWith(resolveProductionEconomyCatalog())
  const saved = await fresh.avatarService.saveAvatar(fresh.verified.sessionToken, { loadout: OLD_BOY_LOOK, revision: 0 })
  assert.equal(saved.kind, "updated", JSON.stringify(saved))
  const stored = (await fresh.authService.repository.findAccountById(fresh.verified.account.accountId))
    ?.profile.avatar.loadout as unknown as Record<string, unknown>
  for (const key of RETIRED_OLD_BOY_SLOTS) {
    assert.equal(stored[key], DEFAULT_MALE_AVATAR_LOADOUT[key], `${key}: a retired piece new for the slot`)
  }
})
