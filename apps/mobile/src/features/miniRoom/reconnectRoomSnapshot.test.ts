import assert from "node:assert/strict"
import test from "node:test"
import type { MediaSessionToken, MiniRoom } from "@blumi/contracts"
import { mergeMiniRoomReconnectSnapshot } from "./reconnectRoomSnapshot"

const room = (miniRoomId: string): MiniRoom => ({
  miniRoomId,
  lobbyRoomId: "lobby",
  participantUserIds: ["you", "partner"],
  livekitRoomName: "room-livekit"
})

const mediaSession = {
  miniRoomId: "room-a",
  livekitUrl: "wss://media.invalid",
  token: "stub-media",
  issuedAt: "2026-09-29T12:00:00.000Z"
} as MediaSessionToken

test("refreshes the accepted snapshot and participants without rotating media credentials", () => {
  const participants = { you: "you", partner: "refreshed partner" }
  const result = mergeMiniRoomReconnectSnapshot({
    current: {
      readyMiniRoom: { miniRoom: room("room-a"), mediaSession },
      participants: { you: "you", partner: "old partner" }
    },
    refreshedMiniRoom: { ...room("room-a"), sharedDecor: undefined },
    refreshedParticipants: participants
  })

  assert.ok(result)
  assert.equal(result.readyMiniRoom.mediaSession, mediaSession)
  assert.equal(result.readyMiniRoom.miniRoom.miniRoomId, "room-a")
  assert.equal(result.participants, participants)
})

test("rejects a late refresh for a different room instead of replacing route state", () => {
  const result = mergeMiniRoomReconnectSnapshot({
    current: {
      readyMiniRoom: { miniRoom: room("room-a"), mediaSession },
      participants: { you: "you", partner: "partner" }
    },
    refreshedMiniRoom: room("room-b"),
    refreshedParticipants: { you: "someone else", partner: "other partner" }
  })

  assert.equal(result, null)
})
