import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_FEMALE_AVATAR_LOADOUT } from "@blumi/domain"
import type { ChatThread } from "@blumi/contracts"
import { cloneParticipant, getChatParticipantSnapshot, getKnownChatParticipant, preserveNewerParticipants, recordParticipantUpdate, resetParticipantUpdates } from "./chatParticipantUpdates"

const avatar = (revision: number) => ({ presetId: DEFAULT_FEMALE_AVATAR_LOADOUT.bodyId, revision,
  loadout: { ...DEFAULT_FEMALE_AVATAR_LOADOUT, accessoryIds: [...DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds] } })

test("same-millisecond saves retain the newer outfit and duplicate or regressive events cannot roll it back", () => {
  resetParticipantUpdates()
  const updatedAt = "2026-10-01T11:00:00Z"
  const first = { participant: { userId: "partner", displayName: "Irmak", avatar: avatar(1) }, updatedAt }
  const next = { ...first, participant: { ...first.participant, avatar: avatar(2) } }
  assert.equal(recordParticipantUpdate(first, 1), true)
  assert.equal(recordParticipantUpdate(next, 2), true)
  assert.equal(recordParticipantUpdate(next, 3), false)
  assert.equal(recordParticipantUpdate(first, 4), false)
  assert.equal(recordParticipantUpdate({ ...next, updatedAt: "2026-10-01T10:00:00Z" }, 5), false)
  resetParticipantUpdates()
})

test("stale thread replies retain identity without overwriting an even newer saved avatar", () => {
  resetParticipantUpdates()
  const thread: ChatThread = { threadId: "thread", miniRoomId: "room", createdAt: "2026-10-01T10:00:00Z",
    participantUserIds: ["me", "partner"], participants: [{ userId: "me" }, { userId: "partner", displayName: "Eren", avatar: avatar(3) }] }
  recordParticipantUpdate({ participant: { userId: "partner", displayName: "Irmak", avatar: avatar(2) }, updatedAt: "2026-10-01T11:00:00Z" }, 2)
  const retained = preserveNewerParticipants(thread, 1)
  assert.equal(retained.participants[1].displayName, "Irmak")
  assert.equal(retained.participants[1].avatar?.revision, 3)
  assert.equal(preserveNewerParticipants(thread, 3).participants[1].displayName, "Eren", "a later authoritative response wins")
  const cloned = cloneParticipant(retained.participants[1])
  assert.notEqual(cloned.avatar?.loadout.accessoryIds, retained.participants[1].avatar?.loadout.accessoryIds)
  resetParticipantUpdates()
})

test("a name-only update keeps the last saved outfit", () => {
  resetParticipantUpdates()
  recordParticipantUpdate({ participant: { userId: "partner", displayName: "Eren", avatar: avatar(3) }, updatedAt: "2026-10-01T10:00:00Z" }, 1)
  assert.equal(recordParticipantUpdate({ participant: { userId: "partner", displayName: "Irmak" }, updatedAt: "2026-10-01T11:00:00Z" }, 2), true)
  const thread: ChatThread = { threadId: "thread", miniRoomId: "room", createdAt: "2026-10-01T10:00:00Z",
    participantUserIds: ["me", "partner"], participants: [{ userId: "me" }, { userId: "partner" }] }
  const partner = preserveNewerParticipants(thread, 0).participants[1]
  assert.equal(partner.displayName, "Irmak")
  assert.equal(partner.avatar?.revision, 3)
  resetParticipantUpdates()
})

test("versioned HTTP snapshots and live events cannot restore an older name or outfit", () => {
  resetParticipantUpdates()
  const thread: ChatThread = { threadId: "thread", miniRoomId: "room", createdAt: "2026-10-01T10:00:00Z",
    participantUserIds: ["me", "partner"], participants: [{ userId: "me" }, {
      userId: "partner", displayName: "Irmak", avatar: avatar(3), profileUpdatedAt: "2026-10-01T12:00:00Z"
    }] }
  preserveNewerParticipants(thread, 1)
  assert.equal(recordParticipantUpdate({ participant: { userId: "partner", displayName: "Eren", avatar: avatar(2) }, updatedAt: "2026-10-01T11:00:00Z" }, 2), false)
  const late = preserveNewerParticipants({ ...thread, participants: [thread.participants[0], {
    userId: "partner", displayName: "Eren", avatar: avatar(1), profileUpdatedAt: "2026-10-01T10:00:00Z"
  }] }, 3)
  assert.equal(late.participants[1].displayName, "Irmak")
  assert.equal(late.participants[1].avatar?.revision, 3)
  assert.equal(late.participants[1].profileUpdatedAt, "2026-10-01T12:00:00Z")
  resetParticipantUpdates()
})

test("stable subscription snapshots are immutable and public copies cannot mutate cached identity", () => {
  resetParticipantUpdates()
  assert.equal(getKnownChatParticipant("partner"), undefined)
  assert.equal(getChatParticipantSnapshot("partner"), undefined)
  recordParticipantUpdate({ participant: { userId: "partner", displayName: "Irmak", avatar: avatar(3) }, updatedAt: "2026-10-01T12:00:00Z" }, 1)
  const snapshot = getChatParticipantSnapshot("partner")!
  assert.ok(Object.isFrozen(snapshot))
  assert.ok(Object.isFrozen(snapshot.avatar?.loadout.accessoryIds))
  const copy = getKnownChatParticipant("partner")!
  copy.displayName = "Changed"
  copy.avatar!.loadout.accessoryIds.push("local-only")
  assert.equal(getChatParticipantSnapshot("partner"), snapshot)
  assert.equal(snapshot.displayName, "Irmak")
  assert.deepEqual(snapshot.avatar?.loadout.accessoryIds, DEFAULT_FEMALE_AVATAR_LOADOUT.accessoryIds)
  resetParticipantUpdates()
})
