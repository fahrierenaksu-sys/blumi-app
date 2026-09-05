import assert from "node:assert/strict"
import test from "node:test"
import { createInMemoryConnectionRepository } from "../connections/connectionRepository"
import {
  createInMemoryMatchRepository,
  createInMemoryMatchStore
} from "../matches/matchRepository"
import { findThreadAuthorization } from "./threadAuthorization"

test("thread authorization accepts persisted discovery matches", async () => {
  const matchRepository = createInMemoryMatchRepository(createInMemoryMatchStore([]))
  await matchRepository.createMatch({
    matchId: "match_one",
    participantUserIds: ["user_a", "user_b"],
    matchedAt: "2026-07-13T09:00:00.000Z"
  })

  assert.deepEqual(
    await findThreadAuthorization({
      participantUserIds: ["user_b", "user_a"],
      matchRepository
    }),
    {
      source: "match",
      sourceId: "match_one",
      miniRoomId: "match_match_one"
    }
  )
})

test("thread authorization accepts persisted mini-room connection matches", async () => {
  const matchRepository = createInMemoryMatchRepository(createInMemoryMatchStore([]))
  const connectionRepository = createInMemoryConnectionRepository()
  await connectionRepository.saveMatch({
    miniRoomId: "mini_room_one",
    participantUserIds: ["user_a", "user_b"],
    matchedAt: "2026-07-13T09:00:00.000Z"
  })

  assert.deepEqual(
    await findThreadAuthorization({
      participantUserIds: ["user_a", "user_b"],
      matchRepository,
      connectionRepository
    }),
    {
      source: "connection",
      sourceId: "mini_room_one",
      miniRoomId: "mini_room_one"
    }
  )
})

test("thread authorization rejects users without a persisted mutual match", async () => {
  const matchRepository = createInMemoryMatchRepository(createInMemoryMatchStore([]))
  const connectionRepository = createInMemoryConnectionRepository()

  assert.equal(
    await findThreadAuthorization({
      participantUserIds: ["user_a", "user_b"],
      matchRepository,
      connectionRepository
    }),
    null
  )
})
