import assert from "node:assert/strict"
import test from "node:test"
import {
  cloneAvatarSelection,
  loadoutToUserAvatar,
  normalizeAvatarLoadout,
  normalizeAvatarSelection,
  normalizeCompleteAvatarSelection,
  projectAvatarLoadoutV1,
  userAvatarToLoadout
} from "./avatarSelectionModel"

const V1_LOADOUT = {
  schemaVersion: 1 as const,
  bodyId: "avatar_v2_body_default",
  faceId: "avatar_v2_face_default",
  eyesId: "avatar_v2_eyes_mocha_doe",
  noseId: "avatar_v2_nose_soft_button",
  mouthId: "avatar_v2_mouth_peach_whisper_smile",
  hairId: "avatar_v2_hair_mocha_ribbon_blowout",
  topId: "avatar_v2_top_default",
  bottomId: "avatar_v2_bottom_default",
  shoesId: "avatar_v2_shoes_milk_tea_court_sneakers",
  accessoryIds: ["avatar_v2_accessory_ivory_ribbon_beret"]
}

const V2_LOADOUT = {
  ...V1_LOADOUT,
  schemaVersion: 2 as const,
  dressId: "avatar_v2_top_boho_patchwork_maxi_dress",
  outerwearId: "avatar_v2_outerwear_cloud_cardigan"
}

test("V1 complete avatar selections canonicalize to V2 without sharing nested arrays", () => {
  const selection = normalizeCompleteAvatarSelection({
    presetId: V1_LOADOUT.bodyId,
    revision: 4,
    loadout: V1_LOADOUT
  })
  assert.ok(selection)
  assert.notEqual(selection.loadout, V1_LOADOUT)
  assert.notEqual(selection.loadout.accessoryIds, V1_LOADOUT.accessoryIds)
  assert.deepEqual(selection.loadout, {
    ...V1_LOADOUT,
    schemaVersion: 2,
    dressId: null,
    outerwearId: null
  })

  const cloned = cloneAvatarSelection(selection)
  assert.deepEqual(cloned, selection)
  assert.notEqual(cloned.loadout?.accessoryIds, selection.loadout.accessoryIds)
})

test("V2 selections retain dress and outerwear through the canonical local model", () => {
  const normalized = normalizeAvatarLoadout(V2_LOADOUT)
  assert.deepEqual(normalized, V2_LOADOUT)
  assert.notEqual(normalized?.accessoryIds, V2_LOADOUT.accessoryIds)

  assert.deepEqual(
    userAvatarToLoadout(loadoutToUserAvatar(V2_LOADOUT)),
    V2_LOADOUT
  )
})

test("canonical V2 loadouts project explicitly to the exact V1 wire shape", () => {
  assert.deepEqual(projectAvatarLoadoutV1(V2_LOADOUT), {
    ...V1_LOADOUT,
    topId: "avatar_v2_top_boho_patchwork_maxi_dress",
    bottomId: "avatar_v2_bottom_boho_patchwork_maxi_dress"
  })
})

test("loadout normalization accepts only exact V1 or V2 shapes", () => {
  assert.equal(normalizeAvatarLoadout({ ...V1_LOADOUT, dressId: null }), null)
  assert.equal(normalizeAvatarLoadout({ ...V2_LOADOUT, unexpected: true }), null)
  assert.equal(normalizeAvatarLoadout({ ...V2_LOADOUT, outerwearId: undefined }), null)
  assert.equal(normalizeAvatarLoadout({
    ...V2_LOADOUT,
    accessoryIds: [V2_LOADOUT.accessoryIds[0], V2_LOADOUT.accessoryIds[0]]
  }), null)
})

test("selection normalization keeps legacy presets but fails closed on partial complete data", () => {
  assert.deepEqual(normalizeAvatarSelection({ presetId: "dusk" }), {
    presetId: "dusk"
  })
  assert.equal(normalizeAvatarSelection({
    presetId: V1_LOADOUT.bodyId,
    revision: 1
  }), null)
  assert.equal(normalizeCompleteAvatarSelection({
    presetId: "different_body",
    revision: 1,
    loadout: V1_LOADOUT
  }), null)
  assert.equal(normalizeCompleteAvatarSelection({
    presetId: V1_LOADOUT.bodyId,
    revision: -1,
    loadout: V1_LOADOUT
  }), null)
})
