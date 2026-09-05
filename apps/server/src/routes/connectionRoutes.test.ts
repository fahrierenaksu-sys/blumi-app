import assert from "node:assert/strict"
import test from "node:test"
import {
  ConnectionDecisionUnavailableError,
  type ConnectionService
} from "../connections/connectionService"
import type { ConnectionDecisionInput } from "../connections/connectionService"
import { createAuthService } from "../auth/authService"
import { createServer } from "../server"

const PHONE = "+905551117777"
const CODE = "482931"

test("connection decision endpoint is authenticated, validates input, and delegates the durable decision", async () => {
  const authService = createAuthService({ codeFactory: () => CODE })
  const calls: Array<{ actorUserId: string; input: unknown }> = []
  let serviceError: Error | null = null
  const connectionService = {
    repository: {},
    async decide(actorUserId: string, input: ConnectionDecisionInput) {
      if (serviceError) throw serviceError
      calls.push({ actorUserId, input: { ...input } })
      return {
        decision: {
          miniRoomId: input.miniRoomId,
          actorUserId,
          partnerUserId: input.partnerUserId,
          status: input.status,
          decidedAt: "2026-07-22T12:00:00.000Z"
        },
        match: null
      }
    }
  } as unknown as ConnectionService
  const app = createServer({ authService, connectionService })
  try {
    assert.equal(
      (await app.inject({ method: "POST", url: "/v1/connections/decision" })).statusCode,
      401
    )
    await authService.sendCode(PHONE)
    const signedIn = await app.inject({
      method: "POST",
      url: "/v1/accounts/register",
      payload: { termsAcceptance: { version: "test-terms-v1", locale: "tr" }, phoneNumber: PHONE, verificationCode: CODE }
    })
    const headers = { authorization: `Bearer ${signedIn.json().session.sessionToken}` }
    assert.equal(
      (await app.inject({
        method: "POST",
        url: "/v1/connections/decision",
        headers,
        payload: { miniRoomId: "room_1", partnerUserId: "partner", status: "later" }
      })).statusCode,
      400
    )
    const accepted = await app.inject({
      method: "POST",
      url: "/v1/connections/decision",
      headers,
      payload: { miniRoomId: "room_1", partnerUserId: "partner", status: "saved" }
    })
    assert.equal(accepted.statusCode, 200)
    assert.equal(accepted.json().decision.status, "saved")
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0]?.input, {
      miniRoomId: "room_1",
      partnerUserId: "partner",
      status: "saved"
    })
    serviceError = new ConnectionDecisionUnavailableError()
    assert.equal((await app.inject({
      method: "POST",
      url: "/v1/connections/decision",
      headers,
      payload: { miniRoomId: "room_1", partnerUserId: "partner", status: "passed" }
    })).statusCode, 409)
    serviceError = new Error("database unavailable")
    const unavailable = await app.inject({
      method: "POST",
      url: "/v1/connections/decision",
      headers,
      payload: { miniRoomId: "room_1", partnerUserId: "partner", status: "passed" }
    })
    assert.equal(unavailable.statusCode, 503)
    assert.equal(unavailable.json().error, "Connection decisions are temporarily unavailable.")
  } finally {
    await app.close()
  }
})
