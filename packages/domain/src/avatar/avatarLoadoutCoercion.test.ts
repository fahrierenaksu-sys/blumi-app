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

test("wearable items are kept; other-body, retired and outerwear items are not", () => {
  const girlOnlyTop = AVATAR_LOADOUT_CATALOG.find((item) =>
    item.slot === "top" && !item.pairedItemId && item.itemId !== DEFAULT_FEMALE_AVATAR_LOADOUT.topId &&
    !RETIRED_AVATAR_ITEM_IDS.has(item.itemId) && !item.supportedBodyIds.includes(DEFAULT_MALE_AVATAR_LOADOUT.bodyId))
  assert.ok(girlOnlyTop)
  const girl = coerceAvatarLoadout({ ...DEFAULT_FEMALE_AVATAR_LOADOUT, topId: girlOnlyTop.itemId })
  assert.equal(girl.topId, girlOnlyTop.itemId)
  const boy = coerceAvatarLoadout({ ...DEFAULT_MALE_AVATAR_LOADOUT, topId: girlOnlyTop.itemId })
  assert.equal(boy.topId, DEFAULT_MALE_AVATAR_LOADOUT.topId)
  const v2 = coerceAvatarLoadout({ ...toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT), outerwearId: "avatar_v2_outerwear_future_coat" })
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
test("a loadout the strict rules accept is returned unchanged", () => {
  let checked = 0
  for (const starter of [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]) {
    for (const baseline of [starter, toAvatarLoadoutV2(starter)]) {
      const variants: unknown[] = [baseline]
      for (const item of AVATAR_LOADOUT_CATALOG) {
        for (const key of SLOT_KEYS) variants.push({ ...baseline, [key]: item.itemId })
        variants.push({ ...baseline, accessoryIds: [item.itemId] })
        if (baseline.schemaVersion === 2 && item.pairedItemId) {
          variants.push({ ...baseline, topId: item.itemId, bottomId: item.pairedItemId, dressId: item.itemId })
        }
      }
      for (const variant of variants) {
        const strict = validateAvatarLoadout(variant, ALL_IDS)
        if (!strict.ok) continue
        checked += 1
        assert.deepEqual(coerceAvatarLoadout(variant, { presetId: starter.bodyId }), strict.loadout)
      }
    }
  }
  assert.ok(checked > 50, `only ${checked} strictly valid looks were checked`)
})
