import assert from "node:assert/strict"
import test from "node:test"
import { createPostgresMiniRoomRepository } from "./postgresMiniRoomRepository"

test("postgres non-accept decisions transition only a still-pending invite", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresMiniRoomRepository({
    async query(text, values) {
      calls.push({ text, values })
      return { rows: [{ invite_id: "invite_1" }] }
    }
  })

  const transitioned = await repository.transitionPendingInvite({
    inviteId: "invite_1",
    status: "declined",
    decidedAt: "2026-07-14T10:00:00.000Z"
  })

  assert.equal(transitioned, true)
  assert.match(calls[0]?.text ?? "", /status = 'pending'/)
  assert.match(calls[0]?.text ?? "", /RETURNING invite_id/)
  assert.deepEqual(calls[0]?.values?.slice(0, 2), ["invite_1", "declined"])
})

test("postgres invite transition reports a lost concurrent decision", async () => {
  const repository = createPostgresMiniRoomRepository({
    async query() {
      return { rows: [] }
    }
  })

  assert.equal(
    await repository.transitionPendingInvite({
      inviteId: "invite_1",
      status: "declined",
      decidedAt: "2026-07-14T10:00:00.000Z"
    }),
    false
  )
})

test("postgres invite acceptance and participant claims are one atomic statement", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresMiniRoomRepository({
    async query(text, values) {
      calls.push({ text, values })
      return { rows: [{ user_id: "user_a" }, { user_id: "user_b" }] }
    }
  })

  assert.equal(
    await repository.acceptPendingInvite({
      inviteId: "invite_1",
      decidedAt: "2026-07-14T10:00:00.000Z",
      miniRoom: {
        miniRoomId: "mini_room_1",
        lobbyRoomId: "public-lobby",
        participantUserIds: ["user_a", "user_b"],
        livekitRoomName: "blumi-room-1",
        startedAt: "2026-07-14T10:00:00.000Z"
      }
    }),
    "accepted"
  )
  assert.match(calls[0]?.text ?? "", /accepted_invite AS/)
  assert.match(calls[0]?.text ?? "", /status = 'accepted'/)
  assert.match(calls[0]?.text ?? "", /blumi_active_mini_room_participants/)
  assert.match(calls[0]?.text ?? "", /INSERT INTO blumi_mini_rooms/)
  assert.deepEqual(calls[0]?.values?.slice(0, 4), [
    "mini_room_1",
    "public-lobby",
    "user_a",
    "user_b"
  ])
})

test("postgres participant race rolls back acceptance and terminally cancels the loser", async () => {
  let queryCount = 0
  const repository = createPostgresMiniRoomRepository({
    async query() {
      queryCount += 1
      if (queryCount === 1) {
        throw Object.assign(new Error("duplicate key"), {
          code: "23505",
          constraint: "blumi_active_mini_room_participants_pkey"
        })
      }
      return { rows: [{ invite_id: "invite_2" }] }
    }
  })

  assert.equal(
    await repository.acceptPendingInvite({
      inviteId: "invite_2",
      decidedAt: "2026-07-14T10:00:00.000Z",
      miniRoom: {
        miniRoomId: "mini_room_2",
        lobbyRoomId: "public-lobby",
        participantUserIds: ["user_a", "user_c"],
        livekitRoomName: "blumi-room-2",
        startedAt: "2026-07-14T10:00:00.000Z"
      }
    }),
    "participant_busy"
  )
  assert.equal(queryCount, 2)
})

test("postgres setup rollback deletes the linked room and cancels its accepted invite", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresMiniRoomRepository({
    async query(text, values) {
      calls.push({ text, values })
      return { rows: [{ invite_id: "invite_1" }] }
    }
  })

  assert.equal(
    await repository.rollbackAcceptedMiniRoom({
      inviteId: "invite_1",
      miniRoomId: "mini_room_1",
      decidedAt: "2026-07-14T10:00:01.000Z"
    }),
    true
  )
  assert.match(calls[0]?.text ?? "", /DELETE FROM blumi_mini_rooms/)
  assert.match(calls[0]?.text ?? "", /invite_id = \$1/)
  assert.match(calls[0]?.text ?? "", /status = 'cancelled'/)
})

test("ending a postgres mini room releases its participant claims", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresMiniRoomRepository({
    async query(text, values) {
      calls.push({ text, values })
      return {
        rows: [{
          mini_room_id: "mini_room_1",
          lobby_room_id: "public-lobby",
          participant_a_user_id: "user_a",
          participant_b_user_id: "user_b",
          livekit_room_name: "blumi-room-1",
          started_at: "2026-07-14T10:00:00.000Z",
          ended_at: "2026-07-14T10:05:00.000Z",
          ended_by_user_id: "user_a",
          completion_reward_date: null,
          completion_requested_at: null,
          completion_requested_by_user_id: null
        }]
      }
    }
  })

  const ended = await repository.endMiniRoom(
    "mini_room_1",
    "user_a",
    "2026-07-14T10:05:00.000Z"
  )

  assert.equal(ended?.endedByUserId, "user_a")
  assert.equal(ended?.endedAt, "2026-07-14T10:05:00.000Z")
  assert.match(calls[0]?.text ?? "", /WITH ended_room AS/)
  assert.match(calls[0]?.text ?? "", /AND ended_at IS NULL/)
  assert.match(calls[0]?.text ?? "", /SELECT[\s\S]+FROM ended_room/)
  assert.match(
    calls[0]?.text ?? "",
    /DELETE FROM blumi_active_mini_room_participants/
  )
})

test("postgres completion intent anchors the first reward day atomically", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresMiniRoomRepository({
    async query(text, values) {
      calls.push({ text, values })
      return {
        rows: [{
          completion_reward_date: "2026-07-14",
          completion_requested_at: "2026-07-14T23:59:59.000Z",
          completion_requested_by_user_id: "user_a"
        }]
      }
    }
  })

  const intent = await repository.anchorMiniRoomCompletion({
    miniRoomId: "mini_room_1",
    requestedByUserId: "user_a",
    requestedAt: "2026-07-14T23:59:59.000Z",
    rewardDate: "2026-07-14"
  })

  assert.deepEqual(intent, {
    rewardDate: "2026-07-14",
    requestedAt: "2026-07-14T23:59:59.000Z",
    requestedByUserId: "user_a"
  })
  assert.match(calls[0]?.text ?? "", /completion_reward_date = COALESCE/)
  assert.match(calls[0]?.text ?? "", /completion_requested_at = COALESCE/)
  assert.match(calls[0]?.text ?? "", /ended_at IS NULL/)
  assert.match(calls[0]?.text ?? "", /participant_a_user_id/)
})
