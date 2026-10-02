import assert from "node:assert/strict"
import test from "node:test"
import type { ChatThread } from "@blumi/contracts"

require.extensions[".png"] = (module, filename) => {
  module.exports = filename
}

const {
  resolveMiniRoomPartnerIdentity,
  selectMiniRoomLivePartner
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./miniRoomPartnerIdentity") as typeof import("./miniRoomPartnerIdentity")
const {
  createCandidateAvatarSnapshot
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("../avatarV2/candidateAvatarSnapshot") as typeof import("../avatarV2/candidateAvatarSnapshot")
const {
  createMiniRoomPartnerAvatarSnapshot
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset and CommonJS fixture loading requires static require.
} = require("./partnerAvatarSnapshot") as typeof import("./partnerAvatarSnapshot")

const LOADOUT = {
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

const fromParams = {
  userId: "partner",
  displayName: "Bora Yilmaz",
  avatarSnapshot: createCandidateAvatarSnapshot({ userId: "partner", displayName: "Bora Yilmaz" })
}

function thread(participants: ChatThread["participants"]): ChatThread {
  return { threadId: "thread", participantUserIds: participants.map((p) => p.userId), participants } as unknown as ChatThread
}

test("a partner renamed in the chat store shows the new name on every room surface", () => {
  const live = selectMiniRoomLivePartner(
    thread([{ userId: "me", displayName: "Ada" }, { userId: "partner", displayName: "Irmak Kaya" }]), "me", "partner")
  const partner = resolveMiniRoomPartnerIdentity(fromParams, live)
  assert.equal(partner.userId, "partner")
  assert.equal(partner.displayName, "Irmak Kaya")
  // The chibi's plate reads the snapshot's name, so it follows the rename too.
  const chibi = createMiniRoomPartnerAvatarSnapshot({
    userId: partner.userId, displayName: partner.displayName, candidateAvatarSnapshot: partner.avatarSnapshot
  })
  assert.equal(chibi.displayName, "Irmak Kaya")
})

test("a new outfit in the chat store dresses the partner's chibi", () => {
  const live = selectMiniRoomLivePartner(thread([
    { userId: "me" },
    { userId: "partner", displayName: "Bora Yilmaz", avatar: { presetId: LOADOUT.bodyId, revision: 3, loadout: LOADOUT } }
  ]), "me", "partner")
  const partner = resolveMiniRoomPartnerIdentity(fromParams, live)
  assert.equal(partner.avatarSnapshot?.source, "remote_candidate_avatar")
  assert.equal(partner.avatarSnapshot?.avatarSelection?.loadout?.topId, LOADOUT.topId)
  assert.equal(partner.displayName, "Bora Yilmaz")
})

test("the navigation params stay the fallback when the store knows nothing better", () => {
  assert.equal(resolveMiniRoomPartnerIdentity(fromParams, null), fromParams, "no thread in the store yet")
  assert.equal(resolveMiniRoomPartnerIdentity(fromParams,
    selectMiniRoomLivePartner(thread([{ userId: "me" }, { userId: "partner" }]), "me", "partner")), fromParams,
  "a participant without a name keeps the params' name and chibi")
  assert.equal(resolveMiniRoomPartnerIdentity(fromParams, { userId: "partner", displayName: "  " }), fromParams)
  assert.equal(selectMiniRoomLivePartner(
    thread([{ userId: "me" }, { userId: "someone-else", displayName: "Other" }]), "me", "partner"), null,
  "another user in the thread is never taken for the partner")
  assert.equal(resolveMiniRoomPartnerIdentity(fromParams, { userId: "someone-else", displayName: "Other" }), fromParams)
})
