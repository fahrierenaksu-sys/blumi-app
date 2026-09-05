import assert from "node:assert/strict"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

const {
  createCandidateAvatarAppearance,
  createCandidateAvatarSnapshot,
  readCandidateAvatarSnapshot
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./candidateAvatarSnapshot") as typeof import("./candidateAvatarSnapshot")
const {
  getRoomAvatarRenderLayers
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./room/avatarRoomSelectors") as typeof import("./room/avatarRoomSelectors")
const {
  createMiniRoomPartnerAvatarSnapshot
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../miniRoom/partnerAvatarSnapshot") as typeof import("../miniRoom/partnerAvatarSnapshot")

test("a persisted male body preset renders the independent male starter stack", () => {
  const snapshot = createCandidateAvatarSnapshot({
    userId: "user-male",
    displayName: "Mert",
    avatarPresetId: "avatar_v2_body_male_light"
  })

  assert.equal(snapshot.bodyPreset, "male")
  const appearance = createCandidateAvatarAppearance(snapshot)
  assert.equal(appearance.bodyPreset, "male")
  assert.equal(
    appearance.topId,
    "room_avatar_top_male_powder_blue_crew_tee_v1"
  )
  assert.equal(
    appearance.bottomId,
    "room_avatar_bottom_male_navy_straight_pants_v1"
  )

  const layers = getRoomAvatarRenderLayers({ appearance })
  assert.ok(layers.length >= 6)
  assert.ok(
    layers.every(
      (layer) => layer.fitProfileId === "blumi_male_room_avatar_v1"
    )
  )
  assert.ok(layers.every((layer) => !layer.id.includes("female")))
})

test("unknown and legacy presets stay on the supported female fallback", () => {
  const snapshot = createCandidateAvatarSnapshot({
    userId: "user-legacy",
    displayName: "Ada",
    avatarPresetId: "sunset"
  })

  assert.equal(snapshot.bodyPreset, "female")
  assert.equal(createCandidateAvatarAppearance(snapshot).bodyPreset, "female")
})

test("a trusted remote snapshot keeps its server-derived body preset", () => {
  const snapshot = createCandidateAvatarSnapshot({
    userId: "user-male",
    displayName: "Mert",
    avatarPresetId: "avatar_v2_body_female",
    avatarSnapshot: {
      kind: "candidate_avatar_snapshot",
      userId: "user-male",
      displayName: "Mert",
      source: "remote_candidate_avatar",
      previewSeed: "user-male",
      label: "Blumi avatar",
      bodyPreset: "male"
    }
  })

  assert.equal(snapshot.bodyPreset, "male")
})

test("female preview seeds keep their deterministic wardrobe variants", () => {
  const cases = [
    ["d", "room_avatar_top_female_blush_lace_cardigan_v2"],
    ["a", "room_avatar_top_female_noir_rose_heart_cardigan_v2"],
    ["b", "room_avatar_top_female_powder_blue_ribbon_corset_top_v2"],
    ["c", "room_avatar_top_female_sage_ribbon_knit_jacket_v2"]
  ] as const

  for (const [userId, topId] of cases) {
    const snapshot = createCandidateAvatarSnapshot({
      userId,
      displayName: "Candidate"
    })
    assert.equal(createCandidateAvatarAppearance(snapshot).topId, topId)
  }
})

test("a complete server selection projects the exact remote wardrobe without hash substitution", () => {
  const loadout = {
    schemaVersion: 1 as const,
    bodyId: "avatar_v2_body_default",
    faceId: "avatar_v2_face_default",
    eyesId: "avatar_v2_eyes_mocha_doe",
    noseId: "avatar_v2_nose_soft_button",
    mouthId: "avatar_v2_mouth_peach_whisper_smile",
    hairId: "avatar_v2_hair_mocha_ribbon_blowout",
    topId: "avatar_v2_top_blush_lace_cardigan",
    bottomId: "avatar_v2_bottom_yellow_bow_lace_ruffle_skirt",
    shoesId: "avatar_v2_shoes_cherry_satin_ballets",
    accessoryIds: ["avatar_v2_accessory_ivory_ribbon_beret"]
  }
  const snapshot = createCandidateAvatarSnapshot({
    userId: "remote-exact",
    displayName: "Defne",
    avatarSelection: {
      presetId: loadout.bodyId,
      revision: 7,
      loadout
    }
  })
  const appearance = createCandidateAvatarAppearance(snapshot)
  assert.equal(appearance.topId, "room_avatar_top_female_blush_lace_cardigan_v2")
  assert.equal(
    appearance.bottomId,
    "room_avatar_bottom_female_yellow_bow_lace_ruffle_skirt_v2"
  )
  assert.equal(
    appearance.shoesId,
    "room_avatar_shoes_female_cherry_satin_ballets_v2"
  )
  assert.deepEqual(appearance.accessoryIds, [
    "room_avatar_accessory_female_ivory_ribbon_beret_v2"
  ])
})

test("serialized candidate snapshots are validated before reuse", () => {
  const trusted = createCandidateAvatarSnapshot({
    userId: "trusted",
    displayName: "Mert",
    avatarPresetId: "avatar_v2_body_male_light"
  })
  assert.deepEqual(
    readCandidateAvatarSnapshot(
      { avatarSnapshot: trusted },
      { userId: "trusted", displayName: "Mert" }
    ),
    trusted
  )

  const recovered = readCandidateAvatarSnapshot(
    {
      avatarSnapshot: {
        ...trusted,
        bodyPreset: "unsupported"
      }
    },
    {
      userId: "trusted",
      displayName: "Mert",
      avatarPresetId: "avatar_v2_body_male_light"
    }
  )
  assert.equal(recovered.bodyPreset, "male")
  assert.equal(recovered.source, "remote_candidate_avatar")
})

test("MiniRoom preserves the same layered male avatar shown in discovery", () => {
  const candidate = createCandidateAvatarSnapshot({
    userId: "partner-male",
    displayName: "Mert",
    avatarPresetId: "avatar_v2_body_male_light"
  })

  const snapshot = createMiniRoomPartnerAvatarSnapshot({
    userId: candidate.userId,
    displayName: candidate.displayName,
    candidateAvatarSnapshot: candidate
  })

  assert.equal(snapshot.source, "remote_participant_avatar")
  assert.equal(snapshot.appearance.snapshotSource, "remote_participant_avatar")
  assert.equal(snapshot.appearance.fallbackReason, undefined)
  assert.equal(snapshot.appearance.fullBodyAsset, undefined)
  assert.ok(snapshot.appearance.roomAvatarAppearance)
  assert.ok(snapshot.appearance.roomAvatarLayers)
  assert.ok(
    snapshot.appearance.roomAvatarLayers?.every(
      (layer) => layer.fitProfileId === "blumi_male_room_avatar_v1"
    )
  )
})

test("MiniRoom uses an honest layered preview when a remote avatar is unavailable", () => {
  const snapshot = createMiniRoomPartnerAvatarSnapshot({
    userId: "partner-without-preset",
    displayName: "Ada"
  })

  assert.equal(snapshot.source, "partner_preview_fallback")
  assert.equal(snapshot.appearance.snapshotSource, "partner_preview_fallback")
  assert.match(snapshot.appearance.fallbackReason ?? "", /preview/i)
  assert.equal(snapshot.appearance.fullBodyAsset, undefined)
  assert.ok((snapshot.appearance.roomAvatarLayers?.length ?? 0) >= 6)
})
