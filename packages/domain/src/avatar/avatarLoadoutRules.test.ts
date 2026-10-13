import assert from "node:assert/strict"
import test from "node:test"
import {
  isAcceptedAvatarLoadout,
  isAvatarLoadoutV1,
  isAvatarLoadoutV2,
  type AvatarLoadoutV2
} from "@blumi/contracts"
import { ECONOMY_CATALOG } from "../economy/economyCatalog"
import { isReleaseCatalogItemPublished } from "../release/releaseCatalog"
import { BOY_WARDROBE_PREVIEW_ALL_IDS } from "./boyWardrobePreview"
import {
  AVATAR_LOADOUT_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  type AvatarLoadoutCatalogItem
} from "./avatarLoadoutCatalog"
import { isAvatarLoadoutItemCompatibleWithBody } from "./avatarItemRules"
import {
  TEST_AVATAR_ITEM as T,
  TEST_AVATAR_ITEM_RULES as fixtureRules,
  TEST_AVATAR_OWNED_BY_DEFAULT_IDS as fixtureOwnedIds
} from "./avatarItemRulesFixture"
import {
  cloneAvatarLoadout,
  createAvatarSelection,
  projectAvatarLoadoutV1,
  toAvatarLoadoutV2,
  validateAvatarLoadout
} from "./avatarLoadoutRules"

const ownedDefaultIds = ECONOMY_CATALOG
  .filter((item) => item.type === "avatar" && item.ownedByDefault === true)
  .map((item) => item.itemId)
// Plan X15: the live catalog has no dress, accessory or second piece per slot, so the rule tests below that need
// them run on the injected test-only catalog (`avatarItemRulesFixture.ts`) with the same assertions.
const fixtureGirl = fixtureRules.starters.female
const fixtureBoy = fixtureRules.starters.male

test("schema-specific loadout guards reject missing, unknown, and extra keys", () => {
  const v1 = DEFAULT_FEMALE_AVATAR_LOADOUT
  const v2: AvatarLoadoutV2 = {
    ...v1,
    schemaVersion: 2,
    dressId: null,
    outerwearId: null,
    accessoryIds: [...v1.accessoryIds]
  }

  assert.equal(isAvatarLoadoutV1(v1), true)
  assert.equal(isAvatarLoadoutV1(v2), false)
  assert.equal(isAvatarLoadoutV2(v2), true)
  assert.equal(isAvatarLoadoutV2(v1), false)
  assert.equal(isAcceptedAvatarLoadout(v1), true)
  assert.equal(isAcceptedAvatarLoadout(v2), true)

  const v1MissingShoes = { ...v1 }
  delete (v1MissingShoes as Partial<typeof v1MissingShoes>).shoesId
  assert.equal(isAvatarLoadoutV1(v1MissingShoes), false)
  assert.equal(isAvatarLoadoutV1({ ...v1, unknownKey: true }), false)

  for (const invalid of [
    { ...v2, schemaVersion: 3 },
    { ...v2, dressId: undefined },
    { ...v2, outerwearId: "" },
    { ...v2, extra: true },
    Object.fromEntries(Object.entries(v2).filter(([key]) => key !== "shoesId"))
  ]) {
    assert.equal(isAvatarLoadoutV2(invalid), false)
    assert.equal(isAcceptedAvatarLoadout(invalid), false)
  }
})

test("V1 loadouts canonically convert to V2 and project back without mutation", () => {
  const v1 = DEFAULT_FEMALE_AVATAR_LOADOUT
  const v2 = toAvatarLoadoutV2(v1)

  assert.deepEqual(v2, {
    ...v1,
    schemaVersion: 2,
    dressId: null,
    outerwearId: null
  })
  assert.notEqual(v2.accessoryIds, v1.accessoryIds)
  assert.deepEqual(projectAvatarLoadoutV1(v2), v1)

  const cloned = cloneAvatarLoadout(v2)
  assert.deepEqual(cloned, v2)
  assert.notEqual(cloned, v2)
  assert.notEqual(cloned.accessoryIds, v2.accessoryIds)
})

test("legacy paired dresses round-trip through V2 dressId with starter separates", () => {
  const legacyDress = {
    ...DEFAULT_FEMALE_AVATAR_LOADOUT,
    topId: "avatar_v2_top_boho_patchwork_maxi_dress",
    bottomId: "avatar_v2_bottom_boho_patchwork_maxi_dress",
    accessoryIds: [...DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds]
  }

  const v2 = toAvatarLoadoutV2(legacyDress)
  assert.equal(v2.dressId, legacyDress.topId)
  assert.equal(v2.topId, DEFAULT_FEMALE_AVATAR_LOADOUT.topId)
  assert.equal(v2.bottomId, DEFAULT_FEMALE_AVATAR_LOADOUT.bottomId)
  assert.deepEqual(projectAvatarLoadoutV1(v2), legacyDress)
})

test("V2 validation accepts explicit empty new slots and rejects unavailable items", () => {
  const v2 = toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT)
  const result = validateAvatarLoadout(v2, ownedDefaultIds)

  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.loadout.schemaVersion, 2)
  assert.equal(
    validateAvatarLoadout(
      { ...v2, dressId: "avatar_v2_dress_not_in_catalog" },
      [...ownedDefaultIds, "avatar_v2_dress_not_in_catalog"]
    ).code,
    "unknown_item"
  )
  assert.equal(
    validateAvatarLoadout(
      { ...v2, outerwearId: DEFAULT_FEMALE_AVATAR_LOADOUT.topId },
      ownedDefaultIds
    ).code,
    "unknown_item"
  )
})

test("retired tops and unsupported outerwear cannot be equipped even when owned", () => {
  const v2 = toAvatarLoadoutV2(fixtureGirl, fixtureRules)
  assert.equal(
    validateAvatarLoadout(
      { ...v2, topId: T.retiredTop },
      [...fixtureOwnedIds, T.retiredTop],
      fixtureRules
    ).code,
    "retired_item"
  )
  assert.equal(
    validateAvatarLoadout(
      { ...v2, outerwearId: T.girlTopPaid },
      [...fixtureOwnedIds, T.girlTopPaid],
      fixtureRules
    ).code,
    "unknown_item"
  )
})

test("V2 dressId uses the existing dress entitlement and keeps separates underneath", () => {
  const dressId = T.dressTop
  const pairedBottomId = T.dressBottom
  const v2 = toAvatarLoadoutV2(fixtureGirl, fixtureRules)

  assert.equal(
    validateAvatarLoadout(
      { ...v2, dressId },
      [...fixtureOwnedIds, dressId, pairedBottomId],
      fixtureRules
    ).ok,
    true
  )
  assert.equal(
    validateAvatarLoadout(
      { ...v2, dressId },
      [...fixtureOwnedIds, dressId],
      fixtureRules
    ).code,
    "unowned_item"
  )
  assert.equal(
    validateAvatarLoadout(
      { ...v2, topId: dressId },
      [...fixtureOwnedIds, dressId, pairedBottomId],
      fixtureRules
    ).code,
    "outfit_pair_mismatch"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...toAvatarLoadoutV2(fixtureBoy, fixtureRules),
        dressId
      },
      [...fixtureOwnedIds, dressId, pairedBottomId],
      fixtureRules
    ).code,
    "incompatible_item"
  )
})

test("female and male starter loadouts are valid immutable selections", () => {
  for (const loadout of [
    DEFAULT_FEMALE_AVATAR_LOADOUT,
    DEFAULT_MALE_AVATAR_LOADOUT
  ]) {
    const result = validateAvatarLoadout(loadout, ownedDefaultIds)
    assert.equal(result.ok, true)
    if (!result.ok) continue
    assert.deepEqual(result.loadout, loadout)
    assert.notEqual(result.loadout, loadout)
    assert.notEqual(result.loadout.accessoryIds, loadout.accessoryIds)

    const selection = createAvatarSelection(result.loadout, 3)
    assert.equal(selection.presetId, loadout.bodyId)
    assert.equal(selection.revision, 3)
    assert.notEqual(selection.loadout, result.loadout)
  }

  for (const revision of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => createAvatarSelection(DEFAULT_FEMALE_AVATAR_LOADOUT, revision),
      /non-negative safe integer/
    )
  }
})

test("the free masculine crew tee is valid only with the male body", () => {
  const topId = "avatar_v2_top_male_powder_blue_crew_tee"
  const ownedIds = [...ownedDefaultIds, topId]

  assert.equal(
    validateAvatarLoadout(
      { ...DEFAULT_MALE_AVATAR_LOADOUT, topId },
      ownedIds
    ).ok,
    true
  )
  assert.equal(
    validateAvatarLoadout(
      { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId },
      ownedIds
    ).code,
    "incompatible_item"
  )
})

test("the free navy straight pants are valid only with the male body", () => {
  const bottomId = "avatar_v2_bottom_male_navy_straight_pants"
  const ownedIds = [...ownedDefaultIds, bottomId]

  assert.equal(
    validateAvatarLoadout(
      { ...DEFAULT_MALE_AVATAR_LOADOUT, bottomId },
      ownedIds
    ).ok,
    true
  )
  assert.equal(
    validateAvatarLoadout(
      { ...DEFAULT_FEMALE_AVATAR_LOADOUT, bottomId },
      ownedIds
    ).code,
    "incompatible_item"
  )
})

test("shared avatar catalog and starter loadouts cannot be mutated at runtime", () => {
  assert.equal(Object.isFrozen(AVATAR_LOADOUT_CATALOG), true)
  assert.equal(Object.isFrozen(AVATAR_LOADOUT_CATALOG[0]), true)
  assert.equal(Object.isFrozen(DEFAULT_FEMALE_AVATAR_LOADOUT), true)
  assert.equal(Object.isFrozen(DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds), true)
  assert.throws(() => {
    ;(AVATAR_LOADOUT_CATALOG as AvatarLoadoutCatalogItem[]).push({
      itemId: "injected",
      slot: "body",
      supportedBodyIds: ["injected"]
    })
  }, TypeError)
})

test("loadout validation rejects items fitted for another body", () => {
  assert.equal(
    validateAvatarLoadout(
      {
        ...DEFAULT_MALE_AVATAR_LOADOUT,
        hairId: DEFAULT_FEMALE_AVATAR_LOADOUT.hairId
      },
      ownedDefaultIds
    ).code,
    "incompatible_item"
  )
})

test("loadout validation rejects malformed, unknown, wrong-slot, and unowned items", () => {
  const missingShoes = { ...fixtureGirl }
  delete (missingShoes as Partial<typeof missingShoes>).shoesId
  assert.equal(validateAvatarLoadout(missingShoes, fixtureOwnedIds, fixtureRules).code, "invalid_shape")

  assert.equal(
    validateAvatarLoadout(
      { ...fixtureGirl, hairId: "missing_hair" },
      fixtureOwnedIds,
      fixtureRules
    ).code,
    "unknown_item"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...fixtureGirl,
        topId: fixtureGirl.hairId
      },
      fixtureOwnedIds,
      fixtureRules
    ).code,
    "wrong_slot"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...fixtureGirl,
        hairId: T.girlHairPaid
      },
      fixtureOwnedIds,
      fixtureRules
    ).code,
    "unowned_item"
  )
})

test("accessories are unique, bounded, and limited to one per group", () => {
  const duplicate = T.paidHeadwear
  assert.equal(
    validateAvatarLoadout(
      {
        ...fixtureGirl,
        accessoryIds: [duplicate, duplicate]
      },
      fixtureOwnedIds,
      fixtureRules
    ).code,
    "duplicate_accessory"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...fixtureGirl,
        accessoryIds: [
          T.freeHeadwear,
          T.paidHeadwear
        ]
      },
      [...fixtureOwnedIds, T.paidHeadwear],
      fixtureRules
    ).code,
    "accessory_group_conflict"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...fixtureGirl,
        accessoryIds: Array(7).fill(duplicate)
      },
      fixtureOwnedIds,
      fixtureRules
    ).code,
    "too_many_accessories"
  )
})

test("dress tops require their exact paired hidden bottom", () => {
  const dressTopId = T.dressTop
  const dressBottomId = T.dressBottom
  const ownedIds = [...fixtureOwnedIds, dressTopId, dressBottomId]

  assert.equal(
    validateAvatarLoadout(
      { ...fixtureGirl, topId: dressTopId },
      ownedIds,
      fixtureRules
    ).code,
    "outfit_pair_mismatch"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...fixtureGirl,
        topId: dressTopId,
        bottomId: dressBottomId
      },
      ownedIds,
      fixtureRules
    ).ok,
    true
  )
})

test("every economy avatar entitlement and grant has loadout metadata", () => {
  const manifestIds = new Set(
    AVATAR_LOADOUT_CATALOG.map((item) => item.itemId)
  )
  const economyAvatarIds = ECONOMY_CATALOG
    .filter((item) => item.type === "avatar")
    .flatMap((item) => [item.itemId, ...(item.grantedItemIds ?? [])])

  for (const itemId of economyAvatarIds) {
    assert.equal(manifestIds.has(itemId), true, itemId)
  }
  assert.equal(manifestIds.size, new Set(economyAvatarIds).size)
})

test("the boy's 2.5D wardrobe is free and owned by every account, for the male body only", () => {
  for (const itemId of BOY_WARDROBE_PREVIEW_ALL_IDS) {
    const entry = ECONOMY_CATALOG.find((item) => item.type === "avatar" && item.itemId === itemId)
    assert.equal(entry?.priceCoins, 0, itemId)
    assert.equal(entry?.ownedByDefault, true, itemId)
    assert.equal(isReleaseCatalogItemPublished(itemId), false, `${itemId} has no receipt`)
    assert.equal(isAvatarLoadoutItemCompatibleWithBody(itemId, "avatar_v2_body_male_light"), true, itemId)
    assert.equal(isAvatarLoadoutItemCompatibleWithBody(itemId, DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId), false, itemId)
  }
})

test("the test-only fixture catalog shares no item ID with the live catalogs and the rules default to the live one", () => {
  const liveIds = new Set([
    ...AVATAR_LOADOUT_CATALOG.map((item) => item.itemId),
    ...ECONOMY_CATALOG.map((item) => item.itemId)
  ])
  // the bodies are the live bodies; every garment, face piece and accessory is a fixture
  const liveBodies = [DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId, DEFAULT_MALE_AVATAR_LOADOUT.bodyId]
  for (const item of fixtureRules.items) {
    if (item.slot === "body") {
      assert.ok(liveBodies.includes(item.itemId), item.itemId)
      continue
    }
    assert.equal(liveIds.has(item.itemId), false, item.itemId)
    assert.match(item.itemId, /^fixture_avatar_/)
  }
  // a fixture look is unknown to the default (live) rules: production never reads the fixture
  assert.equal(validateAvatarLoadout(fixtureGirl, fixtureOwnedIds).code, "unknown_item")
  assert.equal(validateAvatarLoadout(fixtureGirl, fixtureOwnedIds, fixtureRules).ok, true)
  assert.equal(validateAvatarLoadout(fixtureBoy, fixtureOwnedIds, fixtureRules).ok, true)
})
