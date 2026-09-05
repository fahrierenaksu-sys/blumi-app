import assert from "node:assert/strict"
import test from "node:test"
import {
  isAcceptedAvatarLoadout,
  isAvatarLoadoutV1,
  isAvatarLoadoutV2,
  type AvatarLoadoutV2
} from "@blumi/contracts"
import { ECONOMY_CATALOG } from "../economy/economyCatalog"
import {
  AVATAR_LOADOUT_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  type AvatarLoadoutCatalogItem
} from "./avatarLoadoutCatalog"
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
    "wrong_slot"
  )
})

test("V2 dressId uses the existing dress entitlement and keeps separates underneath", () => {
  const dressId = "avatar_v2_top_boho_patchwork_maxi_dress"
  const pairedBottomId = "avatar_v2_bottom_boho_patchwork_maxi_dress"
  const v2 = toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT)

  assert.equal(
    validateAvatarLoadout(
      { ...v2, dressId },
      [...ownedDefaultIds, dressId, pairedBottomId]
    ).ok,
    true
  )
  assert.equal(
    validateAvatarLoadout(
      { ...v2, dressId },
      [...ownedDefaultIds, dressId]
    ).code,
    "unowned_item"
  )
  assert.equal(
    validateAvatarLoadout(
      { ...v2, topId: dressId },
      [...ownedDefaultIds, dressId, pairedBottomId]
    ).code,
    "outfit_pair_mismatch"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...toAvatarLoadoutV2(DEFAULT_MALE_AVATAR_LOADOUT),
        dressId
      },
      [...ownedDefaultIds, dressId, pairedBottomId]
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

test("the canonical male starter uses the motion-ready fitted basics", () => {
  assert.equal(
    DEFAULT_MALE_AVATAR_LOADOUT.topId,
    "avatar_v2_top_male_powder_blue_crew_tee"
  )
  assert.equal(
    DEFAULT_MALE_AVATAR_LOADOUT.bottomId,
    "avatar_v2_bottom_male_navy_straight_pants"
  )
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
  const missingShoes = { ...DEFAULT_FEMALE_AVATAR_LOADOUT }
  delete (missingShoes as Partial<typeof missingShoes>).shoesId
  assert.equal(validateAvatarLoadout(missingShoes, ownedDefaultIds).code, "invalid_shape")

  assert.equal(
    validateAvatarLoadout(
      { ...DEFAULT_FEMALE_AVATAR_LOADOUT, hairId: "missing_hair" },
      ownedDefaultIds
    ).code,
    "unknown_item"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...DEFAULT_FEMALE_AVATAR_LOADOUT,
        topId: DEFAULT_FEMALE_AVATAR_LOADOUT.hairId
      },
      ownedDefaultIds
    ).code,
    "wrong_slot"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...DEFAULT_FEMALE_AVATAR_LOADOUT,
        hairId: "avatar_v2_hair_golden_waves"
      },
      ownedDefaultIds
    ).code,
    "unowned_item"
  )
})

test("accessories are unique, bounded, and limited to one per group", () => {
  const duplicate = "avatar_v2_accessory_cherry_bow_headband"
  assert.equal(
    validateAvatarLoadout(
      {
        ...DEFAULT_FEMALE_AVATAR_LOADOUT,
        accessoryIds: [duplicate, duplicate]
      },
      ownedDefaultIds
    ).code,
    "duplicate_accessory"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...DEFAULT_FEMALE_AVATAR_LOADOUT,
        accessoryIds: [
          "avatar_v2_accessory_ivory_ribbon_beret",
          "avatar_v2_accessory_cherry_bow_headband"
        ]
      },
      [...ownedDefaultIds, "avatar_v2_accessory_cherry_bow_headband"]
    ).code,
    "accessory_group_conflict"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...DEFAULT_FEMALE_AVATAR_LOADOUT,
        accessoryIds: Array(7).fill(duplicate)
      },
      ownedDefaultIds
    ).code,
    "too_many_accessories"
  )
})

test("dress tops require their exact paired hidden bottom", () => {
  const dressTopId = "avatar_v2_top_boho_patchwork_maxi_dress"
  const dressBottomId = "avatar_v2_bottom_boho_patchwork_maxi_dress"
  const ownedIds = [...ownedDefaultIds, dressTopId, dressBottomId]

  assert.equal(
    validateAvatarLoadout(
      { ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: dressTopId },
      ownedIds
    ).code,
    "outfit_pair_mismatch"
  )
  assert.equal(
    validateAvatarLoadout(
      {
        ...DEFAULT_FEMALE_AVATAR_LOADOUT,
        topId: dressTopId,
        bottomId: dressBottomId
      },
      ownedIds
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
