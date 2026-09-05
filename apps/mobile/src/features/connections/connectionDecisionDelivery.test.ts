import assert from "node:assert/strict"
import test from "node:test"
import { ConnectionDecisionApiError } from "./connectionDecisionApi"
import {
  flushConnectionDecisionOutbox,
  queueConnectionDecisionDurably
} from "./connectionDecisionDelivery"
import type { ConnectionDecisionOutboxStorage } from "./connectionDecisionOutbox"

function createStorage(): ConnectionDecisionOutboxStorage & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    async getItem(key) { return values.get(key) ?? null },
    async setItem(key, value) { values.set(key, value) },
    async removeItem(key) { values.delete(key) }
  }
}

test("the delivery boundary retains transient failures and removes terminal server rejections", async () => {
  const storage = createStorage()
  const delivered: { miniRoomId: string; hasMatch: boolean }[] = []
  await queueConnectionDecisionDurably(
    { storage },
    { actorUserId: "ada", miniRoomId: "room_retry", partnerUserId: "bora", status: "saved" }
  )
  await queueConnectionDecisionDurably(
    { storage },
    { actorUserId: "ada", miniRoomId: "room_terminal", partnerUserId: "cora", status: "passed" }
  )
  const result = await flushConnectionDecisionOutbox({
    storage,
    async submit(intent) {
      throw intent.miniRoomId === "room_terminal"
        ? new ConnectionDecisionApiError("The room is no longer available.", false)
        : new Error("offline")
    }
  }, "ada")
  assert.deepEqual(result, { delivered: 0, pending: 1, rejectedMiniRoomIds: ["room_terminal"] })
  const retry = await flushConnectionDecisionOutbox({
    storage,
    async submit(intent) {
      return {
        decision: {
          miniRoomId: intent.miniRoomId,
          actorUserId: intent.actorUserId,
          partnerUserId: intent.partnerUserId,
          status: intent.status,
          decidedAt: "2026-07-22T12:00:00.000Z"
        },
        match: null
      }
    },
    onDelivered(intent, response) {
      delivered.push({ miniRoomId: intent.miniRoomId, hasMatch: response.match !== null })
    }
  }, "ada")
  assert.deepEqual(retry, { delivered: 1, pending: 0, rejectedMiniRoomIds: [] })
  assert.deepEqual(delivered, [{ miniRoomId: "room_retry", hasMatch: false }])
})

test("the delivery boundary exposes a mutual match to the caller that reconciles chat", async () => {
  const storage = createStorage()
  await queueConnectionDecisionDurably(
    { storage },
    { actorUserId: "ada", miniRoomId: "room_match", partnerUserId: "bora", status: "saved" }
  )
  let receivedMatchId: string | null = null
  await flushConnectionDecisionOutbox({
    storage,
    async submit(intent) {
      return {
        decision: {
          miniRoomId: intent.miniRoomId,
          actorUserId: intent.actorUserId,
          partnerUserId: intent.partnerUserId,
          status: intent.status,
          decidedAt: "2026-07-22T12:00:00.000Z"
        },
        match: {
          miniRoomId: intent.miniRoomId,
          participantUserIds: ["ada", "bora"],
          matchedAt: "2026-07-22T12:00:01.000Z"
        }
      }
    },
    onDelivered(_intent, response) {
      receivedMatchId = response.match?.miniRoomId ?? null
    }
  }, "ada")
  assert.equal(receivedMatchId, "room_match")
})
