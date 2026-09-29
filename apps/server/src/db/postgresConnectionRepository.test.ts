import assert from "node:assert/strict"
import test from "node:test"
import { createPostgresConnectionRepository } from "./postgresConnectionRepository"

test("postgres room match recovery is scoped to the requesting participant", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresConnectionRepository({
    async query(text, values) {
      calls.push({ text, values })
      return { rows: [{
        mini_room_id: "room_one",
        participant_a_user_id: "ada",
        participant_b_user_id: "bora",
        matched_at: "2026-09-29T10:00:00.000Z"
      }] }
    }
  })
  assert.deepEqual((await repository.listMatchesForUser("ada")).map((match) => match.miniRoomId), ["room_one"])
  assert.match(calls[0]?.text ?? "", /participant_a_user_id = \$1 OR participant_b_user_id = \$1/)
  assert.deepEqual(calls[0]?.values, ["ada"])
})
