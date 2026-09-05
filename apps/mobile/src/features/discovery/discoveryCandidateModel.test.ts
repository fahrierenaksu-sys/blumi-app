import assert from "node:assert/strict"
import test from "node:test"
import {
  buildAvailableDiscoveryCandidates,
  createLiveDiscoveryCandidate,
  createProductionDiscoveryCandidate,
  formatDiscoveryCardBio,
  isLiveInviteAvailable
} from "./discoveryCandidateModel"

const COMPLETE_AVATAR = {
  presetId: "avatar_v2_body_default",
  revision: 7,
  loadout: {
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
    accessoryIds: ["avatar_v2_accessory_golden_heart_locket"]
  }
}

const CANONICAL_AVATAR = {
  ...COMPLETE_AVATAR,
  loadout: {
    ...COMPLETE_AVATAR.loadout,
    schemaVersion: 2 as const,
    dressId: null,
    outerwearId: null
  }
}

test("production candidate projection preserves identity, bio, age, vibes, and complete avatar", () => {
  const source = {
    userId: "remote_user",
    displayName: "Defne Yildiz",
    age: 27,
    bio: "Ceramics and slow Sundays.",
    distanceLabel: "Location private",
    vibeTags: ["Coffee dates", "Creative"],
    signals: ["Creative", "Answered a conversation starter"],
    avatarPresetId: COMPLETE_AVATAR.presetId,
    avatar: COMPLETE_AVATAR
  }

  const candidate = createProductionDiscoveryCandidate(source)
  const deck = buildAvailableDiscoveryCandidates([candidate], {
    blockedUserIds: new Set(),
    skippedUserIds: new Set(),
    savedUserIds: new Set(),
    seenUserIds: new Set(),
    pendingInviteUserIds: new Set()
  })

  assert.equal(candidate.age, 27)
  assert.equal(candidate.bio, "Ceramics and slow Sundays.")
  assert.equal(candidate.avatarPresetId, COMPLETE_AVATAR.presetId)
  assert.deepEqual(candidate.avatar, CANONICAL_AVATAR)
  assert.deepEqual(candidate.vibeTags, ["Coffee dates", "Creative"])
  assert.deepEqual(candidate.signals, ["Creative", "Answered a conversation starter"])
  assert.equal(candidate.decisionCapability, "mutual-like")
  assert.equal(deck[0]?.bio, "Ceramics and slow Sundays.")
  assert.equal(deck[0]?.age, 27)
  assert.deepEqual(deck[0]?.avatar, CANONICAL_AVATAR)
  assert.equal(isLiveInviteAvailable(candidate), false)

  source.vibeTags.push("Mutated later")
  source.signals.push("Mutated later")
  source.avatar.loadout.accessoryIds.push("avatar_v2_accessory_cherry_micro_bag")
  assert.deepEqual(candidate.vibeTags, ["Coffee dates", "Creative"])
  assert.deepEqual(candidate.signals, ["Creative", "Answered a conversation starter"])
  assert.deepEqual(candidate.avatar.loadout?.accessoryIds, [
    "avatar_v2_accessory_golden_heart_locket"
  ])
})

test("discovery card bio stays concise without inventing fallback copy", () => {
  assert.equal(formatDiscoveryCardBio(undefined), null)
  assert.equal(formatDiscoveryCardBio("   \n  "), null)
  assert.equal(
    formatDiscoveryCardBio("  Ceramics,   long walks,\n and slow Sundays.  "),
    "Ceramics, long walks, and slow Sundays."
  )
  assert.equal(
    formatDiscoveryCardBio(
      "I spend weekends finding tiny bookshops, learning pottery, and cooking very ambitious dinners with friends."
    ),
    "I spend weekends finding tiny bookshops, learning pottery, and cooking very ambitious…"
  )
})

test("live candidates express invite availability without pretending to be mutual discovery", () => {
  const available = createLiveDiscoveryCandidate({
    userId: "live_user",
    displayName: "Mert",
    spotId: "spot_1",
    distance: 42,
    canInvite: true,
    blocked: false
  })
  const busy = createLiveDiscoveryCandidate({
    userId: "busy_user",
    displayName: "Ada",
    spotId: "spot_2",
    distance: 45,
    canInvite: false,
    blocked: false
  })

  assert.equal(available.decisionCapability, "live-invite")
  assert.equal(isLiveInviteAvailable(available), true)
  assert.equal(busy.decisionCapability, "unavailable")
  assert.equal(isLiveInviteAvailable(busy), false)
})
