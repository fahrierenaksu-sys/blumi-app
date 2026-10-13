import assert from "node:assert/strict"
import test from "node:test"
import {
  BOY_WARDROBE_PREVIEW_ALL_IDS,
  BOY_WARDROBE_PREVIEW_ITEM_IDS,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT
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
import { createAvatarService } from "./avatarService"

test("avatar save is authenticated, ownership-checked, and revision-safe", async () => {
  const authService = createAuthService({
    store: createBlumiBackendStore(),
    codeFactory: () => "482931"
  })
  const economyService = createEconomyService()
  const avatarService = createAvatarService({
    authService,
    economyService
  })
  await authService.sendCode("+905551112233")
  const verified = await authService.verifyCode("+905551112233", "482931")

  const updated = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: DEFAULT_MALE_AVATAR_LOADOUT,
    revision: 0
  })
  assert.equal(updated.kind, "updated")
  if (updated.kind !== "updated") return
  assert.equal(updated.selection.revision, 1)
  assert.equal(updated.selection.presetId, DEFAULT_MALE_AVATAR_LOADOUT.bodyId)

  const stored = await authService.getSession(verified.sessionToken)
  assert.deepEqual(stored?.account.profile.avatar, updated.selection)

  const stale = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: DEFAULT_FEMALE_AVATAR_LOADOUT,
    revision: 0
  })
  assert.equal(stale.kind, "conflict")
  if (stale.kind === "conflict") {
    assert.deepEqual(stale.current, updated.selection)
  }

  const unowned = await avatarService.saveAvatar(verified.sessionToken, {
    loadout: {
      ...DEFAULT_FEMALE_AVATAR_LOADOUT,
      hairId: "avatar_v2_hair_golden_waves"
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
