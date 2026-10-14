import assert from "node:assert/strict"
import test from "node:test"
import {
  AVATAR_LOADOUT_CATALOG,
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT
} from "./avatarLoadoutCatalog"
import { coerceAvatarLoadout } from "./avatarLoadoutCoercion"
import { toAvatarLoadoutV2, validateAvatarLoadout } from "./avatarLoadoutRules"
import { RETIRED_AVATAR_ITEM_IDS } from "./retiredAvatarItems"
import { AVATAR_ITEM_RULES, type AvatarItemRules } from "./avatarItemRules"
import { TEST_AVATAR_ITEM, TEST_AVATAR_ITEM_RULES } from "./avatarItemRulesFixture"

const ALL_IDS = AVATAR_LOADOUT_CATALOG.map((item) => item.itemId)
const SLOT_KEYS = ["faceId", "eyesId", "noseId", "mouthId", "hairId", "topId", "bottomId", "shoesId"] as const
const STRANGE_VALUES: unknown[] = [
  "avatar_v1_unknown", "", " ", "x".repeat(1000), "room_v3_bed_blumi_starter", null, undefined, 42, {}, [],
  ...RETIRED_AVATAR_ITEM_IDS
]

function assertWearable(loadout: unknown, label: string): void {
  const result = validateAvatarLoadout(loadout, ALL_IDS)
  assert.ok(result.ok, `${label}: ${result.ok ? "" : result.code}`)
}

test("any value in any slot, for either body and schema, coerces to a wearable look", () => {
  for (const starter of [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]) {
    for (const baseline of [starter, toAvatarLoadoutV2(starter)]) {
      for (const key of [...SLOT_KEYS, "bodyId", "accessoryIds", "dressId", "outerwearId", "schemaVersion"]) {
        for (const value of STRANGE_VALUES) {
          const coerced = coerceAvatarLoadout({ ...baseline, [key]: value }, { presetId: starter.bodyId })
          assertWearable(coerced, `${starter.bodyId} ${key}=${String(value).slice(0, 40)}`)
          assert.equal(coerced.bodyId, starter.bodyId)
          if (SLOT_KEYS.includes(key as (typeof SLOT_KEYS)[number])) {
            assert.equal(coerced[key as (typeof SLOT_KEYS)[number]], starter[key as (typeof SLOT_KEYS)[number]])
          }
        }
      }
    }
  }
})

test("every catalog item placed in every slot coerces to a wearable look without throwing", () => {
  for (const starter of [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]) {
    for (const item of AVATAR_LOADOUT_CATALOG) {
      for (const key of [...SLOT_KEYS, "dressId"]) {
        const coerced = coerceAvatarLoadout({ ...toAvatarLoadoutV2(starter), [key]: item.itemId })
        assertWearable(coerced, `${starter.bodyId} ${key}=${item.itemId}`)
      }
    }
  }
})

// Plan X15: the live catalog has no second top per body, so this runs on the injected test-only catalog.
test("wearable items are kept; other-body, retired and outerwear items are not", () => {
  const rules = TEST_AVATAR_ITEM_RULES
  const { female, male } = rules.starters
  const girlOnlyTop = rules.items.find((item) =>
    item.slot === "top" && !item.pairedItemId && item.itemId !== female.topId &&
    !rules.retiredItemIds.has(item.itemId) && !item.supportedBodyIds.includes(male.bodyId))
  assert.ok(girlOnlyTop)
  const girl = coerceAvatarLoadout({ ...female, topId: girlOnlyTop.itemId }, {}, rules)
  assert.equal(girl.topId, girlOnlyTop.itemId)
  const boy = coerceAvatarLoadout({ ...male, topId: girlOnlyTop.itemId }, {}, rules)
  assert.equal(boy.topId, male.topId)
  const v2 = coerceAvatarLoadout({ ...toAvatarLoadoutV2(female, rules), outerwearId: "avatar_v2_outerwear_future_coat" }, {}, rules)
  assert.equal(v2.schemaVersion === 2 ? v2.outerwearId : "v1", null)
})

test("an unknown body takes the preset, then the gender, then the girl", () => {
  const unknownBody = { ...DEFAULT_FEMALE_AVATAR_LOADOUT, bodyId: "avatar_v1_body_gone" }
  assert.equal(coerceAvatarLoadout(unknownBody, { presetId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId }).bodyId, DEFAULT_MALE_AVATAR_LOADOUT.bodyId)
  assert.deepEqual(coerceAvatarLoadout(unknownBody, { presetId: "dusk", gender: "man" }), DEFAULT_MALE_AVATAR_LOADOUT)
  assert.deepEqual(coerceAvatarLoadout(unknownBody, { presetId: "sunset" }), DEFAULT_FEMALE_AVATAR_LOADOUT)
  assert.deepEqual(coerceAvatarLoadout("not a loadout"), DEFAULT_FEMALE_AVATAR_LOADOUT)
})

test("coercion never changes its input", () => {
  const stored = { ...toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT), hairId: "avatar_v1_unknown", accessoryIds: ["a", "b"] }
  const before = JSON.stringify(stored)
  coerceAvatarLoadout(stored)
  assert.equal(JSON.stringify(stored), before)
})

// Review A F2: a look the strict save rules accept must read back unchanged,
// so the tolerant reader never silently changes a valid saved look.
// Plan X15: the live catalog alone now yields too few valid looks, so the injected test-only catalog
// (dresses, accessories, several pieces per slot) runs too; the threshold is unchanged.
test("a loadout the strict rules accept is returned unchanged", () => {
  let checked = 0
  for (const rules of [AVATAR_ITEM_RULES, TEST_AVATAR_ITEM_RULES] satisfies AvatarItemRules[]) {
    const allIds = rules.items.map((item) => item.itemId)
    for (const starter of [rules.starters.female, rules.starters.male]) {
      for (const baseline of [starter, toAvatarLoadoutV2(starter, rules)]) {
        const variants: unknown[] = [baseline]
        for (const item of rules.items) {
          for (const key of SLOT_KEYS) variants.push({ ...baseline, [key]: item.itemId })
          variants.push({ ...baseline, accessoryIds: [item.itemId] })
          if (baseline.schemaVersion === 2 && item.pairedItemId) {
            variants.push({ ...baseline, topId: item.itemId, bottomId: item.pairedItemId, dressId: item.itemId })
          }
        }
        for (const variant of variants) {
          const strict = validateAvatarLoadout(variant, allIds, rules)
          if (!strict.ok) continue
          checked += 1
          assert.deepEqual(coerceAvatarLoadout(variant, { presetId: starter.bodyId }, rules), strict.loadout)
        }
      }
    }
  }
  assert.ok(checked > 50, `only ${checked} strictly valid looks were checked`)
})

test("a stored one-piece dress is kept when wearable and dropped (separates show) when not", () => {
  const T = TEST_AVATAR_ITEM
  const rules = TEST_AVATAR_ITEM_RULES
  const girl = { ...toAvatarLoadoutV2(rules.starters.female, rules), topId: T.girlTopPaid, dressId: T.onePieceDress }
  const kept = coerceAvatarLoadout(girl, {}, rules)
  assert.equal(kept.schemaVersion === 2 && kept.dressId, T.onePieceDress)
  assert.equal(kept.topId, T.girlTopPaid)

  const boy = { ...toAvatarLoadoutV2(rules.starters.male, rules), dressId: T.onePieceDress }
  const dropped = coerceAvatarLoadout(boy, {}, rules)
  assert.equal(dropped.schemaVersion === 2 && dropped.dressId, null)
  assert.equal(dropped.topId, rules.starters.male.topId)
})
