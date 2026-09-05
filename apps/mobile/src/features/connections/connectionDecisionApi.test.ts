import assert from "node:assert/strict"
import test from "node:test"
import {
  ConnectionDecisionApiError,
  isRetryableConnectionDecisionError,
  submitConnectionDecision
} from "./connectionDecisionApi"

test("submits a connection decision with bearer auth and validates the response", async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const result = await submitConnectionDecision(
    "https://api.blumi.test/",
    "session_token",
    { miniRoomId: "room_1", partnerUserId: "bora", status: "saved" },
    async (url, init) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({
        decision: {
          miniRoomId: "room_1",
          actorUserId: "ada",
          partnerUserId: "bora",
          status: "saved",
          decidedAt: "2026-07-22T12:00:00.000Z"
        },
        match: null
      }), { status: 200 })
    }
  )
  assert.equal(calls[0]?.url, "https://api.blumi.test/v1/connections/decision")
  assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, "Bearer session_token")
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    miniRoomId: "room_1",
    partnerUserId: "bora",
    status: "saved"
  })
  assert.equal(result.decision.actorUserId, "ada")
})

test("rejects malformed and terminal API responses", async () => {
  await assert.rejects(
    submitConnectionDecision(
      "https://api.blumi.test",
      "session_token",
      { miniRoomId: "room_1", partnerUserId: "bora", status: "saved" },
      async () => new Response(JSON.stringify({ error: "That room ended." }), { status: 400 })
    ),
    (error: unknown) => {
      assert.ok(error instanceof ConnectionDecisionApiError)
      assert.equal(isRetryableConnectionDecisionError(error), false)
      return true
    }
  )
  await assert.rejects(
    submitConnectionDecision(
      "https://api.blumi.test",
      "session_token",
      { miniRoomId: "room_1", partnerUserId: "bora", status: "saved" },
      async () => new Response(JSON.stringify({ decision: {} }), { status: 200 })
    ),
    (error: unknown) => {
      assert.ok(error instanceof ConnectionDecisionApiError)
      assert.equal(isRetryableConnectionDecisionError(error), false)
      return true
    }
  )
})

test("accepts a mutual match and preserves malformed JSON as a request failure", async () => {
  const matched = await submitConnectionDecision(
    "https://api.blumi.test",
    "session_token",
    { miniRoomId: "room_1", partnerUserId: "bora", status: "saved" },
    async () => new Response(JSON.stringify({
      decision: {
        miniRoomId: "room_1",
        actorUserId: "ada",
        partnerUserId: "bora",
        status: "saved",
        decidedAt: "2026-07-22T12:00:00.000Z"
      },
      match: {
        miniRoomId: "room_1",
        participantUserIds: ["ada", "bora"],
        matchedAt: "2026-07-22T12:00:01.000Z"
      }
    }), { status: 200 })
  )
  assert.deepEqual(matched.match?.participantUserIds, ["ada", "bora"])
  await assert.rejects(
    submitConnectionDecision(
      "https://api.blumi.test",
      "session_token",
      { miniRoomId: "room_1", partnerUserId: "bora", status: "saved" },
      async () => new Response("not json", { status: 503 })
    ),
    (error: unknown) => {
      assert.ok(error instanceof ConnectionDecisionApiError)
      assert.equal(isRetryableConnectionDecisionError(error), true)
      return true
    }
  )
})
