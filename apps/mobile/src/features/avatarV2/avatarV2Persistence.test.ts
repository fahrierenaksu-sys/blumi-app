import assert from "node:assert/strict"
import test from "node:test"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

const {
  getAvatarV2StorageKey,
  resolveInitialAvatarV2,
  shouldUseLocalAvatarPersistence
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./avatarV2Persistence") as typeof import("./avatarV2Persistence")

test("avatar persistence is isolated per authenticated user", () => {
  assert.equal(getAvatarV2StorageKey(undefined), null)
  assert.equal(
    getAvatarV2StorageKey("user/a"),
    "@blumi/avatar_v2/user_avatar:user%2Fa"
  )
  assert.notEqual(
    getAvatarV2StorageKey("user-a"),
    getAvatarV2StorageKey("user-b")
  )
})

test("production server selections always win over stale local avatar storage", () => {
  assert.equal(
    shouldUseLocalAvatarPersistence(true, "@blumi/avatar:user-1"),
    false
  )
  assert.equal(
    shouldUseLocalAvatarPersistence(false, "@blumi/avatar:user-1"),
    true
  )
  assert.equal(shouldUseLocalAvatarPersistence(false, null), false)
})

test("a server-persisted male body restores the male local avatar", () => {
  assert.deepEqual(resolveInitialAvatarV2("avatar_v2_body_male_light"), {
    bodyId: "avatar_v2_body_male_light",
    faceId: "avatar_v2_face_male_warm_friendly",
    eyesId: "avatar_v2_eyes_male_warm_brown",
    noseId: "avatar_v2_nose_male_gentle_bridge",
    mouthId: "avatar_v2_mouth_male_soft_smile",
    hairId: "avatar_v2_hair_male_espresso_crop",
    topId: "avatar_v2_top_male_powder_blue_crew_tee",
    bottomId: "avatar_v2_bottom_male_navy_straight_pants",
    shoesId: "avatar_v2_shoes_male_milk_tea_court",
    dressId: null,
    outerwearId: null,
    accessoryIds: []
  })
  assert.equal(resolveInitialAvatarV2("sunset").bodyId, "avatar_v2_body_default")
})
