import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import {
  applyServerEventToLobbyState,
  createInitialLobbyState
} from "./lobbyState"

test("mini-room ready keeps server-authoritative participant avatars", () => {
  const event: ServerEvent = {
    type: "mini_room.ready",
    payload: {
      miniRoom: {
        miniRoomId: "mini-room-1",
        lobbyRoomId: "public-lobby",
        participantUserIds: ["user-a", "user-b"],
        livekitRoomName: "room-1"
      },
      mediaSession: {
        miniRoomId: "mini-room-1",
        livekitUrl: "wss://livekit.example.test",
        token: "token",
        issuedAt: "2026-07-13T10:00:00.000Z"
      },
      participants: [
        {
          userId: "user-a",
          displayName: "Ada",
          avatar: { presetId: "avatar_v2_body_default" }
        },
        {
          userId: "user-b",
          displayName: "Mert",
          avatar: { presetId: "avatar_v2_body_male_light" }
        }
      ]
    }
  }

  const next = applyServerEventToLobbyState(
    createInitialLobbyState(),
    event,
    "user-a"
  )

  assert.deepEqual(next.interaction.readyMiniRoom?.participants, event.payload.participants)
})
