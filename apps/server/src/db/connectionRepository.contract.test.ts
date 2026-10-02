import assert from "node:assert/strict"
import {
  createInMemoryConnectionRepository,
  type ConnectionRepository
} from "../connections/connectionRepository"
import { createPostgresConnectionRepository } from "./postgresConnectionRepository"
import { runRepositoryContract } from "./repositoryContract"

// Room match recovery (threadRoutes) must return only the requester's matches.
runRepositoryContract<ConnectionRepository>({
  name: "connection repository",
  databaseUrl: process.env.DATABASE_URL,
  factories: {
    inMemory: () => createInMemoryConnectionRepository(),
    postgres: (pool) => createPostgresConnectionRepository(pool)
  },
  cases: {
    "listMatchesForUser returns only the requester's matches, newest first": async ({ repository, id, ensureUsers }) => {
      const [ada, bora, cara, dan] = [id("ada"), id("bora"), id("cara"), id("dan")]
      await ensureUsers(ada, bora, cara, dan)
      await repository.saveMatch({
        miniRoomId: id("room_old"), participantUserIds: [ada, bora], matchedAt: "2026-09-29T09:00:00.000Z"
      })
      await repository.saveMatch({
        miniRoomId: id("room_other"), participantUserIds: [cara, dan], matchedAt: "2026-09-29T10:00:00.000Z"
      })
      await repository.saveMatch({
        miniRoomId: id("room_new"), participantUserIds: [cara, ada], matchedAt: "2026-09-29T11:00:00.000Z"
      })

      const matches = await repository.listMatchesForUser(ada)
      assert.deepEqual(matches.map((match) => match.miniRoomId), [id("room_new"), id("room_old")])
      for (const match of matches) assert.ok(match.participantUserIds.includes(ada))
      assert.deepEqual((await repository.listMatchesForUser(dan)).map((match) => match.miniRoomId), [id("room_other")])
      assert.deepEqual(await repository.listMatchesForUser(id("stranger")), [])
    },
    "findMatchBetween is symmetric and never matches a third person": async ({ repository, id, ensureUsers }) => {
      const [ada, bora, cara] = [id("ada"), id("bora"), id("cara")]
      await ensureUsers(ada, bora, cara)
      await repository.saveMatch({
        miniRoomId: id("room"), participantUserIds: [ada, bora], matchedAt: "2026-09-29T10:00:00.000Z"
      })
      assert.equal((await repository.findMatchBetween(ada, bora))?.miniRoomId, id("room"))
      assert.equal((await repository.findMatchBetween(bora, ada))?.miniRoomId, id("room"))
      assert.equal(await repository.findMatchBetween(ada, cara), null)
    }
  }
})
