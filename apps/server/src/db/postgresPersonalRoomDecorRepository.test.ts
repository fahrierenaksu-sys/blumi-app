import assert from "node:assert/strict"
import test from "node:test"
import {
  createPostgresPersonalRoomDecorRepository
} from "./postgresPersonalRoomDecorRepository"

test("postgres personal Room decor saves through one revision compare-and-swap", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = []
  const repository = createPostgresPersonalRoomDecorRepository({
    async query(text, values) {
      calls.push({ text, values })
      return {
        rows: [{
          user_id: "user_1",
          revision: 2,
          decor: {
            roomShellId: "room_v3_blush_petal_cottage",
            placedItems: []
          },
          updated_at: new Date("2026-07-26T12:00:00.000Z")
        }],
        rowCount: 1
      }
    }
  })

  const result = await repository.save({
    userId: "user_1",
    expectedRevision: 1,
    decor: {
      roomShellId: "room_v3_blush_petal_cottage",
      placedItems: []
    },
    updatedAt: "2026-07-26T12:00:00.000Z"
  })

  assert.equal(result.kind, "saved")
  assert.match(calls[0]?.text ?? "", /UPDATE blumi_personal_room_decor/)
  assert.doesNotMatch(calls[0]?.text ?? "", /WHERE \$2 = 0/)
  assert.match(
    calls[0]?.text ?? "",
    /blumi_personal_room_decor\.revision = \$2/
  )
  assert.equal(calls[0]?.values?.[1], 1)
})
