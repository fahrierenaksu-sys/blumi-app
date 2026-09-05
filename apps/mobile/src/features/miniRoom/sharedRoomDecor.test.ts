import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { resolveSharedRoomDecor } from "./sharedRoomDecor"

test("shared room projection uses only accepted server decor and clones mutable items", () => {
  const room = {
    miniRoomId: "room", lobbyRoomId: "thread", livekitRoomName: "live", participantUserIds: ["a", "b"] as [string, string],
    sharedDecor: { ownerUserId: "a", capturedAt: "2026-09-05T00:00:00Z", revision: 2, source: "inviter" as const,
      decor: { roomShellId: "accepted-shell", placedItems: [{ instanceId: "one", itemId: "chair", x: 0.5, y: 0.7, rotation: "front" as const }] } }
  }
  const first = resolveSharedRoomDecor(room)
  const second = resolveSharedRoomDecor(room)
  assert.deepEqual(first, second)
  assert.equal(first.legacyFallback, false)
  first.decor.placedItems[0].x = 1
  assert.equal(second.decor.placedItems[0].x, 0.5)
  assert.equal(room.sharedDecor.decor.placedItems[0].x, 0.5)
})

test("legacy rooms show an explicit common default, never personal local decor", () => {
  const result = resolveSharedRoomDecor({ miniRoomId: "legacy", lobbyRoomId: "thread", livekitRoomName: "live", participantUserIds: ["a", "b"] })
  assert.equal(result.legacyFallback, true)
  assert.equal(result.decor.roomShellId, "room_v2_shell_blumi_world_v1")
  assert.deepEqual(result.decor.placedItems, [])
  const screen = readFileSync(
    resolve(process.cwd(), "src/screens/MiniRoomScreen.tsx"),
    "utf8"
  )
  assert.doesNotMatch(screen, /useRoomV2|decor: userRoomDecor/)
})
