import assert from "node:assert/strict"
import test from "node:test"
import type { ServerEvent } from "@blumi/contracts"
import {
  applyServerEventToLobbyState,
  createInitialLobbyState
} from "./lobbyState"
import {
  createLegacyLobbyJoinEvent,
  isLegacyPublicLobbyEnabled,
  PUBLIC_LOBBY_ROOM_ID,
  shouldApplyLobbyServerEvent
} from "./publicLobby"

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

// Owner decision 2026-09-30: production sessions never join the legacy public
// lobby and ignore lobby presence even if an older server still sends it.
function simulateLobbyJoinEffect(
  mode: "demo" | "production",
  statuses: readonly string[]
): unknown[] {
  const sent: unknown[] = []
  let alreadySent = false
  for (const connectionStatus of statuses) {
    const joinEvent = createLegacyLobbyJoinEvent({
      mode,
      connectionStatus,
      alreadySent,
      sessionToken: "session-token"
    })
    if (!joinEvent) continue
    alreadySent = true
    sent.push(joinEvent)
  }
  return sent
}

test("production sessions never send a public lobby room.join, including across reconnects", () => {
  assert.equal(isLegacyPublicLobbyEnabled("production"), false)
  assert.deepEqual(
    simulateLobbyJoinEffect("production", [
      "connecting",
      "connected",
      "disconnected",
      "reconnecting",
      "connected",
      "reconnecting",
      "connected"
    ]),
    []
  )
})

test("demo sessions keep their existing single-join behaviour", () => {
  assert.equal(isLegacyPublicLobbyEnabled("demo"), true)
  assert.deepEqual(simulateLobbyJoinEffect("demo", ["connecting", "connected", "reconnecting", "connected"]), [
    { type: "room.join", payload: { roomId: PUBLIC_LOBBY_ROOM_ID, sessionToken: "session-token" } }
  ])
})

test("production sessions ignore lobby presence, legacy invites, and lobby reactions", () => {
  const presenceUser = {
    userId: "user-b",
    displayName: "Mert",
    avatar: { presetId: "avatar_v2_body_default" },
    spotId: "seat-left",
    inMiniRoom: false
  }
  const lobbyEvents = [
    {
      type: "room.joined",
      payload: {
        roomId: PUBLIC_LOBBY_ROOM_ID,
        currentUserId: "user-a",
        assignedSpotId: "seat-right",
        layout: { roomId: PUBLIC_LOBBY_ROOM_ID, proximityRadius: 180, spots: [] },
        snapshot: { roomId: PUBLIC_LOBBY_ROOM_ID, users: [presenceUser], updatedAt: "2026-09-29T10:00:00.000Z" }
      }
    },
    {
      type: "presence.snapshot",
      payload: { roomId: PUBLIC_LOBBY_ROOM_ID, users: [presenceUser], updatedAt: "2026-09-29T10:00:00.000Z" }
    },
    {
      type: "presence.nearby",
      payload: {
        roomId: PUBLIC_LOBBY_ROOM_ID,
        userId: "user-a",
        nearbyUsers: [{ userId: "user-b", spotId: "seat-left", distance: 10, canInvite: true, blocked: false }]
      }
    },
    {
      type: "mini_room.invite_received",
      payload: {
        inviteId: "invite-1",
        roomId: PUBLIC_LOBBY_ROOM_ID,
        senderUserId: "user-b",
        recipientUserId: "user-a",
        createdAt: "2026-09-29T10:00:00.000Z"
      }
    },
    {
      type: "reaction.received",
      payload: {
        roomId: PUBLIC_LOBBY_ROOM_ID,
        actorUserId: "user-b",
        reaction: "wave",
        createdAt: "2026-09-29T10:00:00.000Z"
      }
    }
  ] as unknown as ServerEvent[]

  let state = createInitialLobbyState()
  for (const event of lobbyEvents) {
    assert.equal(shouldApplyLobbyServerEvent("production", event), false, event.type)
    assert.equal(shouldApplyLobbyServerEvent("demo", event), true, event.type)
    if (shouldApplyLobbyServerEvent("production", event)) {
      state = applyServerEventToLobbyState(state, event, "user-a")
    }
  }
  assert.equal(state.isJoined, false)
  assert.equal(state.snapshot, null)
  assert.deepEqual(state.interaction.nearbyUsers, [])
  assert.equal(state.interaction.incomingInvite, null)
  assert.deepEqual(state.interaction.recentReactions, [])
})

test("production sessions still receive room, chat, match, and safety events", () => {
  for (const type of [
    "mini_room.ready",
    "mini_room.ended",
    "chat.room_invite_updated",
    "chat.message_received",
    "chat.thread_created",
    "connection.matched",
    "safety.user_blocked",
    "realtime.error"
  ] as const) {
    assert.equal(
      shouldApplyLobbyServerEvent("production", { type, payload: {} } as unknown as ServerEvent),
      true,
      type
    )
  }
})
