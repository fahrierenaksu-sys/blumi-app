import assert from "node:assert/strict"
import test from "node:test"
import {
  BOY_WARDROBE_PREVIEW_ALL_IDS,
  BOY_WARDROBE_PREVIEW_ITEM_IDS,
  GIRL_WARDROBE_PREVIEW_ALL_IDS,
  GIRL_WARDROBE_PREVIEW_ITEM_IDS,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
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

// The boy's 2.5D wardrobe is free and owned by every account during testing (owner yes, 2026-10-13): the server
// accepts each of his outfits and a mixed look for a new account and for an account made before the items existed,
// with both the development catalog and the production (receipt-filtered) one. The girl's looks are unchanged.
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

async function signInWith(catalog: readonly EconomyCatalogItem[], repository = createInMemoryEconomyRepository()) {
  const authService = createAuthService({ store: createBlumiBackendStore(), codeFactory: () => "482931" })
  const avatarService = createAvatarService({ authService, economyService: createEconomyService({ catalog, repository }) })
  await authService.sendCode("+905551112233")
  const verified = await authService.verifyCode("+905551112233", "482931")
  return { avatarService, verified, repository }
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

for (const [label, catalog] of [
  ["development", ECONOMY_CATALOG],
  ["production", resolveProductionEconomyCatalog()]
] as const) {
  test(`a new account saves every boy outfit and a mixed look (${label} catalog)`, async () => {
    const { avatarService, verified } = await signInWith(catalog)
    await saveEach(avatarService, verified.sessionToken, [...BOY_OUTFITS, BOY_MIXED_LOOK])
  })

  test(`an account made before the boy wardrobe existed saves his looks without a reset (${label} catalog)`, async () => {
    const repository = createInMemoryEconomyRepository()
    const { avatarService, verified } = await signInWith(catalog, repository)
    const boyIds = new Set(BOY_WARDROBE_PREVIEW_ALL_IDS)
    const older = createDefaultEconomyInventory(verified.account.userId)
    await repository.saveInventory({
      ...older,
      coins: 640,
      ownedAvatarItemIds: older.ownedAvatarItemIds.filter((itemId) => !boyIds.has(itemId))
    })
    await saveEach(avatarService, verified.sessionToken, [BOY_MIXED_LOOK, ...BOY_OUTFITS])
    const healed = await repository.getInventory(verified.account.userId)
    assert.equal(healed?.coins, 640)
    assert.ok(BOY_WARDROBE_PREVIEW_ALL_IDS.every((itemId) => healed?.ownedAvatarItemIds.includes(itemId)))
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

// The girl's 2.5D additions (girlWardrobePreview.ts) are free and owned by every account on the boy's testing terms:
// she saves them alone and mixed with her starter, an account made before they existed gets them by the inventory
// self-heal, the boy cannot wear them and nobody can buy them.
const [, GIRL_BLACK_CROP] = GIRL_WARDROBE_PREVIEW_ITEM_IDS.top
const [GIRL_TROUSERS] = GIRL_WARDROBE_PREVIEW_ITEM_IDS.bottom
const GIRL_NEW_LOOKS = [
  ...GIRL_WARDROBE_PREVIEW_ITEM_IDS.hair.map((hairId) => ({ ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId })),
  { ...DEFAULT_FEMALE_AVATAR_LOADOUT, shoesId: GIRL_WARDROBE_PREVIEW_ITEM_IDS.shoes[0] },
  { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: GIRL_WARDROBE_PREVIEW_ITEM_IDS.hair[0], shoesId: GIRL_WARDROBE_PREVIEW_ITEM_IDS.shoes[0] },
  ...GIRL_WARDROBE_PREVIEW_ITEM_IDS.top.map((topId) => ({ ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId })),
  { ...DEFAULT_FEMALE_AVATAR_LOADOUT, bottomId: GIRL_TROUSERS },
  { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: GIRL_BLACK_CROP, bottomId: GIRL_TROUSERS }
]

for (const [label, catalog] of [
  ["development", ECONOMY_CATALOG],
  ["production", resolveProductionEconomyCatalog()]
] as const) {
  test(`a girl account made before her new pieces existed saves them without a reset (${label} catalog)`, async () => {
    const repository = createInMemoryEconomyRepository()
    const { avatarService, verified } = await signInWith(catalog, repository)
    const girlIds = new Set(GIRL_WARDROBE_PREVIEW_ALL_IDS)
    const older = createDefaultEconomyInventory(verified.account.userId)
    await repository.saveInventory({
      ...older,
      coins: 640,
      ownedAvatarItemIds: older.ownedAvatarItemIds.filter((itemId) => !girlIds.has(itemId))
    })
    await saveEach(avatarService, verified.sessionToken, GIRL_NEW_LOOKS)
    const healed = await repository.getInventory(verified.account.userId)
    assert.equal(healed?.coins, 640)
    assert.ok(GIRL_WARDROBE_PREVIEW_ALL_IDS.every((itemId) => healed?.ownedAvatarItemIds.includes(itemId)))
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

test("the girl's new pieces are never sold", async () => {
  const service = createEconomyService({ catalog: resolveProductionEconomyCatalog() })
  for (const itemId of GIRL_WARDROBE_PREVIEW_ALL_IDS) {
    await assert.rejects(
      () => service.purchaseItem("girl_user", { type: "avatar", itemId, avatarBodyId: "avatar_v2_body_default" }),
      itemId
    )
  }
  assert.equal((await service.getInventory("girl_user")).coins, STARTER_COIN_BALANCE)
})

test("the boy's pieces are never sold", async () => {
  const service = createEconomyService({ catalog: resolveProductionEconomyCatalog() })
  for (const itemId of BOY_WARDROBE_PREVIEW_ALL_IDS) {
    await assert.rejects(
      () => service.purchaseItem("boy_user", { type: "avatar", itemId, avatarBodyId: "avatar_v2_body_male_light" }),
      itemId
    )
  }
  assert.equal((await service.getInventory("boy_user")).coins, STARTER_COIN_BALANCE)
})

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
