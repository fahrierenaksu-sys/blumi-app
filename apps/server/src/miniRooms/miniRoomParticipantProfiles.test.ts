import assert from "node:assert/strict"
import test from "node:test"
import { createChatParticipants, profileFromAccount, resolvePairProfiles } from "./miniRoomParticipantProfiles"

const account = (userId: string, updatedAt?: string) => ({ userId, updatedAt,
  profile: { userId, displayName: userId, avatar: { presetId: "legacy" } } })

test("room snapshots carry the persisted profile version in the actual participant order", () => {
  const caller = account("me", "2026-10-01T12:00:00Z")
  const partner = account("partner", "2026-10-01T13:00:00Z")
  const profiles = resolvePairProfiles(["partner", "me"], caller, partner)!
  const participants = createChatParticipants(...profiles)
  assert.deepEqual(participants.map(({ userId }) => userId), ["partner", "me"])
  assert.equal(participants[0].profileUpdatedAt, partner.updatedAt)
  assert.equal(participants[1].profileUpdatedAt, caller.updatedAt)
  assert.notEqual(profiles[0], partner.profile)
  assert.deepEqual(participants[0].avatar, partner.profile.avatar)
})

test("unknown or duplicate members are refused and legacy profiles remain compatible", () => {
  const caller = account("me"), partner = account("partner")
  assert.equal(resolvePairProfiles(["me", "me"], caller, partner), null)
  assert.equal(resolvePairProfiles(["me", "other"], caller, partner), null)
  assert.deepEqual(profileFromAccount(caller), caller.profile)
  assert.equal(createChatParticipants(caller.profile, partner.profile)[0].profileUpdatedAt, undefined)
})
