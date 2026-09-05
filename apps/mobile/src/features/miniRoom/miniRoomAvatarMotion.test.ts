import assert from "node:assert/strict"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { createCandidateAvatarSnapshot } = require("../avatarV2/candidateAvatarSnapshot") as typeof import("../avatarV2/candidateAvatarSnapshot")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { createMiniRoomPartnerAvatarSnapshot } = require("./partnerAvatarSnapshot") as typeof import("./partnerAvatarSnapshot")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { createCurrentUserAvatarSnapshot } = require("./currentUserAvatarSnapshot") as typeof import("./currentUserAvatarSnapshot")
const {
  canMiniRoomAvatarUseMotion,
  getMiniRoomAvatarRenderLayers
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./miniRoomAvatarMotion") as typeof import("./miniRoomAvatarMotion")
const {
  DEFAULT_ROOM_AVATAR_MALE,
  ROOM_AVATAR_CATALOG
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../avatarV2/room/avatarRoom.mock") as typeof import("../avatarV2/room/avatarRoom.mock")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { AVATAR_V2_CATALOG } = require("../avatarV2/avatarV2.mock") as typeof import("../avatarV2/avatarV2.mock")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
const { resolveInitialAvatarV2 } = require("../avatarV2/avatarV2Persistence") as typeof import("../avatarV2/avatarV2Persistence")

test("authenticated male preview uses the production MiniRoom snapshot path", () => {
  const snapshot = createCurrentUserAvatarSnapshot({
    userId: "authenticated-male-qa",
    displayName: "Eren QA",
    avatar: {
      ...resolveInitialAvatarV2("avatar_v2_body_male_light"),
      hairId: "avatar_v2_hair_male_chestnut_short_waves",
      topId: "avatar_v2_top_male_cocoa_varsity_jacket",
      bottomId: "avatar_v2_bottom_male_mid_blue_straight_jeans",
      shoesId: "avatar_v2_shoes_male_dusty_blue_canvas_sneakers"
    },
    avatarCatalog: AVATAR_V2_CATALOG
  })

  assert.equal(snapshot.userId, "authenticated-male-qa")
  assert.equal(snapshot.source, "avatar_v2_current_user")
  for (const motion of ["walking", "sitting"] as const) {
    assert.equal(canMiniRoomAvatarUseMotion({
      appearance: snapshot.appearance,
      motion,
      facing: "front"
    }), true, motion)
  }
})

test("MiniRoom resolves the canonical male walking frames from appearance", () => {
  const candidate = createCandidateAvatarSnapshot({
    userId: "male-walker",
    displayName: "Mert",
    avatarPresetId: "avatar_v2_body_male_light"
  })
  const snapshot = createMiniRoomPartnerAvatarSnapshot({
    userId: candidate.userId,
    displayName: candidate.displayName,
    candidateAvatarSnapshot: candidate
  })

  const layers = getMiniRoomAvatarRenderLayers({
    appearance: snapshot.appearance,
    motion: "walking",
    facing: "front"
  })

  assert.ok(snapshot.appearance.roomAvatarAppearance)
  assert.ok(layers.length >= 6)
  assert.ok(layers.every((layer) => layer.requestedState === "walking"))
  assert.ok(layers.every((layer) => (layer.animation?.frames.length ?? 0) >= 4))
  assert.equal(canMiniRoomAvatarUseMotion({
    appearance: snapshot.appearance,
    motion: "walking",
    facing: "front"
  }), true)
})

test("MiniRoom sitting readiness is evaluated from sitting layers, not idle layers", () => {
  const candidate = createCandidateAvatarSnapshot({
    userId: "male-sitter",
    displayName: "Can",
    avatarPresetId: "avatar_v2_body_male_light"
  })
  const snapshot = createMiniRoomPartnerAvatarSnapshot({
    userId: candidate.userId,
    displayName: candidate.displayName,
    candidateAvatarSnapshot: candidate
  })

  const layers = getMiniRoomAvatarRenderLayers({
    appearance: snapshot.appearance,
    motion: "sitting",
    facing: "front"
  })

  assert.ok(layers.every((layer) => layer.requestedState === "sitting"))
  assert.equal(canMiniRoomAvatarUseMotion({
    appearance: snapshot.appearance,
    motion: "sitting",
    facing: "front"
  }), true)
})

test("legacy snapshots still render their immutable idle layer fallback", () => {
  const legacyLayers = [{ id: "legacy-layer" }] as never[]
  const appearance = {
    base: "male_base_01" as const,
    snapshotSource: "partner_preview_fallback" as const,
    roomAvatarLayers: legacyLayers
  }

  assert.equal(getMiniRoomAvatarRenderLayers({
    appearance,
    motion: "walking",
    facing: "front"
  }), legacyLayers)
  assert.equal(canMiniRoomAvatarUseMotion({
    appearance,
    motion: "sitting",
    facing: "front"
  }), false)
})

test("an incomplete outfit falls back as one idle stack instead of mixing moving and static layers", () => {
  const catalogWithoutSageShortsMotion = ROOM_AVATAR_CATALOG.map((item) =>
    item.id === "room_avatar_bottom_male_sage_cuffed_shorts_v1"
      ? { ...item, assetsByMotion: undefined }
      : item
  )
  const appearance = {
    base: "male_base_01" as const,
    snapshotSource: "avatar_v2_current_user" as const,
    roomAvatarAppearance: {
      ...DEFAULT_ROOM_AVATAR_MALE,
      topId: "room_avatar_top_male_cream_basic_tee_v1",
      bottomId: "room_avatar_bottom_male_sage_cuffed_shorts_v1"
    }
  }

  const layers = getMiniRoomAvatarRenderLayers({
    appearance,
    motion: "walking",
    facing: "front",
    catalog: catalogWithoutSageShortsMotion
  })

  assert.ok(layers.length >= 6)
  assert.ok(layers.every((layer) => layer.requestedState === "idle"))
  assert.equal(canMiniRoomAvatarUseMotion({
    appearance,
    motion: "walking",
    facing: "front",
    catalog: catalogWithoutSageShortsMotion
  }), false)
})
