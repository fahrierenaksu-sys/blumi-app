import assert from "node:assert/strict"
import {
  createInMemoryMiniRoomRepository,
  type MiniRoomInviteRecord,
  type MiniRoomRecord,
  type MiniRoomRepository
} from "../miniRooms/miniRoomRepository"
import { createPostgresMiniRoomRepository } from "./postgresMiniRoomRepository"
import { runRepositoryContract, type RepositoryContractBackend } from "./repositoryContract"

// Invite decisions, participant claims, rollback, ending and the completion
// reward day: the guarantees the live chat-invite path relies on.

type Backend = RepositoryContractBackend<MiniRoomRepository>

const AT = "2026-10-01T10:00:00.000Z"
const LATER = "2026-10-01T10:05:00.000Z"

function invite(backend: Backend, name: string, senderUserId: string, recipientUserId: string): MiniRoomInviteRecord {
  return {
    inviteId: backend.id(`invite_${name}`),
    senderUserId,
    recipientUserId,
    sourceThreadId: backend.id(`thread_${name}`),
    status: "pending",
    createdAt: AT
  }
}

function room(backend: Backend, name: string, participantUserIds: [string, string]): MiniRoomRecord {
  const miniRoomId = backend.id(`room_${name}`)
  return {
    miniRoomId,
    lobbyRoomId: "thread",
    sourceThreadId: backend.id(`thread_${name}`),
    participantUserIds,
    livekitRoomName: miniRoomId,
    startedAt: AT
  }
}

async function openRoom(backend: Backend, name: string, sender: string, recipient: string): Promise<MiniRoomRecord> {
  const pending = invite(backend, name, sender, recipient)
  await backend.repository.saveInvite(pending)
  const miniRoom = room(backend, name, [sender, recipient])
  assert.equal(
    await backend.repository.acceptPendingInvite({ inviteId: pending.inviteId, decidedAt: AT, miniRoom }),
    "accepted"
  )
  return miniRoom
}

runRepositoryContract<MiniRoomRepository>({
  name: "mini room repository",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemoryMiniRoomRepository(),
    postgres: (pool) => createPostgresMiniRoomRepository(pool)
  },
  cases: {
    "a pending invite is decided once": async (backend) => {
      const [ada, bora] = [backend.id("ada"), backend.id("bora")]
      await backend.ensureUsers(ada, bora)
      const pending = invite(backend, "decline", ada, bora)
      await backend.repository.saveInvite(pending)

      const decisions = await Promise.all([
        backend.repository.transitionPendingInvite({ inviteId: pending.inviteId, status: "declined", decidedAt: AT }),
        backend.repository.transitionPendingInvite({ inviteId: pending.inviteId, status: "cancelled", decidedAt: AT })
      ])
      assert.equal(decisions.filter(Boolean).length, 1)
      assert.equal(
        await backend.repository.transitionPendingInvite({ inviteId: pending.inviteId, status: "expired", decidedAt: LATER }),
        false
      )
      assert.equal(
        await backend.repository.acceptPendingInvite({
          inviteId: pending.inviteId, decidedAt: LATER, miniRoom: room(backend, "decline", [ada, bora])
        }),
        "invite_unavailable"
      )
      assert.equal(await backend.repository.findActiveMiniRoomForUser(ada), null)
    },
    "acceptance claims both participants and a busy participant's other invite is cancelled": async (backend) => {
      const [ada, bora, cara] = [backend.id("ada"), backend.id("bora"), backend.id("cara")]
      await backend.ensureUsers(ada, bora, cara)
      const first = await openRoom(backend, "first", ada, bora)
      assert.equal((await backend.repository.findActiveMiniRoomForUser(ada))?.miniRoomId, first.miniRoomId)
      assert.equal((await backend.repository.findActiveMiniRoomForUser(bora))?.miniRoomId, first.miniRoomId)

      const losing = invite(backend, "second", cara, bora)
      await backend.repository.saveInvite(losing)
      const second = room(backend, "second", [cara, bora])
      assert.equal(
        await backend.repository.acceptPendingInvite({ inviteId: losing.inviteId, decidedAt: LATER, miniRoom: second }),
        "participant_busy"
      )
      assert.equal((await backend.repository.findInvite(losing.inviteId))?.status, "cancelled")
      assert.equal(await backend.repository.findMiniRoom(second.miniRoomId), null)
      assert.equal(await backend.repository.findActiveMiniRoomForUser(cara), null)
    },
    "rolling back an accepted room deletes it, cancels its invite and frees both participants": async (backend) => {
      const [ada, bora] = [backend.id("ada"), backend.id("bora")]
      await backend.ensureUsers(ada, bora)
      const pending = invite(backend, "rollback", ada, bora)
      await backend.repository.saveInvite(pending)
      const miniRoom = room(backend, "rollback", [ada, bora])
      assert.equal(await backend.repository.acceptPendingInvite({ inviteId: pending.inviteId, decidedAt: AT, miniRoom }), "accepted")

      assert.equal(
        await backend.repository.rollbackAcceptedMiniRoom({ inviteId: pending.inviteId, miniRoomId: miniRoom.miniRoomId, decidedAt: LATER }),
        true
      )
      assert.equal(await backend.repository.findMiniRoom(miniRoom.miniRoomId), null)
      assert.equal((await backend.repository.findInvite(pending.inviteId))?.status, "cancelled")
      assert.equal(await backend.repository.findActiveMiniRoomForUser(ada), null)
      assert.equal(await backend.repository.findActiveMiniRoomForUser(bora), null)
      assert.equal(
        await backend.repository.rollbackAcceptedMiniRoom({ inviteId: pending.inviteId, miniRoomId: miniRoom.miniRoomId, decidedAt: LATER }),
        false
      )
      await openRoom(backend, "after_rollback", bora, ada)
    },
    "ending a room releases its participants once": async (backend) => {
      const [ada, bora] = [backend.id("ada"), backend.id("bora")]
      await backend.ensureUsers(ada, bora)
      const miniRoom = await openRoom(backend, "end", ada, bora)

      const ended = await backend.repository.endMiniRoom(miniRoom.miniRoomId, ada, LATER)
      assert.equal(ended?.endedByUserId, ada)
      assert.ok(ended?.endedAt)
      assert.equal(await backend.repository.endMiniRoom(miniRoom.miniRoomId, bora, LATER), null)
      assert.equal(await backend.repository.findActiveMiniRoomForUser(ada), null)
      assert.equal(await backend.repository.findActiveMiniRoomForUser(bora), null)
      await openRoom(backend, "after_end", bora, ada)
    },
    "an invite links its room only until the room ends": async (backend) => {
      const [ada, bora] = [backend.id("ada"), backend.id("bora")]
      await backend.ensureUsers(ada, bora)
      const miniRoom = await openRoom(backend, "unlink", ada, bora)
      const inviteId = backend.id("invite_unlink")
      const threadId = backend.id("thread_unlink")
      assert.equal((await backend.repository.findInvite(inviteId))?.roomSessionId, miniRoom.miniRoomId)
      assert.deepEqual(
        (await backend.repository.listInvitesForThread(threadId, new Date(LATER))).map((entry) => entry.roomSessionId),
        [miniRoom.miniRoomId]
      )

      await backend.repository.endMiniRoom(miniRoom.miniRoomId, bora, LATER)
      const ended = await backend.repository.findInvite(inviteId)
      assert.equal(ended?.status, "accepted")
      assert.equal(ended?.roomSessionId, undefined)
      assert.deepEqual(
        (await backend.repository.listInvitesForThread(threadId, new Date(LATER))).map((entry) => [entry.status, entry.roomSessionId]),
        [["accepted", undefined]]
      )
    },
    "the completion reward day is anchored once, only by a participant of a live room": async (backend) => {
      const [ada, bora, cara] = [backend.id("ada"), backend.id("bora"), backend.id("cara")]
      await backend.ensureUsers(ada, bora, cara)
      const miniRoom = await openRoom(backend, "reward", ada, bora)

      assert.equal(await backend.repository.anchorMiniRoomCompletion({
        miniRoomId: miniRoom.miniRoomId, requestedByUserId: cara, requestedAt: AT, rewardDate: "2026-10-01"
      }), null)
      const first = await backend.repository.anchorMiniRoomCompletion({
        miniRoomId: miniRoom.miniRoomId, requestedByUserId: ada, requestedAt: AT, rewardDate: "2026-10-01"
      })
      assert.equal(first?.rewardDate, "2026-10-01")
      const retry = await backend.repository.anchorMiniRoomCompletion({
        miniRoomId: miniRoom.miniRoomId, requestedByUserId: bora, requestedAt: LATER, rewardDate: "2026-10-02"
      })
      assert.equal(retry?.rewardDate, "2026-10-01", "a retry after midnight keeps the first reward day")
      assert.equal((await backend.repository.findMiniRoom(miniRoom.miniRoomId))?.completionIntent?.rewardDate, "2026-10-01")
      assert.equal((await backend.repository.findMiniRoomByInviteId(backend.id("invite_reward")))?.completionIntent?.rewardDate, "2026-10-01")
      assert.equal((await backend.repository.findActiveMiniRoomForUser(ada))?.completionIntent?.rewardDate, "2026-10-01")

      const ended = await backend.repository.endMiniRoom(miniRoom.miniRoomId, ada, LATER)
      assert.equal(ended?.completionIntent?.rewardDate, "2026-10-01")
      assert.equal((await backend.repository.findMiniRoom(miniRoom.miniRoomId))?.completionIntent?.rewardDate, "2026-10-01")
      assert.equal(await backend.repository.anchorMiniRoomCompletion({
        miniRoomId: miniRoom.miniRoomId, requestedByUserId: ada, requestedAt: LATER, rewardDate: "2026-10-02"
      }), null)
      const nextRoom = await openRoom(backend, "reward_separation", ada, bora)
      await backend.repository.anchorMiniRoomCompletion({
        miniRoomId: nextRoom.miniRoomId, requestedByUserId: ada, requestedAt: LATER, rewardDate: "2026-10-02"
      })
      const separated = await backend.repository.separateUserPair({ actorUserId: ada, otherUserId: bora, endedAt: LATER })
      assert.equal(separated[0]?.completionIntent?.rewardDate, "2026-10-02")
    }
  }
})
