import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_FEMALE_AVATAR_LOADOUT, DEFAULT_MALE_AVATAR_LOADOUT } from "@blumi/domain"

require.extensions[".png"] = (module, filename) => { module.exports = filename }
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro PNG fixture loading needs the hook first.
const { loadoutToUserAvatar } = require("./avatarSelectionModel") as typeof import("./avatarSelectionModel")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro PNG fixture loading needs the hook first.
const { resolveMyRoomAvatarSource } = require("./myRoomAvatarSource") as typeof import("./myRoomAvatarSource")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro PNG fixture loading needs the hook first.
const { projectAvatarV2ToRoomAvatarAppearance } = require("./room/avatarRoomProjection") as typeof import("./room/avatarRoomProjection")
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro PNG fixture loading needs the hook first.
const { createCandidateAvatarSnapshot, createCandidateAvatarAppearance } = require("./candidateAvatarSnapshot") as typeof import("./candidateAvatarSnapshot")

const localFemale = loadoutToUserAvatar({
  ...DEFAULT_FEMALE_AVATAR_LOADOUT,
  accessoryIds: [...DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds]
})
const savedMale = {
  presetId: DEFAULT_MALE_AVATAR_LOADOUT.bodyId,
  revision: 4,
  loadout: {
    ...DEFAULT_MALE_AVATAR_LOADOUT,
    accessoryIds: [...DEFAULT_MALE_AVATAR_LOADOUT.accessoryIds]
  }
}

test("production My Room follows the saved avatar shown in discovery, not a disposable local preview", () => {
  const displayed = resolveMyRoomAvatarSource(localFemale, savedMale, true)
  assert.equal(displayed.bodyId, DEFAULT_MALE_AVATAR_LOADOUT.bodyId)
  assert.equal(displayed.topId, DEFAULT_MALE_AVATAR_LOADOUT.topId)
  assert.equal(displayed.hairId, DEFAULT_MALE_AVATAR_LOADOUT.hairId)
  const discoveryAppearance = createCandidateAvatarAppearance(createCandidateAvatarSnapshot({
    userId: "self",
    displayName: "Self",
    avatarSelection: savedMale
  }))
  assert.deepEqual(
    projectAvatarV2ToRoomAvatarAppearance({ avatar: displayed }).appearance,
    discoveryAppearance
  )
})

test("demo My Room can use its local avatar; preset-only production stays on the same body", () => {
  assert.equal(resolveMyRoomAvatarSource(localFemale, savedMale, false), localFemale)
  assert.equal(
    resolveMyRoomAvatarSource(localFemale, { presetId: savedMale.presetId }, true).bodyId,
    DEFAULT_MALE_AVATAR_LOADOUT.bodyId
  )
  assert.equal(resolveMyRoomAvatarSource(localFemale, undefined, true), localFemale)
})
