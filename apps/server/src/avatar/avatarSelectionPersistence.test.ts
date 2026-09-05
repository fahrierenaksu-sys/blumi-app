import assert from "node:assert/strict"
import test from "node:test"
import type { AvatarLoadoutV2 } from "@blumi/contracts"
import {
  DEFAULT_FEMALE_AVATAR_LOADOUT,
  DEFAULT_MALE_AVATAR_LOADOUT,
  toAvatarLoadoutV2
} from "@blumi/domain"
import {
  normalizeStoredAvatarSelection,
  resolveSemanticAvatarWrite
} from "./avatarSelectionPersistence"

test("stored avatar preset must match the validated loadout body", () => {
  assert.throws(
    () => normalizeStoredAvatarSelection({
      presetId: "avatar_v2_body_default",
      loadout: DEFAULT_MALE_AVATAR_LOADOUT,
      revision: 1
    }),
    /Stored avatar selection is invalid/
  )
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
