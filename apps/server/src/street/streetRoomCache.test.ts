import assert from "node:assert/strict"
import test from "node:test"
import { createStreetRoomCache } from "./streetRoomCache"

test("rooms are read once per owner within the cache time and again after it", async () => {
  // Arrange
  let clock = 0
  const reads: string[][] = []
  const rooms = createStreetRoomCache({
    ttlMs: 15_000,
    now: () => clock,
    getMany: async (userIds) => {
      reads.push([...userIds])
      return new Map(userIds.filter((userId) => userId !== "no_room").map((userId) => [userId, `room:${userId}`]))
    }
  })
  // Act
  const first = await rooms(["a", "b", "no_room"])
  clock = 5_000
  const second = await rooms(["a", "b", "c", "no_room"])
  clock = 20_000
  await rooms(["a"])
  // Assert
  assert.deepEqual([...first.entries()], [["a", "room:a"], ["b", "room:b"]])
  assert.deepEqual([...second.keys()], ["a", "b", "c"])
  assert.deepEqual(reads, [["a", "b", "no_room"], ["c"], ["a"]], "only the new owner, then the expired one")
})
