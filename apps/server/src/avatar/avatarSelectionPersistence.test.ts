import assert from "node:assert/strict"
import test from "node:test"
import type { AvatarLoadoutV2 } from "@blumi/contracts"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  RETIRED_AVATAR_ITEM_IDS,
  TEST_AVATAR_ITEM,
  TEST_AVATAR_ITEM_RULES,
  projectAvatarLoadoutV1,
  toAvatarLoadoutV2
} from "@blumi/domain"
import {
  normalizeStoredAvatarSelection,
  resolveSemanticAvatarWrite
} from "./avatarSelectionPersistence"

test("every retired top and bottom restores the correct starter without losing revision", () => {
  assert.ok(RETIRED_AVATAR_ITEM_IDS.size > 0)
  for (const itemId of RETIRED_AVATAR_ITEM_IDS) {
    const starter = itemId.includes("_male_") ? DEFAULT_MALE_AVATAR_LOADOUT : DEFAULT_FEMALE_AVATAR_LOADOUT
    const slot = itemId.includes("_hair_") ? "hairId" : itemId.includes("_bottom_") ? "bottomId" : "topId"
    for (const baseline of [starter, toAvatarLoadoutV2(starter)]) {
      const normalized = normalizeStoredAvatarSelection({
        presetId: baseline.bodyId,
        loadout: { ...baseline, [slot]: itemId },
        revision: 17
      })
      assert.equal(normalized.loadout[slot], starter[slot], itemId)
      assert.equal(normalized.revision, 17)
      assert.equal(normalized.loadout.shoesId, starter.shoesId)
    }
  }
})

// Replaces "stored avatar preset must match the validated loadout body" (a
// throw): reads are tolerant now (plan §2.4), so a mismatched preset no longer
// hides the account. The stored body wins and the preset follows it.
test("a stored preset that differs from the loadout body reads as the loadout body", () => {
  const normalized = normalizeStoredAvatarSelection({
    presetId: "avatar_v2_body_default",
    loadout: DEFAULT_MALE_AVATAR_LOADOUT,
    revision: 1
  })
  assert.equal(normalized.presetId, DEFAULT_MALE_AVATAR_LOADOUT.bodyId)
  assert.deepEqual(normalized.loadout, DEFAULT_MALE_AVATAR_LOADOUT)
})

test("any unknown, legacy or other-body item ID reads as the body's starter look and never throws", () => {
  const legacyIds = ["avatar_v1_hat_gone", "", "x".repeat(500), "room_v2_chair_blush", "avatar_v2_top_male_powder_blue_crew_tee"]
  for (const starter of [DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT]) {
    for (const legacyId of legacyIds) {
      const other = starter === DEFAULT_MALE_AVATAR_LOADOUT ? "avatar_v2_top_default" : legacyId
      const stored = {
        ...toAvatarLoadoutV2(starter),
        hairId: legacyId,
        topId: other,
        bottomId: legacyId,
        shoesId: legacyId,
        faceId: legacyId,
        eyesId: legacyId,
        noseId: legacyId,
        mouthId: legacyId,
        dressId: legacyId,
        outerwearId: legacyId,
        accessoryIds: [legacyId, legacyId]
      }
      const before = JSON.stringify(stored)
      const normalized = normalizeStoredAvatarSelection({ presetId: starter.bodyId, loadout: stored, revision: 4 })
      assert.deepEqual(normalized.loadout, toAvatarLoadoutV2(starter), legacyId)
      assert.equal(normalized.presetId, starter.bodyId)
      assert.equal(normalized.revision, 4)
      assert.equal(JSON.stringify(stored), before, "a read never changes the stored value")
    }
  }
})

test("legacy dusk and sunset presets pick the body from the profile gender, else the girl", () => {
  const brokenBody = { ...DEFAULT_FEMALE_AVATAR_LOADOUT, bodyId: "avatar_v1_body_dusk" }
  for (const presetId of ["dusk", "sunset"]) {
    const man = normalizeStoredAvatarSelection({ presetId, loadout: brokenBody, revision: 2, genderHint: "man" })
    assert.deepEqual(man.loadout, DEFAULT_MALE_AVATAR_LOADOUT)
    assert.equal(man.presetId, DEFAULT_MALE_AVATAR_LOADOUT.bodyId)
    for (const genderHint of ["woman", undefined, null, "nonbinary"]) {
      const other = normalizeStoredAvatarSelection({ presetId, loadout: brokenBody, revision: 2, genderHint })
      assert.deepEqual(other.loadout, DEFAULT_FEMALE_AVATAR_LOADOUT)
    }
  }
})

test("only a broken envelope still throws", () => {
  for (const loadout of [null, undefined, "{}", 7, []]) {
    assert.throws(
      () => normalizeStoredAvatarSelection({ presetId: "avatar_v2_body_default", loadout, revision: 1 }),
      /Stored avatar selection is invalid/
    )
  }
  for (const revision of [-1, 1.5, "3", null]) {
    assert.throws(
      () => normalizeStoredAvatarSelection({ presetId: "avatar_v2_body_default", loadout: DEFAULT_FEMALE_AVATAR_LOADOUT, revision }),
      /Stored avatar selection is invalid/
    )
  }
  const emptyObject = normalizeStoredAvatarSelection({ presetId: 42, loadout: {}, revision: 0 })
  assert.deepEqual(emptyObject.loadout, DEFAULT_FEMALE_AVATAR_LOADOUT)
})

test("stored avatar normalization safely accepts exact V1 and V2 loadouts", () => {
  const v2 = toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT)

  for (const loadout of [DEFAULT_FEMALE_AVATAR_LOADOUT, v2]) {
    const normalized = normalizeStoredAvatarSelection({
      presetId: loadout.bodyId,
      loadout,
      revision: 7
    })
    assert.deepEqual(normalized.loadout, loadout)
    assert.notEqual(normalized.loadout, loadout)
    assert.notEqual(normalized.loadout.accessoryIds, loadout.accessoryIds)
  }
})

test("an existing retired top remains readable and falls back without changing revision", () => {
  const stored = {
    ...toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT),
    topId: "avatar_v2_top_blush_lace_cardigan",
    outerwearId: "avatar_v2_outerwear_future_coat"
  }
  const normalized = normalizeStoredAvatarSelection({
    presetId: stored.bodyId,
    loadout: stored,
    revision: 9
  })
  assert.equal(normalized.loadout.topId, DEFAULT_FEMALE_AVATAR_LOADOUT.topId)
  assert.equal(normalized.loadout.schemaVersion, 2)
  if (normalized.loadout.schemaVersion === 2) assert.equal(normalized.loadout.outerwearId, null)
  assert.equal(normalized.revision, 9)
  assert.equal(stored.topId, "avatar_v2_top_blush_lace_cardigan")
})

test("V1 semantic writes map paired dresses and preserve current V2 outerwear", () => {
  const current: AvatarLoadoutV2 = {
    ...toAvatarLoadoutV2(DEFAULT_FEMALE_AVATAR_LOADOUT),
    outerwearId: "avatar_v2_outerwear_future_coat"
  }
  const legacyDress = {
    ...DEFAULT_FEMALE_AVATAR_LOADOUT,
    topId: "avatar_v2_top_boho_patchwork_maxi_dress",
    bottomId: "avatar_v2_bottom_boho_patchwork_maxi_dress",
    accessoryIds: [...DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds]
  }

  const merged = resolveSemanticAvatarWrite(legacyDress, current)

  assert.equal(merged.schemaVersion, 2)
  assert.equal(merged.dressId, legacyDress.topId)
  assert.equal(merged.topId, DEFAULT_FEMALE_AVATAR_LOADOUT.topId)
  assert.equal(merged.bottomId, DEFAULT_FEMALE_AVATAR_LOADOUT.bottomId)
  assert.equal(merged.outerwearId, current.outerwearId)
  assert.equal(current.dressId, null)
})

test("an old (V1) client keeps a worn one-piece dress it never touched and takes it off when it changes clothes", () => {
  const rules = TEST_AVATAR_ITEM_RULES
  const current: AvatarLoadoutV2 = {
    ...toAvatarLoadoutV2(rules.starters.female, rules),
    dressId: TEST_AVATAR_ITEM.onePieceDress
  }
  // what the old client was shown, with only the hair changed
  const hairOnly = { ...projectAvatarLoadoutV1(current, rules), hairId: TEST_AVATAR_ITEM.girlHairPaid }
  const kept = resolveSemanticAvatarWrite(hairOnly, current, rules)
  assert.equal(kept.schemaVersion === 2 && kept.dressId, TEST_AVATAR_ITEM.onePieceDress)
  assert.equal(kept.hairId, TEST_AVATAR_ITEM.girlHairPaid)

  const newTop = { ...projectAvatarLoadoutV1(current, rules), topId: TEST_AVATAR_ITEM.girlTopPaid }
  const changed = resolveSemanticAvatarWrite(newTop, current, rules)
  assert.equal(changed.schemaVersion === 2 && changed.dressId, null)
  assert.equal(changed.topId, TEST_AVATAR_ITEM.girlTopPaid)
  assert.equal(current.dressId, TEST_AVATAR_ITEM.onePieceDress, "the stored look is never mutated")
})
