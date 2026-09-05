import assert from "node:assert/strict"
import test from "node:test"
import { trySendLobbyInvite } from "./lobbyInviteAttempt"

test("an unavailable realtime connection cannot report an invite as sent", () => {
  let sendCalls = 0

  const sent = trySendLobbyInvite({
    connectionStatus: "disconnected",
    isJoined: true,
    roomId: "lobby:one",
    recipientUserId: "user-two",
    send: () => {
      sendCalls += 1
      return false
    }
  })

  assert.equal(sent, false)
  assert.equal(sendCalls, 0)
})

test("an invite reports success only after the transport accepts the event", () => {
  const events: unknown[] = []

  const sent = trySendLobbyInvite({
    connectionStatus: "connected",
    isJoined: true,
    roomId: "lobby:one",
    recipientUserId: "user-two",
    send: (event) => {
      events.push(event)
      return true
    }
  })

  assert.equal(sent, true)
  assert.deepEqual(events, [{
    type: "mini_room.invite",
    payload: {
      roomId: "lobby:one",
      recipientUserId: "user-two"
    }
  }])
})

test("a synchronous transport failure does not produce optimistic success", () => {
  const sent = trySendLobbyInvite({
    connectionStatus: "connected",
    isJoined: true,
    roomId: "lobby:one",
    recipientUserId: "user-two",
    send: () => {
      throw new Error("socket closed")
    }
  })

  assert.equal(sent, false)
})

test("a transport rejection does not produce optimistic success", () => {
  const sent = trySendLobbyInvite({
    connectionStatus: "connected",
    isJoined: true,
    roomId: "lobby:one",
    recipientUserId: "user-two",
    send: () => false
  })

  assert.equal(sent, false)
})
